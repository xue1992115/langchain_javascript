/*
 * @Author: hxx
 * @Date: 2026-07-17 17:42:00
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-22 11:30:31
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
// 打开 Chrome 浏览器访问百度搜索
const searchInternet = tool(
  async (input) => {
    const { query } = input;
    const searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`;

    // macOS：用 open 命令打开 Chrome
    const { execSync } = await import("child_process");
    try {
      execSync(`open -a "Google Chrome" "${searchUrl}"`);
      return `✅ 已打开 Chrome 浏览器，正在百度搜索："${query}"`;
    } catch {
      // 备用方案：直接打开系统默认浏览器
      execSync(`open "${searchUrl}"`);
      return `✅ 已打开默认浏览器，正在百度搜索："${query}"`;
    }
  },
  {
    name: "search_internet",
    description: "打开 Chrome 浏览器，在百度上搜索指定关键词",
    schema: z.object({
      query: z.string().describe("搜索关键词，如 'DeepSeek最新动态'"),
    }),
  }
);
// 获取用户信息工具
const getUserName = tool(
  (_, config) => {
    return config.context.user_name;
  },
  {
    name: "get_user_name",
    description: "获取用户姓名",
    schema: z.object({}),
  },
);
const contextSchema = z.object({
  user_name: z.string(),
});

// 2、初始化模型
const chatMiniMax = await initChatModel("MiniMax-M2.7", {
    modelProvider: "openai",
    apiKey: process.env.MINIMAX_API_KEY,
     logprobs: true,
    configuration: {
        baseURL: process.env.MINIMAX_API_BASE_URL
    }
});
// 3、绑定工具
const modelWithTools = chatMiniMax.bindTools([getWeather, searchInternet, getUserName]);
const response = await modelWithTools.invoke("请问今天北京的天气如何？");
console.log('Response:', response);
const toolCalls = response.tool_calls || [];
for (const tool_call of toolCalls) {
  // View tool calls made by the model
  console.log(`Tool: ${tool_call.name}`);
  console.log(`Args: ${tool_call.args}`);
}
// 帮我写一个减法的工具函数

// 帮我写一个计算加法的工具函数
const addNumbers = tool(
  (input) => `${input.a} + ${input.b} = ${input.a + input.b}`,
  {
    name: "add_numbers",
    description: "计算两个数字的和",
    schema: z.object({
      a: z.number().describe("第一个加数"),
      b: z.number().describe("第二个加数"),
    }),
  }
);
// 测试搜索（直接调用工具）
const searchResult = await searchInternet.invoke({
  query: "DeepSeek最新动态",
});
console.log("\n======= 搜索结果 =======");
console.log(searchResult);

// 4、创建 Agent（使用之前初始化的模型和工具）
const agent = createAgent({
  llm: chatMiniMax,
  tools: [getWeather, searchInternet, getUserName, addNumbers],
  systemMessage: "你是一个有用的助手。根据用户的问题选择合适的工具来回答。"
});

// 测试获取用户姓名
const agentResponse = await agent.invoke(
  {
    messages: [{ role: "user", content: "What is my name?" }],
  },
  {
    configurable: { thread_id: crypto.randomUUID() },
    context: { user_name: "John Smith" },
  },
);
console.log('\n======= Agent 响应 =======');
console.log(agentResponse.messages[agentResponse.messages.length - 1]?.content ?? agentResponse);
console.log('\n✅ 所有工具测试完成！');