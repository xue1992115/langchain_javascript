/*
 * @Author: hxx
 * @Date: 2026-07-17 17:42:00
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-20 10:53:28
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
// invoke方法用于调用agent, 传入用户输入的消息, 返回模型的响应
// invoke接收的参数可以是一条消息，或者多条消息，消息的格式为{ role: "user" | "assistant" | "system", content: string }
// 1、单条消息
const response = await chatMiniMax.invoke("上海的天气怎么样？");
console.log(response.content);
// 2、多条消息
const conversation = [
  { role: "system", content: "你是一个翻译助手，可以将中文翻译成英文。" },
  { role: "user", content: "翻译：我爱编程。" },
  { role: "assistant", content: "I love programming." },
  { role: "user", content: "翻译：我爱构建应用程序。" },
];
const response2 = await chatMiniMax.invoke(conversation);
// 3、消息对象

const conversation2 = [
  new SystemMessage("你是一个翻译助手，可以将中文翻译成英文。"),
  new HumanMessage("翻译：我爱编程。"),
  new AIMessage("I love programming."),
  new HumanMessage("翻译：我爱构建应用程序。"),
]
const response3 = await chatMiniMax.invoke(conversation2);
console.log(response3.content);