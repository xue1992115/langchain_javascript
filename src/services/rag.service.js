/**
 * 低空经济 RAG（检索增强生成）服务
 *
 * 架构：文本分割 → Embeddings → 向量检索 → LLM 生成
 *
 * 嵌入引擎支持两种模式：
 *   1. OpenAIEmbeddings（通过 MiniMax 兼容 API）— 推荐，有语义理解能力
 *   2. LocalChineseEmbeddings（本地 n-gram 特征哈希）— 降级兜底，无需外部 API
 *
 * PDF 文档加载通过 knowledge-loader.js 实现，放入 src/knowledge/ 目录即可。
 */

import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { config } from "../config/index.js";
import { getLLM } from "./llm-service.js";
import { getKnowledgeDocuments } from "./knowledge-base.js";

// ======================== 单例 ========================
let _vectorStore = null;

/** @type {Promise<void> | null} 构建中的锁，防止并发重复构建 */
let _buildingLock = null;

// ======================== 嵌入引擎（双模式） ========================

/**
 * 创建远程 Embeddings 实例（MiniMax 兼容 OpenAI API）
 * 支持语义理解，能处理同义词、近义词匹配
 */
function createRemoteEmbeddings() {
  return new OpenAIEmbeddings({
    model: config.embeddings.minimax.model,
    apiKey: config.embeddings.minimax.apiKey,
    configuration: {
      baseURL: config.embeddings.minimax.baseUrl,
    },
    // MiniMax embedding 维度固定为 1536
    dimensions: 1536,
  });
}

/**
 * 本地中文文本嵌入引擎（改进版）
 *
 * 使用改进的 TF-IDF 风格 n-gram 特征哈希。
 * 作为远程 Embedding API 不可用时的降级方案。
 */
class LocalChineseEmbeddings {
  constructor(dimensions = 512) {
    this.dimensions = dimensions;
    this._commonChars = new Set(
      "的一是不了人我在有他这之来中以个为上们说到时大地也会子就你去看过小可出会都对多后能手下好心而长安".split("")
    );
  }

  async embedQuery(text) {
    return this._textToVector(text, 1.0);
  }

  async embedDocuments(texts) {
    return texts.map((text) => this._textToVector(text, 1.0));
  }

  _hash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
    }
    return hash;
  }

  _extractFeatures(text) {
    const features = new Map();
    const normalized = text.replace(/\s+/g, "");
    if (normalized.length === 0) return features;

    for (let i = 0; i < normalized.length - 3; i++) {
      const gram = normalized.slice(i, i + 4);
      features.set(gram, (features.get(gram) || 0) + 4);
    }
    for (let i = 0; i < normalized.length - 2; i++) {
      const gram = normalized.slice(i, i + 3);
      features.set(gram, (features.get(gram) || 0) + 3);
    }
    for (let i = 0; i < normalized.length - 1; i++) {
      const gram = normalized.slice(i, i + 2);
      const weight =
        gram.split("").every((c) => this._commonChars.has(c)) ? 1 : 2;
      features.set(gram, (features.get(gram) || 0) + weight);
    }
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized[i];
      if (!this._commonChars.has(char)) {
        features.set(char, (features.get(char) || 0) + 0.5);
      }
    }
    return features;
  }

  _textToVector(text, corpusIdfWeight = 1.0) {
    const vec = new Float64Array(this.dimensions).fill(0);
    const features = this._extractFeatures(text);
    if (features.size === 0) return Array.from(vec);

    for (const [gram, freq] of features) {
      const hash = this._hash(gram + gram.length);
      const idx = Math.abs(hash) % this.dimensions;
      const sign = hash > 0 ? 1 : -1;
      const tfWeight = Math.log(1 + freq);
      vec[idx] += sign * tfWeight * corpusIdfWeight;
    }

    let norm = 0;
    for (let i = 0; i < this.dimensions; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < this.dimensions; i++) vec[i] /= norm;
    }
    return Array.from(vec);
  }
}

/**
 * 创建最佳的可用嵌入引擎
 * 优先使用远程 Embedding API（语义检索），失败时降级到本地引擎
 */
async function createBestEmbeddings() {
  // 如果配置了 API key，尝试远程 embeddings
  if (config.embeddings.minimax.apiKey) {
    try {
      const remote = createRemoteEmbeddings();
      // 快速验证：用简单文本测试 API 是否可达
      await remote.embedQuery("test");
      console.log("[RAG] 🔌 使用远程 Embedding API（MiniMax）");
      return remote;
    } catch (error) {
      console.warn(
        "[RAG] ⚠️ 远程 Embedding API 不可用，降级到本地引擎:",
        error.message
      );
    }
  }

  console.log("[RAG] 💻 使用本地嵌入引擎（n-gram）");
  return new LocalChineseEmbeddings(512);
}

// ======================== 文本分割 ========================

/**
 * 递归字符文本分割器
 * 按优先级分割：段落 > 句子 > 逗号句 > 字符
 */
