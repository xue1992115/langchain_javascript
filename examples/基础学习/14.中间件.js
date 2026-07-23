import "dotenv/config";
import { createAgent, summarizationMiddleware, humanInTheLoopMiddleware, modelCallLimitMiddleware, toolCallLimitMiddleware } from 'langchain';
import { tool } from '@langchain/core/tools';
import { ChatOpenAI } from "@langchain/openai";
import { MemorySaver, Command } from "@langchain/langgraph";
import { z } from "zod";

const chatMiniMax = new ChatOpenAI({
  model: "MiniMax-M2.7",
  apiKey: process.env.MINIMAX_API_KEY,
  configuration: { baseURL: process.env.MINIMAX_API_BASE_URL },
  temperature: 0,
});

const calculatorTool = tool(
  async ({ expression }) => `The result of ${expression} is 42.`,
  {
    name: 'calculator',
    description: '计算器工具，用于执行数学计算',
    schema: z.object({
      expression: z.string().describe('需要执行的数学表达式'),
    }),
  }
);

const weatherTool = tool(
  async ({ city }) => `The weather in ${city} is sunny.`,
  {
    name: 'weather',
    description: '查询天气',
    schema: z.object({
      city: z.string().describe('城市名称'),
    }),
  }
);

const checkpointer = new MemorySaver();

const agent = createAgent({
  model: chatMiniMax,
  tools: [weatherTool, calculatorTool],
  checkpointer: checkpointer,
  middleware: [
    summarizationMiddleware({
      model: chatMiniMax,
      trigger: { tokens: 1 },   // 测试完记得改回 4000+
      keep: { messages: 3 },    // ✅ 从 1 改到 3，保留足够上下文触发工具
    }),
    humanInTheLoopMiddleware({  // ✅ 加上函数调用
      interruptOn: {
        weather: {
          allowedDecisions: ["approve", "edit", "reject"],
        },
        calculator: false,
      },
    }),
    // modelCallLimitMiddleware({
    //   threadLimit: 10,
    //   runLimit: 0,
    //   exitBehavior: "end",
    // }),
    toolCallLimitMiddleware({
      toolName: "weather",
      threadLimit: 10,
      runLimit: 8,
    })
  ],
});

// ========== 第一次调用：触发 HITL 中断 ==========
const response = await agent.invoke(
  {
    messages: [
     { role: 'user', content: '请调用 weather 查询上海的天气。' },
    ],
  },
  {
    configurable: { thread_id: "test-thread-123" },
  }
);

console.log("📊 最终消息总条数:", response.messages.length);
response.messages.forEach((msg, i) => {
  console.log(`📝 消息[${i}] type=${msg.constructor?.name}, role=${msg.role ?? '无'}, tool_calls=${msg.tool_calls ? JSON.stringify(msg.tool_calls) : '无'}, content=${typeof msg.content === 'string' ? msg.content.substring(0, 200) : JSON.stringify(msg.content).substring(0, 200)}`);
});
console.log("🔍 是否有 interrupt:", Boolean(response.__interrupt__));

// ========== 处理中断 & 恢复执行 ==========
if (response.__interrupt__) {
  const interruptValue = response.__interrupt__?.[0]?.value;
  if (interruptValue?.actionRequests) {
    console.log("\n⏸️  agent 已暂停，等待人工审批...");
    console.log("工具调用:", JSON.stringify(interruptValue.actionRequests, null, 2));

    // 模拟人工批准
    const resume = {
      decisions: interruptValue.actionRequests.map(() => ({ type: "reject" })),
    };

    const finalResponse = await agent.invoke(
      new Command({ resume }),
      { configurable: { thread_id: "test-thread-123" } }
    );

    console.log("\n✅ 恢复执行完成!");
    console.log("📊 最终消息总条数:", finalResponse.messages.length);
    finalResponse.messages.forEach((msg, i) => {
      console.log(`📝 消息[${i}] type=${msg.constructor?.name}, content=${typeof msg.content === 'string' ? msg.content.substring(0, 300) : JSON.stringify(msg.content).substring(0, 300)}`);
    });
  }
}