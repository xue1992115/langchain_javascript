/**
 * 低空经济 RAG Agent 服务
 *
 * 使用 createAgent 创建智能 Agent，自动绑定工具并调用。
 * Agent 自主判断何时调用哪个工具，最后生成回答。
 */

import { createAgent, tool } from "langchain";
import { z } from "zod";
import { getLLM } from "./llm.service.js";
import { queryLowAltitudeKnowledge, getRAGStatus } from "./rag.service.js";

// ======================== 工具定义 ========================

/**
 * 低空经济知识问答工具（基于 RAG 检索）
 */
const lowAltitudeQATool = tool(
  async ({ query }) => {
    const result = await queryLowAltitudeKnowledge(query);
    const sourcesText = result.sources
      .map((s) => `- ${s.title}（${s.category}）`)
      .join("\n");

    return `${result.answer}\n\n参考资料：\n${sourcesText}`;
  },
  {
    name: "lowAltitudeQA",
    description:
      "低空经济知识问答：查询低空经济领域的专业知识，包括低空经济概念、无人机法规、eVTOL技术、空域管理、应用场景、政策趋势等。当用户问及低空经济问题时，优先使用此工具获取准确信息。",
    schema: z.object({
      query: z
        .string()
        .describe("用户的低空经济相关问题，例如：eVTOL适航认证流程是什么？"),
    }),
  }
);

/**
 * 低空经济政策法规查询工具
 */
const regulationTool = tool(
  async ({ category }) => {
    const prompt = `请详细介绍${category}相关的低空经济政策法规和标准要求，包括最新政策动态、法规条款、合规要求等。`;
    const result = await queryLowAltitudeKnowledge(prompt);
    return result.answer;
  },
  {
    name: "queryRegulation",
    description:
      "查询低空经济相关的政策法规、行业标准和管理规定。包括国家政策、无人机法规、适航认证标准、空域管理规定等。",
    schema: z.object({
      category: z
        .string()
        .describe(
          "法规类别，例如：无人机法规、适航认证、空域管理、国家政策、安全标准"
        ),
    }),
  }
);

/**
 * RAG 状态查询工具
 */
const ragStatusTool = tool(
  async () => {
    const status = await getRAGStatus();
    return `知识库状态：共 ${status.knowledgeBaseSize} 篇知识文档，向量索引 ${status.vectorCount} 条，检索深度 top-${status.topK}。`;
  },
  {
    name: "getKnowledgeBaseStatus",
    description:
      "查询低空经济知识库的当前状态，包括文档数量、向量索引数量等信息。",
    schema: z.object({}),
  }
);

// 所有工具列表
const tools = [lowAltitudeQATool, regulationTool, ragStatusTool];

// ======================== 单例缓存（支持 provider 切换） ========================

/** @type {import("langchain").ReactAgent | null} */
let _agentInstance = null;

/** @type {import("langchain").BaseChatModel | null} */
let _llmInstance = null;

/** @type {string | null} */
let _cachedProvider = null;

/**
 * 获取（或创建）LLM 单例
 * @param {'deepseek' | 'minimax'} provider
 */
async function getOrCreateLLM(provider = "deepseek") {
  if (!_llmInstance || _cachedProvider !== provider) {
    _llmInstance = await getLLM(provider);
  }
  return _llmInstance;
}
/**
 * 定义输出结果
 */
const Answer = z.object({ summary: z.string(), confidence: z.number() });
/**
 * 获取（或创建）Agent 单例
 * createAgent 内部构建 LangGraph 状态图，复用可大幅降低每次请求的延迟。
 *
 * ⚠️ 如果 provider 切换了，会自动丢弃旧缓存并重建 LLM + Agent
 * @param {'deepseek' | 'minimax'} provider
 */
async function getOrCreateAgent(provider = "deepseek") {
  const providerChanged = _cachedProvider !== null && _cachedProvider !== provider;

  if (providerChanged) {
    // 切换 provider → 丢弃旧缓存，下次重建
    _agentInstance = null;
    _llmInstance = null;
    console.log(`[RAG Agent] 🔄 provider 切换: ${_cachedProvider} → ${provider}`);
  }

  if (!_agentInstance) {
    _cachedProvider = provider;
    const llm = await getOrCreateLLM(provider);
    _agentInstance = await createAgent({
      model: llm,
      tools
    });
    console.log(`[RAG Agent] 🤖 Agent 已初始化（${provider}）`);
  }
  return _agentInstance;
}

// ======================== Agent 执行 ========================

/**
 * 执行 RAG Agent 任务
 * 使用缓存的 Agent 单例执行，避免每次请求重复构建 LangGraph 状态图。
 *
 * @param {string} query - 用户问题
 * @param {'deepseek' | 'minimax'} [provider='deepseek'] - 模型提供商，切换后自动重建 Agent
 */
export async function invokeRAGAgent(query, provider = "deepseek") {
  try {
    const agent = await getOrCreateAgent(provider);

    // 注意：createAgent 期望 messages 格式，而非 { input }
    const response = await agent.invoke({
      messages: [{ role: "human", content: query }],
    });

    // ReactAgent 返回完整的 state，从中提取最终 AI 消息
    const messages = response.messages || [];
    const lastAiMessage = [...messages]
      .reverse()
      .find(
        (m) =>
          m._getType?.() === "ai" || m.type === "ai" || m.role === "assistant"
      );

    return {
      content: lastAiMessage?.content || response?.structuredResponse || "",
      steps: response.intermediateSteps || response.steps || [],
    };
  } catch (error) {
    console.error("[RAG Agent] 调用失败:", error.message, error.stack);
    // 重新抛出错误，让 controller 的错误处理中间件返回正确的错误响应
    throw error;
  }
}

/**
 * 直接 RAG 查询
 */
export { queryLowAltitudeKnowledge } from "./rag.service.js";

export default {
  invokeRAGAgent,
  queryLowAltitudeKnowledge,
  getRAGStatus,
};