function splitText(text, chunkSize = 500, chunkOverlap = 50) {
  const separators = ["\n\n", "\n", "。", "！", "？", "，", "；", " "];

  function recursiveSplit(content, depth = 0) {
    if (content.length <= chunkSize || depth >= separators.length) {
      return content.length > 0 ? [content] : [];
    }

    const sep = separators[depth];
    const parts = content.split(sep);
    const chunks = [];
    let current = "";

    for (const part of parts) {
      const separatorNeeded = current.length > 0 ? sep : "";
      const candidate = current + separatorNeeded + part;

      if (candidate.length <= chunkSize) {
        current = candidate;
      } else {
        if (current.length > 0) {
          chunks.push(current);
        }
        if (part.length > chunkSize) {
          const subChunks = recursiveSplit(part, depth + 1);
          // 取最后一个子块作为当前累积，前面已完成的子块全部输出
          if (subChunks.length > 0) {
            current = subChunks.pop() || part.slice(0, chunkSize);
            chunks.push(...subChunks);
          } else {
            current = part.slice(0, chunkSize);
          }
        } else {
          current = part;
        }
      }
    }

    if (current.length > 0) {
      chunks.push(current);
    }

    // 应用重叠：从第二个块开始，每个块前面接上一个块的尾部
    if (chunks.length > 1 && chunkOverlap > 0) {
      for (let i = 1; i < chunks.length; i++) {
        const prev = chunks[i - 1];
        const overlapText = prev.slice(-chunkOverlap);
        chunks[i] = overlapText + chunks[i];
      }
    }

    return chunks;
  }

  return recursiveSplit(text);
}

/**
 * 分割知识文档为文本块
 */
async function splitDocuments(docs) {
  const result = [];

  for (const doc of docs) {
    const chunks = splitText(
      doc.pageContent,
      config.rag.chunkSize,
      config.rag.chunkOverlap
    );

    for (let i = 0; i < chunks.length; i++) {
      result.push(
        new Document({
          pageContent: chunks[i],
          metadata: {
            ...doc.metadata,
            chunkIndex: i,
            totalChunks: chunks.length,
          },
        })
      );
    }
  }

  return result;
}

// ======================== 向量存储 ========================

/**
 * 内存向量存储
 * 存储文档及其向量，支持余弦相似度检索
 */
class SimpleVectorStore {
  constructor(embeddings) {
    this.embeddings = embeddings;
    this.documents = [];
    this.vectors = [];
  }

  /**
   * 添加文档
   */
  async addDocuments(docs) {
    const texts = docs.map((d) => d.pageContent);
    const vectors = await this.embeddings.embedDocuments(texts);

    for (let i = 0; i < docs.length; i++) {
      this.documents.push(docs[i]);
      this.vectors.push(vectors[i]);
    }
  }

  /**
   * 从文档批量构建向量存储
   */
  static async fromDocuments(docs, embeddings) {
    const store = new SimpleVectorStore(embeddings);
    await store.addDocuments(docs);
    return store;
  }

  /**
   * 清空所有文档
   */
  clear() {
    this.documents = [];
    this.vectors = [];
  }

  /**
   * 计算余弦相似度
   */
  _cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dotProduct / denom;
  }

  /**
   * 相似度检索
   */
  async similaritySearch(query, k = 4) {
    if (this.vectors.length === 0) return [];

    const queryVector = await this.embeddings.embedQuery(query);

    const similarities = this.vectors.map((vec, i) => ({
      index: i,
      score: this._cosineSimilarity(queryVector, vec),
    }));

    similarities.sort((a, b) => b.score - a.score);
    const topK = similarities.slice(0, k);

    return topK.map((s) => ({
      document: this.documents[s.index],
      score: s.score,
    }));
  }

  /**
   * 作为检索器使用
   */
  asRetriever(k = 4) {
    return {
      invoke: async (query) => {
        const results = await this.similaritySearch(query, k);
        return results.map((r) => r.document);
      },
    };
  }

  get count() {
    return this.vectors.length;
  }
}

// ======================== 向量存储管理 ========================

/**
 * 将知识文档向量化并存入内存向量存储
 *
 * 使用 buildingLock 防止并发请求时重复构建（竞态条件）
 */
