/*
 * @Author: hxx
 * @Date: 2026-07-20 16:03:32
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-23 14:01:33
 */
import "dotenv/config";

/**
 * 应用配置管理
 */
export const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  env: process.env.NODE_ENV || "development",

  /** 默认 LLM 提供商（deepseek | minimax） */
  defaultProvider: process.env.DEFAULT_PROVIDER || "deepseek",

  // 大模型配置
  llm: {
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    },
    minimax: {
      apiKey: process.env.MINIMAX_API_KEY,
      baseUrl: process.env.MINIMAX_API_BASE_URL || "https://api.minimax.chat/v1",
      model: process.env.MINIMAX_MODEL || "MiniMax-M2.7",
    },
  },

  // 嵌入模型配置（用于 RAG 向量化）
  embeddings: {
    provider: process.env.EMBEDDING_PROVIDER || "minimax",
    minimax: {
      apiKey: process.env.MINIMAX_API_KEY,
      baseUrl: process.env.MINIMAX_API_BASE_URL || "http://10.1.111.154:3001/v1",
      model: process.env.EMBEDDING_MODEL || "text-embedding-ada-002",
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-ada-002",
    },
  },

  // RAG 配置
  rag: {
    chunkSize: parseInt(process.env.RAG_CHUNK_SIZE, 10) || 500,
    chunkOverlap: parseInt(process.env.RAG_CHUNK_OVERLAP, 10) || 50,
    topK: parseInt(process.env.RAG_TOP_K, 10) || 4,
  },
};
