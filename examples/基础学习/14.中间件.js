/*
 * @Author: hxx
 * @Date: 2026-07-20 14:00:00
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-20 14:27:59
 * @Description: LangChain 中间件（Middleware）大全 —— Agent 流程的核心拦截器
 *
 * 中间件是 LangChain Agent 的核心机制，允许你在 Agent 执行流程的各个阶段
 * 插入自定义逻辑，实现横切关注点（cross-cutting concerns）的复用。
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │                     Agent 执行流程                                 │
 * │                                                                  │
 * │  beforeAgent ──► beforeModel ──► Model ──► afterModel ──► Tool   │
 * │       ▲                                            │             │
 * │       │                循环                         │             │
 * │       └────────────────────────────────────────────┘             │
 * │                                                                  │
 * │  wrapModelCall ── 包裹模型调用（修改请求/响应）                      │
 * │  wrapToolCall  ── 包裹工具调用（拦截/修改/重试）                     │
 * │  afterAgent    ── Agent 执行完毕后的清理/后处理                      │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * 内置中间件列表（按功能分类）：
 *
 * 【上下文管理】
 *   summarizationMiddleware    - 总结历史对话以节省 Token
 *   contextEditingMiddleware   - 自动裁剪工具结果以管理上下文长度
 *
 * 【安全与合规】
 *   piiMiddleware              - PII 检测（邮箱/信用卡/IP 等）
 *   piiRedactionMiddleware     - PII 脱敏处理
 *   openAIModerationMiddleware - OpenAI 内容审核
 *
 * 【流程控制】
 *   humanInTheLoopMiddleware   - 人工审批工具调用
 *   toolCallLimitMiddleware    - 限制单轮工具调用次数
 *   modelCallLimitMiddleware   - 限制模型调用次数
 *
 * 【容错与回退】
 *   modelFallbackMiddleware    - 模型调用失败时回退到备用模型
 *   modelRetryMiddleware       - 模型调用失败时自动重试
 *   toolRetryMiddleware        - 工具调用失败时自动重试
 *
 * 【智能增强】
 *   llmToolSelectorMiddleware  - 用 LLM 从大量工具中智能挑选
 *   todoListMiddleware         - 给 Agent 添加任务列表管理能力
 *   dynamicSystemPromptMiddleware - 动态设置 System Prompt
 *   toolEmulatorMiddleware     - 工具模拟（测试/开发用）
 *
 * 【性能优化】
 *   anthropicPromptCachingMiddleware - Anthropic 提示缓存
 *   bedrockPromptCachingMiddleware   - AWS Bedrock 提示缓存
 *
 * 【自定义】
 *   createMiddleware           - 创建自己的中间件
 *
 * 注意：本文件示例较多，建议逐个章节运行测试，不要一次全部取消注释。
 */

import "dotenv/config";
import * as z from "zod";
import {
  createAgent,
  tool,
  initChatModel,

  // ─── 内置中间件 ───
  summarizationMiddleware,
  humanInTheLoopMiddleware,
  dynamicSystemPromptMiddleware,
  llmToolSelectorMiddleware,
  piiMiddleware,
  piiRedactionMiddleware,
  contextEditingMiddleware,
  ClearToolUsesEdit,
  toolCallLimitMiddleware,
  todoListMiddleware,
  modelCallLimitMiddleware,
  modelFallbackMiddleware,
  modelRetryMiddleware,
  toolRetryMiddleware,
  toolEmulatorMiddleware,
  providerToolSearchMiddleware,
  openAIModerationMiddleware,
  anthropicPromptCachingMiddleware,
  bedrockPromptCachingMiddleware,

  // ─── 自定义中间件 ───
  createMiddleware,

  // ─── 工具类 ───
  SystemMessage,
  HumanMessage,
} from "langchain";

// ====================================================================
//  0. 初始化模型（所有示例共用）
// ====================================================================
const chatMiniMax = await initChatModel("MiniMax-M2.7", {
  modelProvider: "openai",
  apiKey: process.env.MINIMAX_API_KEY,
  configuration: {
    baseURL: process.env.MINIMAX_API_BASE_URL,
  },
});

// 一个测试用的工具
const getWeather = tool(
  async (input) => {
    const weatherMap = {
      北京: "晴，25°C",
      上海: "多云，28°C",
      广州: "雷阵雨，32°C",
      深圳: "阴，30°C",
    };
    return `🌤 ${input.city} 天气：${weatherMap[input.city] ?? "未知城市，请重试"}`;
  },
  {
    name: "get_weather",
    description: "查询指定城市的当前天气",
    schema: z.object({
      city: z.string().describe("城市名称，如 北京"),
    }),
  }
);

