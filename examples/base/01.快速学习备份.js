import "dotenv/config";
import { createAgent, tool } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import * as z from "zod";

// 定义一个获取天气的工具函数
const getWeather = tool(
  (input) => `${input.city}的天气是晴天!`,
  {
    name: "get_weather",
    description: "获取指定城市的天气信息",
    schema: z.object({
      city: z.string().describe("要获取天气的城市"),
    }),
  }
);

// 1、初始化 DeepSeek 模型
const llm = new ChatOpenAI({
  model: "deepseek-v4-flash",
  apiKey: process.env.DEEPSEEK_API_KEY,
  temperature: 0,
  configuration: {
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
  },
});

// 2、创建一个 Agent
const agent = createAgent({
  model: llm,
  tools: [getWeather],
});
// 3、使用 Agent 进行对话
async function main() {
}
const res = await agent.invoke({
  messages: [{ role: "user", content: "今天西安的天气怎么样呢？" }],
});
console.log(res);

main();