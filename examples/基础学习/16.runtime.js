/*
 * @Author: hxx
 * @Date: 2026-07-22 16:48:35
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-23 15:27:00
 * LangChain 的 createAgent 功能实际上是在 LangGraph 的运行时环境中运行的。
 * LangGraph 公开了一个包含以下信息的 Runtime 对象：
 * 1、Context: 背景信息：诸如用户 ID、数据库连接信息，以及代理程序调用所需的其他依赖项等静态信息。
 * 2、Store: 存储：用于长期存储的 BaseStore 实例
 * 3、Stream writer: 流式写入器：一种用于通过 "custom" 流式模式来传输信息的对象。
 * 4、Execution info: 执行信息：当前执行的身份标识及重试相关信息（线程 ID、运行 ID、尝试次数）
 * 5、Server info: 服务器信息：在 LangGraph Server 上运行时所对应的服务器特定元数据（助手 ID、图表 ID、已认证用户信息）
 */
import "dotenv/config"
import { createAgent } from "langchain"
import { ChatOpenAI } from "@langchain/openai";
import * as z from "zod";
const chatMiniMax = new ChatOpenAI({
  model: "MiniMax-M2.7",
  apiKey: process.env.MINIMAX_API_KEY,
  configuration: { baseURL: process.env.MINIMAX_API_BASE_URL },
  temperature: 0,
});
// 定义上下文模式, 定义代理调用时需要传递的参数
const contextSchema = z.object({
  userName: z.string(),
});

const agent = createAgent({
  model: chatMiniMax,
  contextSchema,
})
const result = await agent.invoke(
  { messages: [{ role: "user", content: "What's my name?" }] },
  { context: { userName: "John Smith" } }
);
console.log(result);