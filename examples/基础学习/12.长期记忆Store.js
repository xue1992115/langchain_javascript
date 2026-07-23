/*
 * @Author: hxx
 * @Date: 2026-07-20 14:30:00
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-22 13:51:24
 * @Description: Long-term Memory (Store) 长期记忆 —— 跨对话持久化存储
 * 长期记忆就是提供能够跨不同对话持续保存数据的存储功能。与临时性的存储功能不同，存储在其中的数据在后续的对话中依然后用
 */

import "dotenv/config";
import * as z from "zod";
import { createAgent, initChatModel, tool } from "langchain";
import { InMemoryStore } from "@langchain/langgraph";
// ======================== 初始化模型 ========================
const chatMiniMax = await initChatModel("MiniMax-M2.7", {
  modelProvider: "openai",
  apiKey: process.env.MINIMAX_API_KEY,
  configuration: {
    baseURL: process.env.MINIMAX_API_BASE_URL,
  },
});
const store = new InMemoryStore();
/**
 * 获取用户信息工具
 * @param {string} user_id 用户ID
 */
const getUserInfo = tool(
  async ({ user_id }, runtime) => {
    const info = runtime.executionInfo;
    const serverInfo = runtime.serverInfo;
    console.log("运行执行信息", info);
    console.log("服务信息", serverInfo);
    const value = await store.get(["users"], user_id);
    return value;
  },
  {
    name: "get_user_info",
    description: "Look up user info.",
    schema: z.object({
      user_id: z.string(),
    }),
  }
);

/**
 * 保存用户信息工具
 * @param {string} user_id 用户ID
 * @param {string} name 用户姓名
 * @param {string} email 用户邮箱
 * @param  {string} age 用户年龄
 */
const saveUserInfo = tool(
  async ({ user_id, name, age, email }) => {
    console.log("save_user_info", user_id, name, age, email);
    await store.put(["users"], user_id, { name, age, email });
    return "✅ 保存成功";
  },
  {
    name: "save_user_info",
    description: "保存用户信息",
    schema: z.object({
      user_id: z.string(),
      name: z.string(),
      age: z.number(),
      email: z.string(),
    }),
  }
);

// ======================== 创建 Agent ========================
const agent = createAgent({
  model: chatMiniMax,
  tools: [getUserInfo, saveUserInfo],
  systemMessage: "你是一个有用的助手。根据用户的问题选择合适的工具来回答。",
  store,
});

// ======================== 测试 ========================
const save_user_info = await agent.invoke({
  messages: [
    {
      role: "user",
      content: "Save the following user: user_id: abc123, name: Foo, age: 25, email: foo@langchain.dev",
    },
  ],
});
// 中文
const result = await agent.invoke({
  messages: [
    { role: "user", content: "Get user info for user with id 'abc123'" },
  ],
});
console.log("result",result);