export async function buildVectorStore(force = false) {
  // 已有缓存且非强制重建 → 直接返回
  if (_vectorStore && !force) {
    return _vectorStore;
  }

  // 正在构建中 → 等待现有构建完成
  if (_buildingLock) {
    if (!force) {
      await _buildingLock;
      return _vectorStore;
    }
    // 强制重建：等待当前构建完成后再重建
    await _buildingLock.catch(() => {});
  }

  _buildingLock = (async () => {
    console.log("[RAG] 🏗️  正在构建向量存储...");

    // 1. 获取知识文档（合并内置文档和外部 PDF）
    let rawDocs;
    try {
      const { loadAllDocuments } = await import("./knowledge-loader.js");
      rawDocs = await loadAllDocuments();
      // rawDocs debugging log removed
    } catch {
      rawDocs = getKnowledgeDocuments();
    }

    if (rawDocs.length === 0) {
      throw new Error("知识库为空，无法构建向量存储");
    }

    // 2. 文本分割
    const docs = await splitDocuments(rawDocs);
    console.log(
      `[RAG] 📄 文档分割完成：${rawDocs.length} 篇 -> ${docs.length} 个文本块`
    );

    // 3. 创建嵌入引擎
    const embeddings = await createBestEmbeddings();

    // 4. 构建向量存储
    console.log(`[RAG] 🔢 正在向量化 ${docs.length} 个文本块...`);
    _vectorStore = await SimpleVectorStore.fromDocuments(docs, embeddings);

    console.log(
      `[RAG] ✅ 向量存储构建完成，共 ${_vectorStore.count} 个向量索引`
    );
  })();

  try {
    await _buildingLock;
  } finally {
    _buildingLock = null;
  }

  return _vectorStore;
}

/**
 * 获取当前向量存储实例
 */
export async function getVectorStore() {
  if (!_vectorStore) {
    return buildVectorStore();
  }
  return _vectorStore;
}

// ======================== 系统状态 ========================

/**
 * 获取 RAG 系统状态
 */
export async function getRAGStatus() {
  const vectorStore = await getVectorStore();
  return {
    status: "ready",
    vectorCount: vectorStore.count,
    knowledgeBaseSize: getKnowledgeDocuments().length,
    chunkSize: config.rag.chunkSize,
    chunkOverlap: config.rag.chunkOverlap,
    topK: config.rag.topK,
  };
}

// ======================== SSE 流式 RAG ========================

/**
 * 流式 RAG 问答（回调模式）
 *
 * 逐步调用 onEvent 回调，让前端实时展示检索进度和 LLM 生成内容。
 *   type: "status"  — 进度提示
 *   type: "sources" — 知识来源列表
 *   type: "token"   — LLM 逐 token 输出
 *   type: "done"    — 完成信号
 *   type: "error"   — 错误信号
 *
 * @param {Array<{role: string, content: string}>} messages - 对话历史
 * @param {(event: {type: string, data: any}) => void} onEvent - 事件回调
 */
export async function streamRAGChat(messages, onEvent) {
  // 1. 获取最后一条用户消息
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMsg) {
    onEvent({ type: "error", data: { message: "缺少用户消息" } });
    return;
  }
  const query = lastUserMsg.content;

  // 2. 进度：通知前端正在检索
  onEvent({ type: "status", data: { message: "🔍 正在检索知识库..." } });

  let relevantDocs, context, sources;
  try {
    const vectorStore = await getVectorStore();
    const retriever = vectorStore.asRetriever(config.rag.topK);
    relevantDocs = await retriever.invoke(query);
    console.log(relevantDocs, 'relevantDocsrelevantDocsrelevantDocs')
    context = relevantDocs.map((d) => d.pageContent).join("\n\n---\n\n");
    sources = [...new Set(relevantDocs.map((d) => d.metadata?.title).filter(Boolean))];
  } catch (err) {
    onEvent({ type: "status", data: { message: "⚠️ 检索失败，将仅使用模型自身知识" } });
    context = "";
    sources = [];
  }
  console.log(context, 'asdlfalsdkfl')

  // 3. 推送来源信息
  onEvent({ type: "sources", data: sources });
  onEvent({ type: "status", data: { message: "🤖 正在生成回答..." } });

  // 4. 构建 LLM 消息
  const llm = await getLLM("minimax", { temperature: 0.3 });

  const systemContent = context
    ? `你是一位专业、全面的低空经济领域专家助手。请你基于以下提供的参考资料，回答用户的问题。

回答要求：
1. 主要基于提供的参考资料进行回答，确保准确性和专业性
2. 如果参考资料不足以回答问题，可以结合你自己的知识进行补充，但要说明哪些是参考资料以外的内容
3. 回答要结构化、条理清晰，适当使用标题和列表
4. 引用参考资料时，可以提及对应的类别或主题
5. 对于数据、法规、政策等内容，尽量给出具体的数字和时间

参考资料：
${context}`
    : `你是一位专业、全面的低空经济领域专家助手。请你回答用户的问题。

回答要求：
1. 回答要结构化、条理清晰，适当使用标题和列表
2. 如果问题涉及数据、法规、政策等内容，请注明可能不是最新信息`;

  const conversationMessages = [
    new SystemMessage(systemContent),
    ...messages.map((m) =>
      m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
    ),
  ];

  // 5. 流式输出
  try {
    const stream = await llm.stream(conversationMessages);
    for await (const chunk of stream) {
      const token = chunk.content;
      if (token) {
        onEvent({ type: "token", data: { token } });
      }
    }
  } catch (err) {
    onEvent({ type: "error", data: { message: `LLM 调用失败: ${err.message}` } });
    return;
  }

  onEvent({ type: "done", data: {} });
}
