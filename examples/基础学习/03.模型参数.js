/*
 * @Author: hxx
 * @Date: 2026-07-17 17:42:00
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-20 10:35:05
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
  // 设置温度参数, 控制生成文本的随机性, 温度越高, 生成的文本越随机; 温度越低, 生成的文本越确定
  temperature: 0.5,
  // 设置最大生成长度, 控制生成文本的长度, 以token为单位
  maxTokens: 25000,
  // 超时, 单位毫秒, 用于控制模型的响应时间, 超过该时间未响应则抛出异常
  timeout: 10000,
  // 最大重试次数, 用于控制模型的重试次数, 超过该次数未响应则抛出异常
  maxRetries: 3,
  // 重试间隔, 单位毫秒, 用于控制模型的重试间隔时间, 超过该时间未响应则抛出异常
  retryInterval: 1000,
  // 设置响应格式, 用于控制模型的输出格式, 可以理解为模型的输出模板
  responseFormat: z.object({ summary: z.string(), confidence: z.number() }),
  // 系统消息, 用于设置模型的行为和风格, 可以理解为模型的身份和性格
  systemMessage: "你是一个天气预报员, 你可以根据用户输入的城市名称, 返回该城市的天气情况, 你需要使用中文回答用户的问题",
});
const result = await agent.invoke({
    messages: [{ role: "user", content: "西安的天气怎么样?" }],
  })
console.log(result);