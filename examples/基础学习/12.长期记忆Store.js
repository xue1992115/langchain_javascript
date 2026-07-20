/*
 * @Author: hxx
 * @Date: 2026-07-20 14:30:00
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-20 14:30:00
 * @Description: Long-term Memory (Store) 长期记忆 —— 跨对话持久化存储
 *
 * InMemoryStore 像一个内存数据库：
 *   命名空间(namespace) → 相当于文件夹/表
 *   键(key)            → 记录的ID
 *   值(value)          → 存的实际数据（任意 JSON）
 *
 * 数据流：
 *   InMemoryStore.mset(keyValuePairs, namespace) → 写入
 *   InMemoryStore.mget(keys, namespace)          → 读取
 *   InMemoryStore.mdelete(keys, namespace)       → 删除
 *   InMemoryStore.yieldKeys(namespace)           → 遍历所有 key
 */

import "dotenv/config";
import * as z from "zod";
import { InMemoryStore, createAgent, tool, initChatModel } from "langchain";

// ======================== 初始化模型 ========================
const chatMiniMax = await initChatModel("MiniMax-M2.7", {
  modelProvider: "openai",
  apiKey: process.env.MINIMAX_API_KEY,
  configuration: {
    baseURL: process.env.MINIMAX_API_BASE_URL,
  },
});

// ======================== 第一部分：Store 基础操作 ========================

console.log("========== 1️⃣ Store 基础 CRUD ==========\n");

// 创建一个内存存储
const store = new InMemoryStore();
// 也可以从 @langchain/core/stores 引入：
// import { InMemoryStore } from "@langchain/core/stores";

// ---- 写入 ----
// mset(keyValuePairs, namespace)
//   keyValuePairs: Array<[key, value]>
//   namespace: string[] — 相当于路径，如 ["user_profiles", "u001"]
await store.mset(
  [
    ["user_name", "张三"],
    ["user_hobby", "编程"],
    ["user_city", "北京"],
  ],
  ["user_profiles", "u001"]
);

// 写入另一个用户
await store.mset(
  [
    ["user_name", "李四"],
    ["user_hobby", "摄影"],
    ["user_city", "上海"],
  ],
  ["user_profiles", "u002"]
);

// 写入复杂嵌套数据
await store.mset(
  [
    [
      "order_history",
      {
        orders: [
          { id: "O001", product: "iPhone 16 Pro", price: 8999 },
          { id: "O002", product: "AirPods Pro 3", price: 1999 },
        ],
        totalSpent: 10998,
      },
    ],
  ],
  ["user_profiles", "u001"]
);

// ---- 读取 ----
const name = await store.mget(["user_name"], ["user_profiles", "u001"]);
console.log("u001 用户姓名:", name);

const hobby = await store.mget(["user_hobby"], ["user_profiles", "u002"]);
console.log("u002 用户爱好:", hobby);

const orders = await store.mget(["order_history"], ["user_profiles", "u001"]);
console.log("u001 订单历史:", JSON.stringify(orders, null, 2));

// ---- 遍历所有 key ----
console.log("\nu001 命名空间下的所有 key:");
for await (const key of store.yieldKeys(["user_profiles", "u001"])) {
  console.log("  →", key);
}

// ---- 删除 ----
// await store.mdelete(["user_name"], ["user_profiles", "u001"]);

// ======================== 第二部分：Agent + Store 实战 ========================

console.log("\n\n========== 2️⃣ Agent + Store：长期记忆实战 ==========");

// 场景：一个能记住用户信息的客服助手
// 每次对话时，工具可以读取/写入 Store，实现跨对话持久化

const memoryStore = new InMemoryStore();

// 预存一些初始数据
await memoryStore.mset(
  [
    ["name", "张三"],
    ["level", "VIP 会员"],
    ["points", 5200],
    ["preferences", JSON.stringify({ category: "电子产品", brand: "Apple" })],
  ],
  ["user_context"]
);

// 工具1：读取用户信息（从 Store 中取）
const getUserProfile = tool(
  async (input, config) => {
    const store = config?.store;
    if (!store) return "存储不可用";

    const [name, level, points, preferences] = await store.mget(
      ["name", "level", "points", "preferences"],
      ["user_context"]
    );

    return JSON.stringify({
      name,
      level,
      points,
      preferences: preferences ? JSON.parse(preferences) : null,
    });
  },
  {
    name: "get_user_profile",
    description: "获取当前用户的个人信息，包括姓名、等级、积分、偏好",
    schema: z.object({}),
  }
);

