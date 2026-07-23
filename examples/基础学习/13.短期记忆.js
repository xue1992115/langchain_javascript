/*
 * @Author: hxx
 * @Date: 2026-07-20 14:30:00
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-22 14:33:31
 * @Description: 短期记忆能够是应用程序记住单线程或者对话过程中的所有交互记录
 * 如果上下文窗口的消息超出，有以下的手段处理：
 * 1、滑动窗口截断：只保留最近的对话消息，丢弃最旧的对话消息
 * 操作：在调用大模型之前手动截取消息列表的最后 k 条（例如最后 20 条）。
 * 使用场景：客服机器人（用户只关心当前问的问题，不关心上一小时聊了什么）。
 * 缺点：丢失了最开始的系统设定或用户最初的需求背景。
 * 
 * 
 * 2、历史对话摘要压缩（Summarization）⭐️ 最推荐
 * 原理：当消息数量达到阈值时，触发一次“摘要”调用（用一个小模型或大模型），将之前的 20 轮对话总结成一段 200 字以内的文本，然后用这段文本替换掉原始消息。
 * LangGraph 实战：在你的 Agent 图中增加一个 summarization 节点，当 len(messages) > 预设值时，执行 model.invoke("请将以下对话压缩为简洁的背景摘要...")，将结果存入 SystemMessage 中。
 * 优点：保留了核心事实和逻辑脉络，不丢失上下文大意。
 * 缺点：丢失了具体的措辞和微妙的细节，且多消耗了一次 API 调用费用。
 * 进阶技巧：采用“累积摘要”——将本次生成的摘要与历史摘要合并，而非每次都重新压缩全量数据。
 * 
 * 
 * 3：工具调用输出截断（Truncate Tool Output）
 * 原理：Agent 的上下文爆炸，80% 的情况不是因为聊得多，而是因为工具（Tools）返回的原始数据太大。（例如查数据库返回了 500 条 JSON）。
 * 操作：在工具函数内部，只提取 Top-N 条关键字段，或者只返回数据总量和统计值。
 * 代码示例：如果工具返回的是 list，只返回 list[:10]，并补充一句 "共查询到 1000 条记录，当前仅展示前 10 条，如需更多请告知"。
 * 优点：从根源上遏制了短期内 Token 激增。
 * 
 * 
 * 
 * 4：语义记忆检索（Semantic Memory / RAG）——最“AI”的方式
 * 原理：摒弃“把历史全塞进去”的思路，引入我们之前聊的“长期记忆（Vector Store）”。
 * 每次用户提问时，Agent 不再加载所有历史消息，而是将当前问题向量化，从知识库/记忆库中只检索 Top-3 条最相关的历史片段或事实，拼接到 Prompt 中。
 * 区别：手段一、二都是“丢弃信息”，手段四是“按需提取信息”。
 * 优点：上下文窗口永远只塞入最精华、最相关的 2000 个 Token，支持无限长的全局历史
 */
import "dotenv/config";
import { createAgent, tool, initChatModel } from "langchain";
import { MemorySaver } from "@langchain/langgraph";
import * as z from "zod";
/**
 * 获取用户信息
 */
const getUserInfo = tool(() => "No user profile on file.", {
  name: "get_user_info",
  description: "Look up information about the current user.",
  schema: z.object({}),
});
const checkpointer = new MemorySaver();
// 初始化模型
const chatMiniMax = initChatModel("MiniMax-M2.7", {
  modelProvider: 'openai',
  apiKey: process.env.MINIMAX_API_KEY,
  configuration: {
    baseURL: process.env.MINIMAX_API_BASE_URL,
  },
});
const agent = createAgent({
  model: chatMiniMax,
  tools: [getUserInfo],
  checkpointer,
});
const threadConfig = { configurable: { thread_id: "1" } };
const threadConfig2 = { configurable: { thread_id: "2" } };

let result = await agent.invoke(
  { messages: [{ role: "user", content: "Hi! My name is Bob." }] },
  threadConfig,
);
let response = result.messages.at(-1)?.content;

result = await agent.invoke(
  { messages: [{ role: "user", content: "What's my name?" }] },
  threadConfig,
);
response = result.messages.at(-1)?.content;
console.log(response); // "You are Bob!"



