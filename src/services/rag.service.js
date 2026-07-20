/**
 * 低空经济 RAG（检索增强生成）服务
 *
 * 自实现轻量级 RAG 系统：
 * 文本分割 → Embeddings → 向量检索 → LLM 生成
 *
 * 使用本地字符级嵌入（对中文效果良好），无需外部 Embedding API。
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { Document } from "@langchain/core/documents";
import { config } from "../config/index.js";
import { getKnowledgeDocuments } from "./knowledge-base.js";

// ======================== 单例 ========================
let _vectorStore = null;
let _retrievalChain = null;

// ======================== 本地嵌入引擎 ========================

/**
 * 本地中文文本嵌入引擎（改进版）
 *
 * 使用改进的 TF-IDF 风格 n-gram 特征哈希。
 * 对中文关键词（2-4字组合）有更好的区分度。
 */
class LocalChineseEmbeddings {
  /**
   * @param {number} dimensions - 嵌入向量维度
   */
  constructor(dimensions = 512) {
    this.dimensions = dimensions;
    // 常见中文字符和停用词，降低基础权重
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

  /**
   * 改进的 djb2 哈希函数，分布更均匀
   */
  _hash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
    }
    return hash;
  }

  /**
   * 提取 n-gram 特征及其权重
   */
  _extractFeatures(text) {
    const features = new Map();
    const normalized = text.replace(/\s+/g, "");

    if (normalized.length === 0) return features;

    // 1. 4-gram（四字词 — 最匹配中文成语/术语/关键词）
    for (let i = 0; i < normalized.length - 3; i++) {
      const gram = normalized.slice(i, i + 4);
      features.set(gram, (features.get(gram) || 0) + 4);
    }

    // 2. 3-gram（三字词 — 匹配中文核心词汇）
    for (let i = 0; i < normalized.length - 2; i++) {
      const gram = normalized.slice(i, i + 3);
      features.set(gram, (features.get(gram) || 0) + 3);
    }

    // 3. 2-gram（二字词）
    for (let i = 0; i < normalized.length - 1; i++) {
      const gram = normalized.slice(i, i + 2);
      // 如果两个字都是常用字，降权
      const weight = normalized.slice(i, i + 2).split("").every(c => this._commonChars.has(c)) ? 1 : 2;
      features.set(gram, (features.get(gram) || 0) + weight);
    }

    // 4. 单字特征（仅对非常用字赋予权重）
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized[i];
      if (!this._commonChars.has(char)) {
        features.set(char, (features.get(char) || 0) + 0.5);
      }
    }

    return features;
  }

  /**
   * 文本 → 特征向量
   * 使用特征哈希 + IDC（逆文档频次模拟）加权
   */
  _textToVector(text, corpusIdfWeight = 1.0) {
    const vec = new Float64Array(this.dimensions).fill(0);
    const features = this._extractFeatures(text);

    if (features.size === 0) return Array.from(vec);

    // 将特征哈希到向量维度，使用正负号保持区分度
    for (const [gram, freq] of features) {
      const hash = this._hash(gram + gram.length);
      const idx = Math.abs(hash) % this.dimensions;
      // 使用 hash 的符号位来增加向量表达能力
      const sign = hash > 0 ? 1 : -1;
      // TF 加权：log(1 + freq) 平滑
      const tfWeight = Math.log(1 + freq);
      vec[idx] += sign * tfWeight * corpusIdfWeight;
    }

    // L2 归一化
    let norm = 0;
    for (let i = 0; i < this.dimensions; i++) {
      norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < this.dimensions; i++) {
        vec[i] /= norm;
      }
    }

    return Array.from(vec);
  }
}

/**
 * 创建嵌入引擎实例
 */
function createEmbeddings() {
  return new LocalChineseEmbeddings(512);
}

// ======================== 文本分割 ========================

/**
 * 简单的递归字符文本分割器
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
        // 如果单个部分已经超过 chunkSize，递归用更细的分隔符
        if (part.length > chunkSize) {
          const subChunks = recursiveSplit(part, depth + 1);
          // 重叠：保留上一个 chunk 的尾部作为当前的前缀
          current = subChunks.pop() || part.slice(0, chunkSize);
          chunks.push(...subChunks);
        } else {
          current = part;
        }
      }
    }

    if (current.length > 0) {
      chunks.push(current);
    }

    // 应用重叠
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
 * 简单的内存向量存储
 * 存储文档及其向量，支持余弦相似度检索
 */
class SimpleVectorStore {
  constructor(embeddings) {
    this.embeddings = embeddings;
    this.documents = [];
    this.vectors = [];
  }

