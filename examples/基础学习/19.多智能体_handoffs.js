/*
 * @Author: hxx
 * @Date: 2026-07-23 17:19:00
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-22 16:48:35
 * @Description: 多智能体 - handoffs（交接/移交模式）
 *
 * Handoffs（交接/移交）模式核心思想：
 *   行为会根据状态动态变化。工具调用会更新状态变量，进而触发路由或配置的变更，
 *   从而更换处理流程中的代理节点，或调整当前代理节点所使用的工具和提示信息。
 *
 * 实现方式：
 *   1. StateSchema 定义共享状态（currentStep 跟踪当前步骤）
 *   2. 工具返回 Command 更新状态（切换 currentStep = 移交控制权）
 *   3. Middleware 的 wrapModelCall 根据 currentStep 动态切换 systemPrompt 和 tools
 *   4. MemorySaver 持久化状态，支持多轮对话
 *
 * 工作流程：
 *   用户 → agent 调用模型
 *     → middleware 拦截，读取 request.state.currentStep
 *     → 根据 currentStep 注入对应的 systemPrompt 和 tools
 *     → 模型响应（可能调用工具）
 *     → 工具返回 Command 更新 state（切换 currentStep）
 *     → middleware 在下一次模型调用时自动切换到新配置
 *
 * 本示例模拟客户服务流转系统，三个步骤对应三个"角色"：
 *   triage（分诊/分类）    - 分析用户意图，移交给对应专业团队
 *   tech_support（技术支持）- 处理技术问题
 *   billing（账单客服）    - 处理账单和账户问题
 *
 * 每个步骤有不同的 systemPrompt 和 tools，通过 Command 切换 currentStep 来实现移交。
 */

import "dotenv/config";
import { createAgent, createMiddleware, tool, ToolMessage } from "langchain";
import { Command, StateSchema, MemorySaver } from "@langchain/langgraph";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";

// ==================== 1. 初始化大模型 ====================

const chatModel = new ChatOpenAI({
  model: "MiniMax-M2.7",
  apiKey: process.env.MINIMAX_API_KEY,
  configuration: { baseURL: process.env.MINIMAX_API_BASE_URL },
  temperature: 0,
});

// ==================== 2. 定义状态 ====================
//
// currentStep 跟踪当前处于哪个处理步骤
// contextInfo 保存移交时传递的上下文信息

const SupportState = new StateSchema({
  currentStep: z.string().default("triage"),
  contextInfo: z.string().optional().default(""),
});

// ==================== 3. 定义移交工具 ====================
//
// 每个工具返回 Command({ update: { currentStep, ... } }) 来切换步骤
// Command.update 中可同时更新 messages 和其它状态字段

// 3.1 移交给技术支持
const transferToTechSupport = tool(
  async ({ issue_description }, config) => {
    return new Command({
      update: {
        messages: [
          new ToolMessage({
            content: `[移交] 移交给技术支持。问题描述：${issue_description}`,
            tool_call_id: config.toolCallId,
          }),
        ],
        currentStep: "tech_support",
        contextInfo: issue_description,
      },
    });
  },
  {
    name: "transfer_to_tech_support",
    description: "将用户移交给技术支持团队，适用于软件故障、错误信息、登录认证等技术问题",
    schema: z.object({
      issue_description: z.string().describe("技术问题的详细描述"),
    }),
  }
);

// 3.2 移交给账单客服
const transferToBilling = tool(
  async ({ issue_description }, config) => {
    return new Command({
      update: {
        messages: [
          new ToolMessage({
            content: `[移交] 移交给账单客服。问题描述：${issue_description}`,
            tool_call_id: config.toolCallId,
          }),
        ],
        currentStep: "billing",
        contextInfo: issue_description,
      },
    });
  },
  {
    name: "transfer_to_billing",
    description: "将用户移交给账单客服，适用于收费、发票、退款、套餐变更等账单问题",
    schema: z.object({
      issue_description: z.string().describe("账单问题的详细描述"),
    }),
  }
);

// 3.3 移交给分诊（重新分类）
const transferToTriage = tool(
  async ({ message }, config) => {
    return new Command({
      update: {
        messages: [
          new ToolMessage({
            content: `[移交] 重新移交给分诊。说明：${message}`,
            tool_call_id: config.toolCallId,
          }),
        ],
        currentStep: "triage",
        contextInfo: message,
      },
    });
  },
  {
    name: "transfer_to_triage",
    description: "将用户重新移交给分诊/分类，当需要重新判断用户意图时使用",
    schema: z.object({
      message: z.string().describe("重新分类的原因说明"),
    }),
  }
);

// 3.4 最终回复用户（结束流程）
const finalizeSupport = tool(
  async ({ answer }, config) => {
    return new Command({
      update: {
        messages: [
          new ToolMessage({
            content: `[最终回复] 已处理完成。`,
            tool_call_id: config.toolCallId,
          }),
        ],
        currentStep: "triage", // 重置回 triage，准备下一次会话
        contextInfo: "",
      },
    });
  },
  {
    name: "finalize_support",
    description: "用户问题已解决，输出最终回复给用户。当已经给出完整答案后调用此工具结束本次服务",
    schema: z.object({
      answer: z.string().describe("给用户的最终回复内容"),
    }),
  }
);

// ==================== 4. 创建状态驱动的中间件 ====================