const getTime = tool(
  async (input) => {
    const timeMap = {
      北京: "2026-07-20 14:30:00",
      上海: "2026-07-20 14:30:00",
      东京: "2026-07-20 15:30:00",
      纽约: "2026-07-20 02:30:00",
    };
    return `🕐 ${input.city} 时间：${timeMap[input.city] ?? "未知城市"}`;
  },
  {
    name: "get_time",
    description: "查询指定城市的当前时间",
    schema: z.object({
      city: z.string().describe("城市名称"),
    }),
  }
);

const calculate = tool(
  async (input) => {
    // 安全地计算数学表达式
    try {
      const result = Function(`"use strict"; return (${input.expression})`)();
      return `📐 ${input.expression} = ${result}`;
    } catch {
      return `❌ 无法计算: ${input.expression}`;
    }
  },
  {
    name: "calculate",
    description: "计算数学表达式，如 1 + 2 * 3",
    schema: z.object({
      expression: z.string().describe("数学表达式"),
    }),
  }
);

// ====================================================================
//  不运行 Agent 的辅助说明函数 —— 仅打印配置信息
// ====================================================================
function divider(title) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(70)}`);
}

// ====================================================================
//  第一部分：createMiddleware —— 自定义中间件
//  Middleware 的本质是一个对象，包含 6 种钩子（hook）：
//    beforeAgent  →  Agent 开始前执行一次
//    afterAgent   →  Agent 结束后执行一次
//    beforeModel  →  每次模型调用前执行
//    afterModel   →  每次模型调用后执行
//    wrapModelCall → 包裹模型调用（可修改请求/响应）
//    wrapToolCall  → 包裹工具调用（可拦截/修改）
// ====================================================================

divider("1️⃣ createMiddleware —— 创建自定义中间件");

// ---- 1.1 基础日志中间件 ----
const loggingMiddleware = createMiddleware({
  name: "LoggingMiddleware",
  beforeAgent: async (state) => {
    console.log("  [日志中间件] Agent 开始执行");
    return state;
  },
  afterAgent: async (state) => {
    console.log("  [日志中间件] Agent 执行完毕");
    return state;
  },
  beforeModel: async (state) => {
    console.log("  [日志中间件] 即将调用模型...");
    return state;
  },
});

// ---- 1.2 带状态的计数器中间件 ----
const counterMiddleware = createMiddleware({
  name: "CounterMiddleware",
  stateSchema: z.object({
    modelCallCount: z.number().default(0),
  }),
  beforeModel: async (state) => {
    const newCount = state.modelCallCount + 1;
    console.log(`  [计数器中间件] 第 ${newCount} 次模型调用`);
    return { modelCallCount: newCount };
  },
});

// ---- 1.3 带上下文的用户信息中间件 ----
const userContextMiddleware = createMiddleware({
  name: "UserContextMiddleware",
  contextSchema: z.object({
    userId: z.string(),
    role: z.string().default("user"),
  }),
  beforeModel: async (state, runtime) => {
    console.log(`  [用户上下文中间件] userId=${runtime.context.userId}, role=${runtime.context.role}`);
    return state;
  },
});

console.log("✅ 自定义中间件已定义");

// ---- 1.4 组合自定义中间件创建 Agent ----
async function demoCustomMiddleware() {
  divider("1.4 运行：组合自定义中间件");

  const customAgent = createAgent({
    model: chatMiniMax,
    tools: [getWeather],
    middleware: [loggingMiddleware, counterMiddleware, userContextMiddleware],
    contextSchema: z.object({
      userId: z.string(),
      role: z.string(),
    }),
  });

  const result = await customAgent.invoke(
    {
      messages: [{ role: "user", content: "北京天气怎么样？" }],
    },
    {
      context: { userId: "u001", role: "admin" },
    }
  );

  console.log("\nAgent 回复:", result.messages[result.messages.length - 1].content);
}

// 默认不运行，取消注释即可测试
// await demoCustomMiddleware();


// ====================================================================
//  第二部分：summarizationMiddleware —— 对话总结
//  当上下文达到阈值时，自动总结历史对话以节省 Token 空间
// ====================================================================

divider("2️⃣ summarizationMiddleware —— 对话总结");

/*
 * 配置参数：
 *   - contextSize: 触发总结的上下文阈值
 *     { fraction: 0.8 }   → 达到模型最大上下文的 80% 时触发
 *     { tokens: 4000 }    → 达到 4000 token 时触发
 *     { messages: 20 }    → 达到 20 条消息时触发
 *   - keep: 总结后保留的消息/Token 量
 *     { fraction: 0.3 }
 *     { tokens: 2000 }
 *   - model: 用于总结的模型（可选，默认使用 Agent 的模型）
 *   - tokenCounter: 自定义 Token 计数器（可选）
 */

const summarizationAgent = createAgent({
  model: chatMiniMax,
  tools: [getWeather, getTime],
  middleware: [
    summarizationMiddleware({
      // 上下文超过 10 条消息时触发总结
      contextSize: { messages: 10 },
      // 总结后保留 5 条最新消息
      keep: { messages: 5 },
    }),
  ],
});

console.log("✅ summarizationMiddleware 已配置（messages > 10 时触发总结，保留 5 条）");
console.log("   （需长时间对话才能观察到效果，此处仅展示配置方式）\n");

// 简短的测试 —— 仅验证配置正确
const sumResult = await summarizationAgent.invoke({
  messages: [
    { role: "user", content: "你好！" },
    { role: "user", content: "北京天气怎么样？" },
    { role: "user", content: "上海时间是多少？" },
  ],
});
console.log("Agent:", sumResult.messages[sumResult.messages.length - 1].content);


// ====================================================================
//  第三部分：humanInTheLoopMiddleware —— 人工审批
//  在工具调用前暂停流程，等待人工审批/编辑/拒绝
// ====================================================================

divider("3️⃣ humanInTheLoopMiddleware —— 人工审批");

/*
 * 配置参数：
 *   - interruptOn: 触发审批的条件（接收 ToolCallRequest，返回 boolean）
 *     ─ 可以按工具名称、参数内容等条件判断
 *   - description: 审批请求的描述（静态文本或动态生成函数）
 *   - allowedDecisions: 允许的决策类型
 *     ['approve']           → 仅审批
 *     ['approve', 'reject'] → 审批或拒绝
 *     ['approve', 'edit', 'reject'] → 审批/编辑/拒绝
 *
 * 在对话式运行中，HITL 会暂停并抛出中断（Interrupt），
 * 由外层循环处理审批。此处仅展示配置方式。
 */

const hitlAgent = createAgent({
  model: chatMiniMax,
  tools: [getWeather, getTime, calculate],
  middleware: [
    humanInTheLoopMiddleware({
      // 仅对 calculate 工具调用进行审批
      interruptOn: async (request) => {
        return request.toolCall.name === "calculate";
      },
      description: (toolCall, state, runtime) => {
        return `请审批工具调用：\n工具: ${toolCall.name}\n参数: ${JSON.stringify(toolCall.args)}`;
      },
      allowedDecisions: ["approve", "reject"],
    }),
  ],
});

console.log("✅ humanInTheLoopMiddleware 已配置（calculate 工具需审批）");
console.log("   实际运行时，calculate 调用会触发中断等待人工决策\n");

// 不带审批场景的简单调用 —— 不会触发 HITL
const hitlResult = await hitlAgent.invoke({
  messages: [{ role: "user", content: "北京天气怎么样？" }],
});
console.log("Agent（无审批场景）:", hitlResult.messages[hitlResult.messages.length - 1].content);

// ⚠️ 如果要测试 HITL 审批，可以取消注释下面代码：
/*
 * try {
 *   const hitlResult2 = await hitlAgent.invoke({
 *     messages: [{ role: "user", content: "计算 1 + 2 * 3 等于多少？" }],
 *   });
 *   console.log("Agent:", hitlResult2.messages[hitlResult2.messages.length - 1].content);
 * } catch (e) {
 *   console.error("触发了 HITL 中断，需要人工审批:", e);
 * }
 */


// ====================================================================
//  第四部分：dynamicSystemPromptMiddleware —— 动态 System Prompt
//  每次模型调用前根据当前状态动态生成 System Prompt
// ====================================================================

divider("4️⃣ dynamicSystemPromptMiddleware —— 动态 System Prompt");

const timeContextSchema = z.object({
  currentDate: z.string(),
  timezone: z.string().default("Asia/Shanghai"),
});

const dynamicPromptAgent = createAgent({
  model: chatMiniMax,
  tools: [getWeather, getTime],
  contextSchema: timeContextSchema,
  middleware: [
    dynamicSystemPromptMiddleware((state, runtime) => {
      return [
        `你是智能助手，请用中文回答。`,
        `当前日期: ${runtime.context.currentDate}`,
        `时区: ${runtime.context.timezone}`,
        `模型调用次数: ${state.modelCallCount ?? 0}`,
      ].join("\n");
    }),
  ],
});

console.log("✅ dynamicSystemPromptMiddleware 已配置（基于上下文动态生成 System Prompt）\n");

const dynResult = await dynamicPromptAgent.invoke(
  {
    messages: [{ role: "user", content: "今天几号？" }],
  },
  {
    context: { currentDate: "2026-07-20", timezone: "Asia/Shanghai" },
  }
);
console.log("Agent:", dynResult.messages[dynResult.messages.length - 1].content);


// ====================================================================
//  第五部分：todoListMiddleware —— 任务列表管理
//  为 Agent 添加任务规划与管理能力（类似 Plan & Execute 模式）
// ====================================================================

divider("5️⃣ todoListMiddleware —— 任务列表管理");

/*
 * todoListMiddleware 会：
 *   1. 注入 write_todos 工具，让 Agent 可以创建/更新任务列表
 *   2. 添加系统提示，引导 Agent 在复杂任务中使用任务列表
 *   3. 在 Agent 状态中维护 todos 数组
 */

const todoAgent = createAgent({
  model: chatMiniMax,
  tools: [getWeather, getTime],
  middleware: [
    todoListMiddleware({
      // 可选：自定义系统提示（默认有完善的提示）
      // systemPrompt: "自定义提示...",
    }),
  ],
});

console.log("✅ todoListMiddleware 已配置（Agent 拥有任务管理能力）\n");

const todoResult = await todoAgent.invoke({
  messages: [{ role: "user", content: "帮我规划一次去上海的旅行，需要查天气和时间" }],
});

console.log("Agent:", todoResult.messages[todoResult.messages.length - 1].content);
console.log("\n任务列表状态:", JSON.stringify(todoResult.todos, null, 2));


// ====================================================================
//  第六部分：llmToolSelectorMiddleware —— LLM 智能工具选择
//  当 Agent 有大量工具时，先用小模型筛选出最相关的几个
// ====================================================================

divider("6️⃣ llmToolSelectorMiddleware —— 智能工具选择");

/*
 * 配置参数：
 *   - model: 用于选择工具的模型（可选，默认使用 Agent 的模型）
 *     ─ 建议使用更便宜的模型，如 gpt-4o-mini
 *   - maxTools: 最多选择多少个工具
 *   - alwaysInclude: 始终包含的工具名称列表（不计入 maxTools）
 *   - systemPrompt: 选择模型的自定义提示
 */

const toolSelectorAgent = createAgent({
  model: chatMiniMax,
  tools: [getWeather, getTime, calculate],
  middleware: [
    llmToolSelectorMiddleware({
      // 使用同一个模型进行选择（生产环境建议用小模型节省成本）
      maxTools: 2,
      alwaysInclude: ["calculate"], // calculate 始终可用
    }),
  ],
});

console.log("✅ llmToolSelectorMiddleware 已配置（最多选 2 个工具，calculate 始终可用）\n");

const selectResult = await toolSelectorAgent.invoke({
  messages: [{ role: "user", content: "北京天气怎么样？" }],
});
console.log("Agent:", selectResult.messages[selectResult.messages.length - 1].content);


// ====================================================================
//  第七部分：piiMiddleware —— PII 检测与防护
//  检测并处理敏感信息（邮箱、信用卡、IP、URL 等）
// ====================================================================

divider("7️⃣ piiMiddleware —— PII 检测");

/*
 * 内置 PII 类型：
 *   'email'        → 邮箱地址
 *   'credit_card'  → 信用卡号
 *   'ip'           → IP 地址
 *   'mac_address'  → MAC 地址
 *   'url'          → URL 链接
 *
 * 处理策略（PIIStrategy）：
 *   'block'  → 直接阻止（抛出 PIIDetectionError）
 *   'redact' → 替换为 [REDACTED]
 *   'mask'   → 部分遮掩（如 em***@example.com）
 *   'hash'   → 哈希处理
 */

const piiAgent = createAgent({
  model: chatMiniMax,
  tools: [getWeather],
  middleware: [
    piiMiddleware({
      rules: [
        // 检测邮箱 —— 自动遮掩
        {
          piiType: "email",
          strategy: "mask",
        },
        // 检测信用卡 —— 阻止（会抛出异常）
        {
          piiType: "credit_card",
          strategy: "block",
        },
        // 检测 URL —— 替换为 [REDACTED]
        {
          piiType: "url",
          strategy: "redact",
        },
      ],
    }),
  ],
});

console.log("✅ piiMiddleware 已配置（邮箱自动遮掩、信用卡阻止、URL 脱敏）\n");

// 测试 PII 检测
const piiResult = await piiAgent.invoke({
  messages: [
    { role: "user", content: "我的邮箱是 test@example.com，你可以查一下百度 https://www.baidu.com 的信息吗？" },
  ],
});
console.log("Agent:", piiResult.messages[piiResult.messages.length - 1].content);

// ⚠️ 以下代码会触发 PIIDetectionError（信用卡被 block 策略拦截）
/*
 * try {
 *   const piiResult2 = await piiAgent.invoke({
 *     messages: [{ role: "user", content: "我的信用卡是 4111-1111-1111-1111，存一下" }],
 *   });
 * } catch (e) {
 *   if (e.name === "PIIDetectionError") {
 *     console.error("PII 检测拦截:", e.message);
 *   }
 * }
 */


// ====================================================================
//  第八部分：piiRedactionMiddleware —— PII 脱敏中间件
//  与 piiMiddleware 类似，但更专注于自动脱敏处理
// ====================================================================

divider("8️⃣ piiRedactionMiddleware —— PII 脱敏");

const piiRedactAgent = createAgent({
  model: chatMiniMax,
  middleware: [
    piiRedactionMiddleware({
      // 使用内置类型或自定义正则
      rules: [
        {
          piiType: "email",
          strategy: "mask",
        },
        {
          piiType: "url",
          strategy: "redact",
        },
      ],
    }),
  ],
});

console.log("✅ piiRedactionMiddleware 已配置（邮箱遮掩、URL 脱敏）\n");

const redactResult = await piiRedactAgent.invoke({
  messages: [
    { role: "user", content: "联系我：admin@company.com，官网 https://company.com" },
  ],
});
console.log("Agent:", redactResult.messages[redactResult.messages.length - 1].content);


// ====================================================================
//  第九部分：contextEditingMiddleware —— 上下文自动裁剪
//  当上下文超过阈值时，自动删除旧的工具调用结果
// ====================================================================

divider("9️⃣ contextEditingMiddleware —— 上下文裁剪");

/*
 * 默认行为：当上下文超过 100,000 tokens 时，
 * 保留最近的 3 个工具调用结果，其余替换为 [cleared]
 *
 * 可自定义 ClearToolUsesEdit 策略：
 *   - trigger: 触发条件
 *     { tokens: 100000 }        → Token 数超过 10 万
 *     { fraction: 0.8 }          → 超过模型上限的 80%
 *     { messages: 50 }            → 超过 50 条消息
 *     [{tokens:50000},{messages:100}] → 任一条件满足
 *   - keep: 保留策略
 *     { messages: 5 } 或 { tokens: 2000 } 或 { fraction: 0.3 }
 *   - excludeTools: 排除的工具（始终不清除）
 *   - clearToolInputs: 是否同时清除工具调用参数（默认 false）
 *   - placeholder: 占位符文本（默认 "[cleared]"）
 */

const contextEditAgent = createAgent({
  model: chatMiniMax,
  tools: [getWeather, getTime, calculate],
  middleware: [
    contextEditingMiddleware({
      edits: [
        new ClearToolUsesEdit({
          // 当 token 超过 50000 或消息数超过 30 时触发
          trigger: [
            { tokens: 50000 },
            { messages: 30 },
          ],
          // 保留最近的 5 个工具结果
          keep: { messages: 5 },
          // 不清除 get_weather 工具的结果
          excludeTools: ["get_weather"],
          // 占位符
          placeholder: "[已裁剪]",
        }),
      ],
    }),
  ],
});

console.log("✅ contextEditingMiddleware 已配置（50K tokens 或 30 条消息触发裁剪）\n");

const ctxResult = await contextEditAgent.invoke({
  messages: [{ role: "user", content: "北京天气、上海时间和计算 1+1" }],
});
console.log("Agent:", ctxResult.messages[ctxResult.messages.length - 1].content);


// ====================================================================
//  第十部分：toolCallLimitMiddleware —— 工具调用次数限制
//  限制 Agent 在单轮对话中调用工具的总次数
// ====================================================================

divider("🔟 toolCallLimitMiddleware —— 工具调用限制");

/*
 * 配置参数：
 *   - maxToolCalls: 最大工具调用次数（超出后停止工具执行）
 *   - maxConsecutiveToolCalls: 最大连续工具调用次数（同一轮中）
 */

const toolLimitAgent = createAgent({
  model: chatMiniMax,
  tools: [getWeather, getTime, calculate],
  middleware: [
    toolCallLimitMiddleware({
      maxToolCalls: 5,              // 总共最多调用 5 次工具
      maxConsecutiveToolCalls: 3,   // 连续最多调用 3 次
    }),
  ],
});

console.log("✅ toolCallLimitMiddleware 已配置（最多 5 次工具调用，连续最多 3 次）\n");

const limitResult = await toolLimitAgent.invoke({
  messages: [{ role: "user", content: "查询北京、上海、广州、深圳的天气" }],
});
console.log("Agent:", limitResult.messages[limitResult.messages.length - 1].content);


// ====================================================================
//  第十一部分：modelCallLimitMiddleware —— 模型调用次数限制
// ====================================================================

divider("1️⃣1️⃣ modelCallLimitMiddleware —— 模型调用限制");

const modelLimitAgent = createAgent({
  model: chatMiniMax,
  tools: [getWeather],
  middleware: [
    modelCallLimitMiddleware({
      maxModelCalls: 3,  // 最多调用模型 3 次
    }),
  ],
});

console.log("✅ modelCallLimitMiddleware 已配置（最多 3 次模型调用）\n");

const modelLimitResult = await modelLimitAgent.invoke({
  messages: [{ role: "user", content: "北京天气怎么样？" }],
});
console.log("Agent:", modelLimitResult.messages[modelLimitResult.messages.length - 1].content);


// ====================================================================
//  第十二部分：modelFallbackMiddleware —— 模型回退
//  主模型调用失败时自动切换到备用模型
// ====================================================================

divider("1️⃣2️⃣ modelFallbackMiddleware —— 模型回退");

/*
 * 配置参数：
 *   - model: 备用模型（String | BaseLanguageModel）
 *   - maxRetries: 在回退前重试次数（默认 1）
 *   - errorHandler: 自定义错误处理函数
 */

const modelFallbackAgent = createAgent({
  model: chatMiniMax,
  tools: [getWeather],
  middleware: [
    modelFallbackMiddleware({
      // 如果 MiniMax 调用失败，回退到另一个模型（示例配置）
      // model: "openai:gpt-4o-mini",
      // 在实际使用中取消注释并配置 API Key
    }),
  ],
});

console.log("✅ modelFallbackMiddleware 已配置（模型失败时自动回退）\n");
console.log("   （需配置备用模型 Key 以测试回退功能）\n");

const fallbackResult = await modelFallbackAgent.invoke({
  messages: [{ role: "user", content: "北京天气怎么样？" }],
});
console.log("Agent:", fallbackResult.messages[fallbackResult.messages.length - 1].content);


// ====================================================================
//  第十三部分：modelRetryMiddleware —— 模型调用重试
//  模型调用失败时自动重试（带指数退避）
// ====================================================================

divider("1️⃣3️⃣ modelRetryMiddleware —— 模型重试");

/*
 * 配置参数：
 *   - maxRetries: 最大重试次数（默认 2）
 *   - retryDelayMs: 重试间隔毫秒（默认 1000）
 *   - retryOnTimeout: 是否在超时时重试（默认 true）
 *   - retryOnRateLimit: 是否在限流时重试（默认 true）
 */

const modelRetryAgent = createAgent({
  model: chatMiniMax,
  tools: [getWeather],
  middleware: [
    modelRetryMiddleware({
      maxRetries: 2,
      retryDelayMs: 1000,
      retryOnTimeout: true,
      retryOnRateLimit: true,
    }),
  ],
});

console.log("✅ modelRetryMiddleware 已配置（失败重试 2 次，间隔 1s）\n");

const retryResult = await modelRetryAgent.invoke({
  messages: [{ role: "user", content: "北京天气怎么样？" }],
});
console.log("Agent:", retryResult.messages[retryResult.messages.length - 1].content);


// ====================================================================
//  第十四部分：toolRetryMiddleware —— 工具调用重试
//  工具执行失败时自动重试
// ====================================================================

divider("1️⃣4️⃣ toolRetryMiddleware —— 工具重试");

/*
 * 配置参数：
 *   - maxRetries: 最大重试次数（默认 2）
 *   - retryDelayMs: 重试间隔毫秒（默认 1000）
 *   - retryableErrors: 可重试的错误类型列表
 */

const toolRetryAgent = createAgent({
  model: chatMiniMax,
  tools: [getWeather],
  middleware: [
    toolRetryMiddleware({
      maxRetries: 3,
      retryDelayMs: 500,
    }),
  ],
});

console.log("✅ toolRetryMiddleware 已配置（工具失败重试 3 次，间隔 500ms）\n");

const toolRetryResult = await toolRetryAgent.invoke({
  messages: [{ role: "user", content: "北京天气怎么样？" }],
});
console.log("Agent:", toolRetryResult.messages[toolRetryResult.messages.length - 1].content);


// ====================================================================
//  第十五部分：toolEmulatorMiddleware —— 工具模拟
//  开发/测试时模拟工具响应，避免调用真实 API
// ====================================================================

divider("1️⃣5️⃣ toolEmulatorMiddleware —— 工具模拟");

/*
 * 配置参数：
 *   - emulators: 工具模拟器映射
 *     { [toolName: string]: (input) => output }
 */

const toolEmulatorAgent = createAgent({
  model: chatMiniMax,
  tools: [getWeather, getTime],
  middleware: [
    toolEmulatorMiddleware({
      emulators: {
        get_weather: async (input) => {
          // 模拟天气数据，不调用真实 API
          const mockWeather = {
            北京: "模拟数据：晴，22°C",
            上海: "模拟数据：多云，26°C",
          };
          return `[模拟] 🌤 ${input.city} 天气：${mockWeather[input.city] ?? "未知城市"}`;
        },
        get_time: async (input) => {
          return `[模拟] 🕐 ${input.city} 时间：12:00:00`;
        },
      },
    }),
  ],
});

console.log("✅ toolEmulatorMiddleware 已配置（工具响应被模拟数据替代）\n");

const emuResult = await toolEmulatorAgent.invoke({
  messages: [{ role: "user", content: "北京天气和上海时间" }],
});
console.log("Agent:", emuResult.messages[emuResult.messages.length - 1].content);


// ====================================================================
//  第十六部分：多中间件组合 —— 复杂场景实战
//  多个中间件可以按顺序组合，形成强大的处理管道
// ====================================================================

divider("🔧 高级实战：多中间件组合");

/*
 * 中间件执行顺序：
 *   1. 最先添加的中间件先执行 beforeAgent/beforeModel
 *   2. 最后添加的中间件先执行 wrapModelCall/wrapToolCall（洋葱模型）
 *   3. afterModel/afterAgent 按添加顺序执行
 *
 * 示例：组合 5 个中间件
 *   ┌─ 日志记录（最外层）
 *   │  ┌─ PII 检测
 *   │  │  ┌─ 动态 System Prompt
 *   │  │  │  ┌─ 工具调用限制
 *   │  │  │  │  ┌─ 工具重试（最内层）
 *   │  │  │  │  │
 *   │  │  │  │  │     [Agent 核心流程]
 */

const combinedAgent = createAgent({
  model: chatMiniMax,
  tools: [getWeather, getTime, calculate],
  middleware: [
    // 1. PII 检测（最先处理敏感信息）
    piiMiddleware({
      rules: [
        { piiType: "email", strategy: "mask" },
        { piiType: "url", strategy: "redact" },
      ],
    }),

    // 2. 动态 System Prompt（注入上下文信息）
    dynamicSystemPromptMiddleware((state, runtime) => {
      return `你是多功能助手，可以查天气、时间和计算。请用中文回答。`;
    }),

    // 3. 工具调用限制（防止无限循环）
    toolCallLimitMiddleware({
      maxToolCalls: 10,
      maxConsecutiveToolCalls: 5,
    }),

    // 4. 工具重试（提升稳定性）
    toolRetryMiddleware({
      maxRetries: 2,
      retryDelayMs: 500,
    }),

    // 5. 上下文裁剪（防止 Token 溢出）
    contextEditingMiddleware(),
  ],
});

console.log("✅ 组合中间件 Agent 已创建（5 个中间件协同工作）\n");

const combResult = await combinedAgent.invoke({
  messages: [
    { role: "user", content: "帮我查一下北京天气，然后计算 25 * 4 + 10，顺便看看上海时间" },
  ],
});
console.log("Agent:", combResult.messages[combResult.messages.length - 1].content);


// ====================================================================
//  第十七部分：StreamTransformer —— 流转换器（高级用法）
//  中间件还可以注册流转换器，对流式输出进行转换
// ====================================================================

divider("1️⃣7️⃣ createMiddleware —— 流转换器");

/*
 * streamTransformers 允许中间件对流式输出进行实时转换。
 * 这在需要对输出进行后处理（如翻译、格式化、过滤）时非常有用。
 *
 * 不过当前示例主要关注中间件的核心功能，
 * 流转换器的详细用法将在 stream.js 中覆盖。
 */

const streamingMiddleware = createMiddleware({
  name: "StreamingLogMiddleware",
  beforeModel: async (state, runtime) => {
    console.log("  [流式中间件] 开始流式输出...");
    return state;
  },
});

console.log("✅ 流式中间件已定义（与 stream/transformers 配合使用）\n");


// ====================================================================
//  第十八部分：中间件类型安全 —— TypeScript 类型推断
//  LangChain 中间件系统提供完善的类型推断
// ====================================================================

divider("1️⃣8️⃣ 中间件类型安全总结");

/*
 * LangChain 中间件系统提供以下类型辅助：
 *
 *   AgentMiddleware          - 中间件类型
 *   createMiddleware         - 创建自定义中间件（自动推断类型）
 *   InferMiddlewareState     - 推断中间件状态类型
 *   InferMiddlewareContext   - 推断中间件上下文类型
 *   InferMiddlewareTools     - 推断中间件注册的工具类型
 *   InferAgentMiddleware     - 推断 Agent 的所有中间件类型
 *
 * 使用 TypeScript 时，中间件的状态和上下文类型会自动
 * 传递到 Agent 的类型系统中，无需手动声明。
 */

console.log(`
📋 中间件场景速查表
─────────────────────────────────────────────────────
场景                           推荐中间件
─────────────────────────────────────────────────────
对话上下文太长                    summarizationMiddleware
                              contextEditingMiddleware
