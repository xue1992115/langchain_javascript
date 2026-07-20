/*
 * @Author: hxx
 * @Date: 2026-07-17 17:42:00
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-20 09:44:15
 */
import "dotenv/config";
import { createAgent, tool, initChatModel } from 'langchain';
import * as z from 'zod';

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
// 3、创建agent
const agent = createAgent({
  tools: [getWeather],
  model: chatMiniMax,
});
const result = await agent.invoke({
    messages: [{ role: "user", content: "西安的天气怎么样?" }],
  })
console.log(result.content);