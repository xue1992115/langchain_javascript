import { ChatOpenAI } from "@langchain/openai";
import { config } from "../config/index.js";

/**
 * 初始化 DeepSeek 大模型（兼容 OpenAI SDK）
 */
function createDeepSeekModel() {
  return new ChatOpenAI(
    {
      model: config.llm.deepseek.model,
      temperature: 0.7,
    },
    {
      baseURL: config.llm.deepseek.baseUrl,
      apiKey: config.llm.deepseek.apiKey,
    }
  );
}

/**
 * 初始化 OpenAI 大模型
 */
function createOpenAIModel() {
  return new ChatOpenAI({
    model: config.llm.openai.model,
    temperature: 0.7,
    apiKey: config.llm.openai.apiKey,
  });
}

/**
 * 获取可用的 LLM 实例
 * @param {'deepseek' | 'openai'} provider
 */
export function getLLM(provider = "deepseek") {
  switch (provider) {
    case "openai":
      return createOpenAIModel();
    case "deepseek":
    default:
      return createDeepSeekModel();
  }
}

/**
 * 发送聊天消息给大模型，返回回复内容
 * @param {string} message - 用户消息
 * @param {'deepseek' | 'openai'} [provider='deepseek'] - 模型提供商
 * @returns {Promise<string>}
 */
export async function chat(message, provider = "deepseek") {
  const llm = getLLM(provider);
  const response = await llm.invoke(message);
  return response.content;
}
