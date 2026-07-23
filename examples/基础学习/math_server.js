/**
 * 本地 Math MCP 服务器
 * 通过 stdio 传输协议提供数学计算工具
 *
 * 启动方式: node math_server.js
 * 由 17.MCP.js 自动通过 MultiServerMCPClient 加载
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// 创建 MCP 服务器实例
const server = new McpServer({
  name: "MathServer",
  version: "1.0.0",
});

// ========== 注册数学工具 ==========

// 1. 加法
server.tool(
  "add",
  "计算两个数字的和",
  { a: z.number(), b: z.number() },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a + b) }],
  })
);

// 2. 减法
server.tool(
  "subtract",
  "计算两个数字的差 (a - b)",
  { a: z.number(), b: z.number() },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a - b) }],
  })
);

// 3. 乘法
server.tool(
  "multiply",
  "计算两个数字的积",
  { a: z.number(), b: z.number() },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a * b) }],
  })
);

// 4. 除法
server.tool(
  "divide",
  "计算两个数字的商 (a / b)，除数不能为 0",
  { a: z.number(), b: z.number() },
  async ({ a, b }) => {
    if (b === 0) {
      return {
        content: [{ type: "text", text: "错误：除数不能为零" }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: String(a / b) }],
    };
  }
);

// 5. 幂运算
server.tool(
  "power",
  "计算 a 的 b 次幂 (a^b)",
  { a: z.number(), b: z.number() },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(Math.pow(a, b)) }],
  })
);

// 通过 stdio 传输启动服务器
const transport = new StdioServerTransport();
await server.connect(transport);
