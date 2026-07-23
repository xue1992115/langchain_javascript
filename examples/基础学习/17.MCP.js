/*
 * @Author: hxx
 * @Date: 2026-07-22 16:48:35
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-23 18:00:00
 * @langchain/mcp-adapters
 *
 * MCP (Model Context Protocol) 多服务器集成示例
 *
 * 核心概念：
 * - MultiServerMCPClient：同时管理多个 MCP 服务器连接
 * - Stdio 传输：通过子进程通信（本地服务器）
 * - SSE 传输：通过 HTTP/SSE 通信（远程服务器）
 * - getTools：从所有服务器获取工具并转为 LangChain 标准工具格式
 *
 * 本示例演示：
 * 1. 连接本地 Math MCP 服务器（stdio 传输）
 * 2. 连接远程 Weather MCP 服务器（SSE 传输）
 * 3. 将两个服务器的工具合并后提供给 Agent 使用
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

// ========== 1. 启动远程 Weather MCP 服务器 ==========
// 获取当前文件所在目录，用于解析服务器脚本路径
const __dirname = dirname(fileURLToPath(import.meta.url));

// 后台启动 Weather MCP 服务器（SSE 传输，端口 8000）
const weatherServer = spawn("node", [resolve(__dirname, "weather_server.js")], {
  stdio: ["pipe", "inherit", "inherit"],
});

// 等待服务器启动
await new Promise((resolve) => setTimeout(resolve, 2000));

try {
  // ========== 2. 初始化 MultiServerMCPClient ==========
  // 配置两个 MCP 服务器：
  //   - math: 本地 stdio 传输，直接启动子进程
  //   - weather: 远程 SSE 传输，连接到已运行的 HTTP 服务
  const client = new MultiServerMCPClient({
    math: {
      transport: "stdio",                // 本地子进程通信
      command: "node",
      args: [resolve(__dirname, "math_server.js")],
    },
    weather: {
      transport: "sse",                  // SSE 远程通信
      url: "http://localhost:8000/mcp",  // 需要先启动 weather_server.js
    },
  });

  // ========== 3. 从所有服务器获取工具 ==========
  console.log("🔄 正在连接 MCP 服务器并加载工具...");
  const tools = await client.getTools();
  console.log(`✅ 已加载 ${tools.length} 个工具:`);
  for (const tool of tools) {
    console.log(`   - ${tool.name}: ${tool.description}`);
  }

  // ========== 4. 创建 AI Agent ==========
  const chatModel = new ChatOpenAI({
    model: "MiniMax-M2.7",
    apiKey: process.env.MINIMAX_API_KEY,
    configuration: { baseURL: process.env.MINIMAX_API_BASE_URL },
    temperature: 0,
  });

  const agent = createAgent({
    model: chatModel,
    tools,
  });

  // ========== 5. 格式化输出函数 ==========
  function formatMessageContent(content) {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.map((c) => (c.type === "text" ? c.text : JSON.stringify(c))).join("\n");
    }
    return JSON.stringify(content);
  }

  // ========== 6. 运行测试 ==========
  // 测试 1：数学计算
  console.log("\n📝 测试 1：数学计算");
  const mathResult = await agent.invoke({
    messages: [
      {
        type: "human",
        content: "请帮我计算 (123 + 456) * 2 等于多少？",
      },
    ],
  });
  const lastMsg1 = mathResult.messages[mathResult.messages.length - 1];
  console.log(`  回复: ${formatMessageContent(lastMsg1.content)}`);

  // 测试 2：天气查询
  console.log("\n📝 测试 2：天气查询");
  const weatherResult = await agent.invoke({
    messages: [
      {
        type: "human",
        content: "北京的天气怎么样？",
      },
    ],
  });
  const lastMsg2 = weatherResult.messages[weatherResult.messages.length - 1];
  console.log(`  回复: ${formatMessageContent(lastMsg2.content)}`);

  // 测试 3：综合测试（同时使用两个服务器的工具）
  console.log("\n📝 测试 3：综合测试（数学 + 天气）");
  const combinedResult = await agent.invoke({
    messages: [
      {
        type: "human",
        content: "北京今天温度是 28°C，如果温度升高 15°C 会变成多少？这个温度下上海当前的天气如何？",
      },
    ],
  });
  const lastMsg3 = combinedResult.messages[combinedResult.messages.length - 1];
  console.log(`  回复: ${formatMessageContent(lastMsg3.content)}`);

  // ========== 6. 清理连接 ==========
  await client.close();
  console.log("\n✅ 所有 MCP 服务器连接已关闭");

} catch (error) {
  console.error("❌ 执行出错:", error.message);
} finally {
  // 关闭后台运行的 Weather 服务器
  weatherServer.kill();
  console.log("👋 程序退出");
}