const stepConfigMiddleware = createMiddleware({
  name: "stepConfigMiddleware",
  stateSchema: SupportState,
  wrapModelCall: async (request, handler) => {
    const step = request.state.currentStep || "triage";
    const context = request.state.contextInfo || "";

    // 根据 currentStep 动态配置 systemPrompt 和 tools
    const stepConfigs = {
      triage: {
        systemPrompt: `你是客户服务的**分诊员**，负责分析用户的请求并移交给正确的团队。

## 你的职责
1. 分析用户的请求，判断属于哪类问题
2. 根据问题类型，使用移交工具将用户转给对应的专业团队
3. 对于简单问候，直接回复即可，不需要移交

## 问题分类规则
- 技术问题（软件故障、错误信息、登录问题、配置等）
  → 使用 transfer_to_tech_support
- 账单问题（收费、发票、退款、套餐变更、扣费等）
  → 使用 transfer_to_billing

## 重要
使用移交工具时，在 issue_description 中详细描述用户的问题。
不要试图自己回答不属于你领域的问题，直接移交。`,
        tools: [transferToTechSupport, transferToBilling],
      },

      tech_support: {
        systemPrompt: `你是**技术支持工程师**，负责解决用户的技术问题。
${context ? `\n## 接收到的上下文\n${context}\n` : ""}

## 你的职责
1. 耐心倾听用户的技术问题描述
2. 分析问题原因，提供清晰的解决方案和步骤
3. 如果发现是账单/账户方面的问题，使用 transfer_to_billing 移交
4. 如果发现不属于你的领域，使用 transfer_to_triage 重新分类

## 你能处理的问题
- 软件安装和配置问题
- 错误信息排查
- 登录认证问题
- 功能使用咨询

## 处理完成后
当问题已解决，使用 finalize_support 输出最终回复给用户。`,
        tools: [transferToBilling, transferToTriage, finalizeSupport],
      },

      billing: {
        systemPrompt: `你是**账单客服专员**，负责处理用户的账单和账户问题。
${context ? `\n## 接收到的上下文\n${context}\n` : ""}

## 你的职责
1. 耐心解答用户的账单疑问
2. 提供退款、发票、套餐变更等信息
3. 如果发现是技术方面的问题，使用 transfer_to_tech_support 移交
4. 如果发现不属于你的领域，使用 transfer_to_triage 重新分类

## 你能处理的问题
- 收费明细查询和解释
- 发票开具
- 退款申请流程
- 套餐变更
- 账户余额查询

## 处理完成后
当问题已解决，使用 finalize_support 输出最终回复给用户。`,
        tools: [transferToTechSupport, transferToTriage, finalizeSupport],
      },
    };

    const config = stepConfigs[step];
    if (!config) {
      // 未知步骤，回退到 triage
      return handler({
        ...request,
        systemPrompt: stepConfigs.triage.systemPrompt,
        tools: stepConfigs.triage.tools,
      });
    }

    // 将当前步骤信息注入系统提示
    const stepInfo = `\n【当前处理步骤：${step}】`;
    const enhancedPrompt = config.systemPrompt + stepInfo;

    return handler({
      ...request,
      systemPrompt: enhancedPrompt,
      tools: config.tools,
    });
  },
});

// ==================== 5. 创建带中间件的代理 ====================
//
// checkpointer 使用 MemorySaver 持久化状态，
// 支持在 state 中追踪 currentStep 跨多次模型调用

const supportAgent = createAgent({
  model: chatModel,
  tools: [
    transferToTechSupport,
    transferToBilling,
    transferToTriage,
    finalizeSupport,
  ],
  middleware: [stepConfigMiddleware],
  checkpointer: new MemorySaver(),
  systemPrompt: "默认提示词 - 将被 middleware 覆盖",
});

// ==================== 6. 执行测试 ====================

const testCases = [
  {
    title: "场景1：简单问候",
    content: "你好，请问有人能帮我吗？",
  },
  {
    title: "场景2：技术支持",
    content: "我登录的时候一直提示验证码错误，已经尝试了十几次了，能帮我看看吗？",
  },
  {
    title: "场景3：账单问题",
    content: "你好，我上个月被扣了198元，但我记得我的套餐是98元的，能帮我查一下吗？",
  },
  {
    title: "场景4：复杂问题（需要多次流转）",
    content: "我想升级我的套餐，但是系统提示错误，而且我怀疑上个月多扣了钱",
  },
];

// 可以在 0-3 之间切换来测试不同场景
const taskIndex = 1;

console.log("=".repeat(60));
console.log("🤝  多智能体系统 - handoffs 交接模式（Command + Middleware）");
console.log("=".repeat(60));
console.log(`\n📌 ${testCases[taskIndex].title}\n`);

const result = await supportAgent.invoke(
  {
    messages: [{ role: "user", content: testCases[taskIndex].content }],
  },
  {
    configurable: { thread_id: `handoff-test-${Date.now()}` },
  }
);

console.log("-".repeat(60));
console.log("✅ 最终回复：");
console.log("=".repeat(60));

// 提取最终的 AI 回复内容
const lastAiMsg = result.messages
  .filter((m) => m._getType() === "ai" && m.content)
  .pop();

if (lastAiMsg) {
  console.log(lastAiMsg.content);
} else {
  console.log(result.content || "（无回复内容）");
}
console.log("\n" + "=".repeat(60));
