/*
 * @Author: hxx
 * @Date: 2026-07-20 15:51:13
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-23
 *
 * 统一 LLM 初始化工厂
 * - 支持 deepseek / minimax 灵活切换
 * - 相同 provider 复用单例实例，避免重复创建
 * - 支持通过 config.defaultProvider 或传入参数设置默认模型
 */
import { ChatOpenAI } from "@langchain/openai";
import { config } from "../config/index.js";

/** @typedef {{ [K: string]: any }} LLMOptions */

/** @type {Map<string, ReturnType<typeof createChatModel>>} 单例缓存 key: provider */
const modelCache = new Map();

/**
 * 创建 ChatOpenAI 实例（统一入口）
 * @param {string} provider - 提供商：'deepseek' | 'minimax'
 * @param {LLMOptions} [extraOptions] - 额外配置（覆盖默认参数）
 * @returns {ReturnType<typeof createChatModel>}
 */
function createChatModel(provider, extraOptions = {}) {
  const p = (provider || config.defaultProvider).toLowerCase();

  if (!isSupportedProvider(p)) {
    throw new Error(`不支持的 LLM 提供商: ${p}（可选: deepseek, minimax）`);
  }

  const def = config.llm[p];
  return new ChatOpenAI({
    model: def.model,
    temperature: 0.7,
    apiKey: def.apiKey,
    configuration: {
      baseURL: def.baseUrl,
    },
    ...extraOptions,
  });
}

/**
 * 获取 LLM 单例（相同 provider 复用，支持自定义温度等参数）
 * @param {string} [provider] - 提供商：'deepseek' | 'minimax'，默认使用 config.defaultProvider
 * @param {LLMOptions} [extraOptions] - 额外配置（如 temperature）
 * @returns {Promise<ReturnType<typeof createChatModel>>}
 */
export async function getLLM(provider, extraOptions = {}) {
  const p = (provider || config.defaultProvider).toLowerCase();
  const cacheKey = `${p}:${JSON.stringify(extraOptions)}`;

  if (!modelCache.has(cacheKey)) {
    modelCache.set(cacheKey, createChatModel(p, extraOptions));
  }
  return modelCache.get(cacheKey);
}

// ---- 内部辅助函数 ----

/**
 * 校验 provider 是否在支持的列表中
 */
function isSupportedProvider(provider) {
  return provider === "deepseek" || provider === "minimax";
}
