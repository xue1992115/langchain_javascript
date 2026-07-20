/*
 * @Author: hxx
 * @Date: 2026-07-17 17:42:00
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-20 13:45:01
 */
import "dotenv/config";
import * as z from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent, tool, initChatModel } from "langchain";

const getUserName = tool(
  (_, config) => {
    return config.context.user_name;
  },
  {
    name: "get_user_name",
    description: "Get the user's name.",
    schema: z.object({}),
  },
);
// 2、初始化模型
const chatMiniMax = await initChatModel("MiniMax-M2.7", {
    modelProvider: "openai",
    apiKey: process.env.MINIMAX_API_KEY,
    configuration: {
        baseURL: process.env.MINIMAX_API_BASE_URL
    }
});
const contextSchema = z.object({
  user_name: z.string(),
});

const agent = createAgent({
  model: chatMiniMax,
  tools: [getUserName],
  contextSchema,
});

const result = await agent.invoke(
  {
    messages: [{ role: "user", content: "What is my name?" }],
  },
  {
    configurable: { thread_id: "12345" },
    context: { user_name: "John Smith" },
  },
);
console.log(result.messages[3].content); // 输出: "Your name is John Smith."