// 工具2：记住用户的偏好（写入 Store）
const rememberPreference = tool(
  async (input, config) => {
    const store = config?.store;
    if (!store) return "存储不可用";

    const existingRaw = await store.mget(["preferences"], ["user_context"]);
    const existing = existingRaw[0] ? JSON.parse(existingRaw[0]) : {};

    // 合并新旧偏好
    const updated = { ...existing, [input.category]: input.value };

    await store.mset(
      [["preferences", JSON.stringify(updated)]],
      ["user_context"]
    );

    return `已记住：${input.category} = ${input.value}`;
  },
  {
    name: "remember_preference",
    description: "记住用户的一个偏好设置，例如颜色、品类、品牌等",
    schema: z.object({
      category: z.string().describe("偏好类别，如 color、category、brand"),
      value: z.string().describe("偏好值，如 red、电子产品、Apple"),
    }),
  }
);

// 工具3：更新用户积分
const updatePoints = tool(
  async (input, config) => {
    const store = config?.store;
    if (!store) return "存储不可用";

    const [currentPoints] = await store.mget(["points"], ["user_context"]);
    const newPoints = (currentPoints ?? 0) + input.amount;

    await store.mset([["points", newPoints]], ["user_context"]);

    return `积分已更新：${currentPoints} → ${newPoints}`;
  },
  {
    name: "update_points",
    description: "更新用户的积分，增加或减少",
    schema: z.object({
      amount: z.number().describe("积分变动值，正数增加、负数减少"),
    }),
  }
);

// 创建带 Store 的 Agent
const agentWithMemory = createAgent({
  model: chatMiniMax,
  tools: [getUserProfile, rememberPreference, updatePoints],
  store: memoryStore, // 👈 关键：把 Store 传给 Agent
});

// ---- 第一轮对话：读取已有信息 ----
console.log("\n--- 第一轮：查询个人信息 ---");
const result1 = await agentWithMemory.invoke({
  messages: [{ role: "user", content: "我的个人信息是什么？" }],
});
console.log("Agent:", result1.messages[result1.messages.length - 1].content);

// ---- 第二轮对话：记住新的信息 ----
console.log("\n--- 第二轮：让 Agent 记住偏好 ---");
const result2 = await agentWithMemory.invoke({
  messages: [{ role: "user", content: "我喜欢黑色，以后买手机要黑色的" }],
});
console.log("Agent:", result2.messages[result2.messages.length - 1].content);

// ---- 第三轮对话：验证记住了 ----
console.log("\n--- 第三轮：看看 Agent 是否记住了 ---");
const result3 = await agentWithMemory.invoke({
  messages: [{ role: "user", content: "我的偏好有哪些？" }],
});
console.log("Agent:", result3.messages[result3.messages.length - 1].content);

// ---- 第四轮对话：更新积分 ----
console.log("\n--- 第四轮：更新积分 ---");
const result4 = await agentWithMemory.invoke({
  messages: [
    { role: "user", content: "我刚刚下单了一台 MacBook Air，帮我加 500 积分" },
  ],
});
console.log("Agent:", result4.messages[result4.messages.length - 1].content);

// ---- 验证最终 Store 状态 ----
console.log("\n\n========== 3️⃣ 验证最终 Store 状态 ==========");
const [finalName, finalLevel, finalPoints, finalPrefs] =
  await memoryStore.mget(
    ["name", "level", "points", "preferences"],
    ["user_context"]
  );
console.log("用户:", finalName);
console.log("等级:", finalLevel);
console.log("积分:", finalPoints);
console.log("偏好:", finalPrefs);

// ======================== 第三部分：Structured Store（结构化命名空间） ========================

console.log("\n\n========== 4️⃣ 结构化命名空间设计 ==========");

// 好的命名空间设计 = 好的数据组织
// 推荐结构: [domain, userId, subDomain]

const structuredStore = new InMemoryStore();

// 按域组织
await structuredStore.mset(
  [["email", "zhangsan@example.com"]],
  ["users", "u001", "contact"]
);
await structuredStore.mset(
  [["phone", "13800138001"]],
  ["users", "u001", "contact"]
);
await structuredStore.mset(
  [["billing_address", "北京市海淀区..."]],
  ["users", "u001", "address"]
);
await structuredStore.mset(
  [["shipping_address", "北京市朝阳区..."]],
  ["users", "u001", "address"]
);
await structuredStore.mset(
  [["last_login", "2026-07-20 14:00:00"]],
  ["users", "u001", "stats"]
);

// 查询某个命名空间下的所有 key
console.log("u001 的联系方式:");
for await (const key of structuredStore.yieldKeys(["users", "u001", "contact"])) {
  const [value] = await structuredStore.mget([key], ["users", "u001", "contact"]);
  console.log(`  ${key}: ${value}`);
}