  /**
   * 添加文档（先向量化再存储）
   */
  async addDocuments(docs) {
    const texts = docs.map((d) => d.pageContent);

    // 批量向量化
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
   * 相似度检索：查询向量，返回 topK 个最相似的文档
   */
  async similaritySearch(query, k = 4) {
    const queryVector = await this.embeddings.embedQuery(query);

    // 计算所有文档与查询的相似度
    const similarities = this.vectors.map((vec, i) => ({
      index: i,
      score: this._cosineSimilarity(queryVector, vec),
    }));

    // 按相似度降序排序，取前 k 个
    similarities.sort((a, b) => b.score - a.score);
    const topK = similarities.slice(0, k);

    return topK.map((s) => ({
      document: this.documents[s.index],
      score: s.score,
    }));
  }

  /**
   * 作为检索器使用（兼容 LangChain 风格）
   */
  asRetriever(k = 4) {
    return {
      invoke: async (query) => {
        const results = await this.similaritySearch(query, k);
        return results.map((r) => r.document);
      },
    };
  }

  /**
   * 获取向量数量
   */
  get count() {
    return this.vectors.length;
  }
}

// ======================== 向量存储管理 ========================

/**
 * 将知识文档向量化并存入内存向量存储
 */
export async function buildVectorStore(force = false) {
  if (_vectorStore && !force) {
    return _vectorStore;
  }

  console.log("[RAG] 🏗️  正在构建向量存储...");

  // 1. 获取知识文档
  const rawDocs = getKnowledgeDocuments();
  if (rawDocs.length === 0) {
    throw new Error("知识库为空，无法构建向量存储");
  }

  // 2. 文本分割
  const docs = await splitDocuments(rawDocs);
  console.log(`[RAG] 📄 文档分割完成：${rawDocs.length} 篇 -> ${docs.length} 个文本块`);

  // 3. 创建 Embeddings 实例
  const embeddings = createEmbeddings();

  // 4. 构建向量存储
  console.log(`[RAG] 🔢 正在向量化 ${docs.length} 个文本块...`);
  _vectorStore = await SimpleVectorStore.fromDocuments(docs, embeddings);

  console.log(`[RAG] ✅ 向量存储构建完成，共 ${_vectorStore.count} 个向量索引`);

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

// ======================== 检索问答链 ========================

/**
 * 创建 RAG 检索问答链
 * 流程：用户问题 → 向量检索 → 注入上下文 → LLM 生成回答
 */
export async function createRAGChain() {
  if (_retrievalChain) {
    return _retrievalChain;
  }

  // 1. 确保向量存储已构建
  const vectorStore = await getVectorStore();
  const retriever = vectorStore.asRetriever(config.rag.topK);

  // 2. 创建 LLM（使用 DeepSeek，单参数传递）
  const llm = new ChatOpenAI({
    model: config.llm.deepseek.model,
    temperature: 0.3,
    apiKey: config.llm.deepseek.apiKey,
    configuration: {
      baseURL: config.llm.deepseek.baseUrl,
    },
  });

  // 3. 构建提示模板
  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `你是一位专业、全面的低空经济领域专家助手。请你基于以下提供的参考资料，回答用户关于低空经济的问题。

回答要求：
1. 主要基于提供的参考资料进行回答，确保准确性和专业性
2. 如果参考资料不足以回答问题，可以结合你自己的知识进行补充，但要说明哪些是参考资料以外的内容
3. 回答要结构化、条理清晰，适当使用标题和列表
4. 引用参考资料时，可以提及对应的类别或主题
5. 对于数据、法规、政策等内容，尽量给出具体的数字和时间

参考资料：
{context}`,
    ],
    ["human", "{input}"],
  ]);

  // 4. 保存检索链（一个可调用的函数）
  _retrievalChain = async (query) => {
    // 检索相关文档
    const relevantDocs = await retriever.invoke(query);

    // 合并上下文
    const context = relevantDocs.map((d) => d.pageContent).join("\n\n---\n\n");

    // 构建 prompt 并调用 LLM
    const formattedPrompt = await prompt.formatMessages({
      context,
      input: query,
    });

    const response = await llm.invoke(formattedPrompt);

    return {
      answer: response.content,
      context: relevantDocs,
    };
  };

  console.log("[RAG] 🔗 检索链创建完成");

  return _retrievalChain;
}

// ======================== 问答接口 ========================

/**
 * 查询低空经济知识（RAG 检索增强生成）
 */
export async function queryLowAltitudeKnowledge(query) {
  try {
    const chain = await createRAGChain();
    const result = await chain(query);

    // 提取来源信息
    const sources = (result.context || [])
      .filter((doc) => doc.metadata && doc.metadata.title)
      .map((doc) => ({
        title: doc.metadata.title,
        category: doc.metadata.category,
      }));

    // 去重
    const uniqueSources = [];
    const seen = new Set();
    for (const source of sources) {
      const key = `${source.title}|${source.category}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueSources.push(source);
      }
    }

    return {
      answer: result.answer,
      sources: uniqueSources,
    };
  } catch (error) {
    console.error("[RAG] ❌ 查询失败:", error.message);
    throw error;
  }
}

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

export default {
  buildVectorStore,
  getVectorStore,
  createRAGChain,
  queryLowAltitudeKnowledge,
  getRAGStatus,
};