用户输入含敏感信息               piiMiddleware / piiRedactionMiddleware
工具调用需要人工审批              humanInTheLoopMiddleware
需要根据上下文动态调整指令        dynamicSystemPromptMiddleware
Agent 有大量工具需要智能筛选      llmToolSelectorMiddleware
Agent 可能陷入无限工具循环        toolCallLimitMiddleware
Agent 不停调用模型消耗 Tokens     modelCallLimitMiddleware
模型不稳定需要自动重试/回退       modelRetryMiddleware
                              modelFallbackMiddleware
工具不稳定经常失败               toolRetryMiddleware
开发/测试时需要模拟工具响应        toolEmulatorMiddleware
Agent 需要任务规划能力            todoListMiddleware
需要日志/监控/审计               createMiddleware（自定义）
需要内容安全审核                 openAIModerationMiddleware
需要减少重复 Prompt 的 Token .    anthropicPromptCachingMiddleware
─────────────────────────────────────────────────────
`);


// ====================================================================
//  附录：高级用法 —— 中间件的洋葱模型（Middleware Onion Model）
// ====================================================================

divider("📖 附录：中间件洋葱模型说明");

/*
 * 中间件执行顺序遵循"洋葱模型"：
 *
 * beforeAgent ──► beforeModel ──► [模型调用] ──► afterModel ──► afterAgent
 *      ↑                                                          │
 *      └────────────────── 循环直到完成 ───────────────────────────┘
 *
 * wrapModelCall / wrapToolCall 是嵌套的洋葱圈：
 *   ┌─ Middleware1.wrapModelCall
 *   │  ┌─ Middleware2.wrapModelCall
 *   │  │  ┌─ Middleware3.wrapModelCall
 *   │  │  │     [真实模型调用]
 *   │  │  └─ Middleware3.wrapModelCall 返回
 *   │  └─ Middleware2.wrapModelCall 返回
 *   └─ Middleware1.wrapModelCall 返回
 *
 * 这种设计让中间件可以：
 *   1. 在调用前修改请求（添加日志、修改参数、注入上下文）
 *   2. 在调用后处理响应（过滤内容、重试、记录结果）
 *   3. 决定是否放行（PII 检测阻止、HITL 暂停）
 */

console.log("✅ 所有中间件示例完成！请根据需求选择合适中间件。");
