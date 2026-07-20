/*
 * @Author: hxx
 * @Date: 2026-07-20 14:00:00
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-20 14:11:59
 * @Description: LangChain tool 高级用法大全 —— 覆盖所有实战模式
 */

import "dotenv/config";
import * as z from "zod";
import { createAgent, tool, initChatModel } from "langchain";

// ======================== 初始化模型 ========================
const chatMiniMax = await initChatModel("MiniMax-M2.7", {
  modelProvider: "openai",
  apiKey: process.env.MINIMAX_API_KEY,
  configuration: {
    baseURL: process.env.MINIMAX_API_BASE_URL,
  },
});

// ======================== 1. 基础工具 ========================
// 最简单的工具 —— 无参数，直接返回字符串
const getDate = tool(
  () => {
    return `今天是 ${new Date().toLocaleDateString("zh-CN")}`;
  },
  {
    name: "get_date",
    description: "获取当前日期",
  }
);

// ======================== 2. 带参数的工具（推荐写法） ========================
// 用 zod schema 定义参数类型，大模型会自动提取参数
const getWeather = tool(
  (input) => {
    const unit = input.unit ?? "摄氏度";
    return `${input.city} 今天天气晴朗，温度 25${unit}`;
  },
  {
    name: "get_weather",
    description: "获取指定城市的天气信息",
    schema: z.object({
      city: z.string().describe("城市名称，如 北京、上海、西安"),
      unit: z.string().optional().describe("温度单位：摄氏度/华氏度"),
    }),
  }
);

// ======================== 3. 异步工具（调用外部 API） ========================
// 模拟获取用户信息的异步操作
const getUserInfo = tool(
  async (input) => {
    // 这里可以替换为真实的 API 调用：await fetch(...)
    const db = {
      "u001": { name: "张三", age: 28, city: "北京" },
      "u002": { name: "李四", age: 35, city: "上海" },
    };
    const user = db[input.userId];
    if (!user) throw new Error(`用户 ${input.userId} 不存在`);
    return JSON.stringify(user);
  },
  {
    name: "get_user_info",
    description: "根据用户ID查询用户信息",
    schema: z.object({
      userId: z.string().describe("用户ID，如 u001、u002"),
    }),
  }
);

// ======================== 4. 带 context 的工具 ========================
// 可以访问 agent 运行时上下文（如对话状态、用户身份）
const getBalance = tool(
  (_, config) => {
    const userId = config?.configurable?.userId;
    if (!userId) return "请先提供用户ID";
    // 模拟查询余额
    return `用户 ${userId} 当前余额：¥1,280.50`;
  },
  {
    name: "get_balance",
    description: "查询当前登录用户的账户余额",
    schema: z.object({}),
  }
);

// ======================== 5. 复杂参数 + 结构化工具 ========================
// 工具可以返回任意结构化数据
const searchProducts = tool(
  async (input) => {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 10;
    // 模拟搜索
    const allProducts = [
      { id: 1, name: "iPhone 16 Pro", price: 8999 },
      { id: 2, name: "MacBook Air M4", price: 10999 },
      { id: 3, name: "AirPods Pro 3", price: 1999 },
    ];
    const filtered = allProducts.filter((p) =>
      p.name.includes(input.keyword)
    );
    return JSON.stringify({
      total: filtered.length,
      page,
      pageSize,
      products: filtered.slice((page - 1) * pageSize, page * pageSize),
    });
  },
  {
    name: "search_products",
    description: "搜索商品列表，支持分页",
    schema: z.object({
      keyword: z.string().describe("搜索关键词"),
      page: z.number().optional().describe("页码，从1开始"),
      pageSize: z.number().optional().describe("每页数量"),
    }),
  }
);

// ======================== 6. 多种用法模式 ========================

// ---- 模式 A：模型调用工具（bindTools） ----
// 模型只会返回 tool_call，需要自己执行
console.log("======= 模式 A：bindTools（手动执行 tool_call） =======");
const modelWithTools = chatMiniMax.bindTools([getWeather, getDate]);
const responseA = await modelWithTools.invoke("今天是几号？帮我查一下上海天气");
console.log("AI回复:", responseA.content);

// 手动执行 tool_call
if (responseA.tool_calls) {
  for (const tc of responseA.tool_calls) {
    console.log(`执行工具: ${tc.name}, 参数:`, tc.args);
    // tc.args 已经是一个对象，无需 JSON.parse
    const result = tc.name === "get_weather"
      ? await getWeather.invoke(tc.args)
      : await getDate.invoke(tc.args);
    console.log(`${tc.name} 执行结果:`, result);
  }
}

// ---- 模式 B：createAgent（自动执行工具） ----
// Agent 会自动决定何时调用工具、并将结果传回模型
console.log("\n======= 模式 B：createAgent（自动执行） =======");
const agent = createAgent({
  model: chatMiniMax,
  tools: [getWeather, getUserInfo, searchProducts],
});
const resultB = await agent.invoke({
  messages: [
    { role: "user", content: "搜索iPhone相关的商品，并查询用户 u001 的信息" },
  ],
});
console.log("Agent回复:", resultB.messages[resultB.messages.length - 1].content);

// ---- 模式 C：带 context 的 Agent（传递运行时上下文） ----
console.log("\n======= 模式 C：Agent + Context（传递上下文） =======");
const agentWithContext = createAgent({
  model: chatMiniMax,
  tools: [getBalance],
});
const resultC = await agentWithContext.invoke(
  {
    messages: [{ role: "user", content: "我的余额是多少？" }],
  },
  {
    configurable: { userId: "u001" },
  }
);
console.log("带Context的回复:", resultC.messages[resultC.messages.length - 1].content);

// // ---- 模式 D：多个工具 + 复杂对话 ----
console.log("\n======= 模式 D：多工具复杂对话 =======");
const powerAgent = createAgent({
  model: chatMiniMax,
  tools: [getWeather, getUserInfo, searchProducts, getDate],
});
const resultD = await powerAgent.invoke({
  messages: [
    { role: "user", content: "今天是几号？帮我查一下上海天气，再搜一下MacBook的价格" },
  ],
});
console.log("最终回复:", resultD.messages[resultD.messages.length - 1].content);

// ---- 模式 E：直接调用工具（不经过大模型） ----
console.log("\n======= 模式 E：直接调用工具 =======");
const weatherResult = await getWeather.invoke({ city: "深圳", unit: "华氏度" });
console.log("直接调用天气工具:", weatherResult);


