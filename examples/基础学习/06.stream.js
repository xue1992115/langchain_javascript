/*
 * @Author: hxx
 * @Date: 2026-07-17 17:42:00
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-20 10:58:48
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
// stream方法用于调用agent, 传入用户输入的消息, 返回模型的响应, 并且可以实时接收模型的输出
// stream接收的参数可以是一条消息，或者多条消息，消息的格式为{ role: "user" | "assistant" | "system", content: string }
// 1、单条消息，与 invoke() 不同， invoke() 在模型生成完整响应后会返回一个 AIMessage 。而 stream() 则返回多个 AIMessageChunk 对象，每个对象都包含输出文本的一部分。重要的是，流中的每个部分都可以通过合并来组成完整的消息。
const streamResponse = await chatMiniMax.stream("上海的天气怎么样？");
for await (const chunk of streamResponse) {
  console.log(chunk);
}