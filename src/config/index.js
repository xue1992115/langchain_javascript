import "dotenv/config";

/**
 * 应用配置管理
 */
export const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  env: process.env.NODE_ENV || "development",

  // 大模型配置
  llm: {
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    },
  },
};
