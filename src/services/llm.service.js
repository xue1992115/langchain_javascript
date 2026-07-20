/*
 * @Author: hxx
 * @Date: 2026-07-20 15:51:13
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-20 16:16:28
 */
import { ChatOpenAI } from "@langchain/openai";
import { initChatModel } from "langchain";
import { config } from "../config/index.js";

/**
 * 初始化 DeepSeek 大模型（兼容 OpenAI SDK）
 */
function createDeepSeekModel() {
  return new ChatOpenAI({
    model: config.llm.deepseek.model,
    temperature: 0.7,
    apiKey: config.llm.deepseek.apiKey,
    configuration: {
      baseURL: config.llm.deepseek.baseUrl,
    },
  });
}

/**
 * MiniMax
 */
function createMiniMaxModel() {
  return new ChatOpenAI({
    model: "MiniMax-M2.7",
    temperature: 0.7,
    apiKey: config.llm.minimax.apiKey,
    configuration: {
      baseURL: config.llm.minimax.baseUrl,
    },
  });
}

/**
 * 获取可用的 LLM 实例
 * @param {'deepseek' | 'minimax'} provider
 */
export async function getLLM(provider = "deepseek") {
  switch (provider) {
    case "minimax":
      return await createMiniMaxModel();
    case "deepseek":
    default:
      return await createDeepSeekModel();
  }
}

/**
 * 发送聊天消息给大模型，返回回复内容
 * @param {string} message - 用户消息
 * @param {'deepseek' | 'minimax'} [provider='deepseek'] - 模型提供商
 * @returns {Promise<string>}
 */
export async function chat(message, provider = "deepseek") {
  const llm = await getLLM(provider);
  const response = await llm.invoke(message);
  return response.content;
}
