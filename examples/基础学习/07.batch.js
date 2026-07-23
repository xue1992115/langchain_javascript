/*
 * @Author: hxx
 * @Date: 2026-07-17 17:42:00
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-22 13:12:50
 */
import "dotenv/config";
import { createAgent, tool, initChatModel } from 'langchain';
import * as z from 'zod';
import { HumanMessage, AIMessage, SystemMessage } from 'langchain';
const Answer = z.object({ summary: z.string(), confidence: z.number() });
// 1、创建一个天气的工具, 中文

const getWeather = tool(
  (input) => `在 ${input.city} 天气总是晴朗的！`,
  {
    name: "get_weather",
    description: "获取给定城市的天气",
    schema: z.object({
      city: z.string().describe("要获取天气的城市"),
    }),
  }
);
// 2、初始化模型
const chatMiniMax = await initChatModel("MiniMax-M2.7", {
    modelProvider: "openai",
    apiKey: process.env.MINIMAX_API_KEY,
    configuration: {
        baseURL: process.env.MINIMAX_API_BASE_URL
    }
});
// batch 批量处理
const responses = await chatMiniMax.batch([
  // 中文
  "请问今天北京的天气如何？",
  "请问今天上海的天气如何？",
  "请问今天广州的天气如何？",
  "请问今天深圳的天气如何？",
  "请问今天杭州的天气如何？",
  "请问今天南京的天气如何？",
], {
  maxConcurrency: 3, // 最大并发数
});
for (const response of responses) {
  console.log(response);
}
