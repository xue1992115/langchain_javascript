/*
 * @Author: hxx
 * @Date: 2026-07-22 16:48:35
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-23 17:18:35
 * @Description: 多智能体 - subagents（子代理/下属模式）
 *
 * 多智能体系统通过协调各个专业组件来处理复杂的工作流程。
 * 主要作用：
 *   1、避免让模型能力过载
 *   2、将复杂任务分解为多个子任务
 *   3、提高模型处理复杂任务的能力
 *   4、分布式开发，不同团队独立维护各个模块
 *   5、并行化：为各个子任务分配专门的执行单元
 *
 * subagents 模式核心思想：
 *   一个主代理（主管）负责协调各个子代理来完成任务。所有的路由操作都经过主代理，
 *   由主代理来决定何时以及如何调用各个子代理。
 *
 * 工作流程：
 *   用户提出问题
 *     → 主管代理分析任务需求
 *     → 调用子代理工具 → 子代理执行任务并返回结果
 *     → 主管代理根据结果决定下一步（继续/结束/修改）
 *     → 最终输出整合后的答案
 *
 * 实现要点：
 *   使用 createAgent 创建主管代理，子代理通过 tool 封装为"专家"工具。
 *   为避免 LangChainTracer 的嵌套执行追踪冲突，子代理内部使用
 *   chatModel.invoke() 直接调用模型（而非嵌套 createAgent.invoke()）。
 *   每个子工具有独立的 systemPrompt，模拟不同专家角色。
 *
 * 本示例创建了四个角色：
 *   supervisor（主管）    - 协调整个任务流程，决定使用哪个子代理
 *   researcher（研究员）  - 负责深入研究和分析信息
 *   writer（写作者）      - 负责撰写结构清晰的文章
 *   reviewer（评审员）    - 负责审核内容和提出改进建议
 */

import "dotenv/config";
import { createAgent, tool } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import * as z from "zod";

// ==================== 1. 初始化大模型 ====================

const chatModel = new ChatOpenAI({
  model: "MiniMax-M2.7",
  apiKey: process.env.MINIMAX_API_KEY,
  configuration: { baseURL: process.env.MINIMAX_API_BASE_URL },
  temperature: 0,
});

// ==================== 2. 定义子代理工具 ====================
//
// 每个子代理是一个 tool，内部直接调用 chatModel.invoke() 并传入不同的
// systemPrompt，模拟不同专家角色。这种方式避免了嵌套 invoke 导致的追踪错误。

// 2.1 研究员工具
const researchTool = tool(
  async (input) => {
    console.log(`   🔍 研究员正在研究：${input.topic}`);

    const sysPrompt = `你是一位资深研究员。你的职责是：
1. 对用户提出的主题进行深入研究
2. 输出结构化的研究报告（包含背景、现状分析、关键发现、结论）
3. 提供全面、准确的分析和数据支持
4. 引用相关事实和数据来支撑你的观点

请确保信息准确、逻辑清晰、内容详实。`;

    const result = await chatModel.invoke([
      { role: "system", content: sysPrompt },
      { role: "user", content: input.topic },
    ]);

    console.log(`   ✅ 研究员完成研究\n`);
    return result.content;
  },
  {
    name: "research",
    description: "对指定主题进行深入研究并返回研究报告",
    schema: z.object({
      topic: z.string().describe("需要研究的主题，如'人工智能在医疗领域的应用'"),
    }),
  }
);

// 2.2 写作工具
const writeTool = tool(
  async (input) => {
    console.log(`   ✍️  写作者正在撰写文章...`);

    const sysPrompt = `你是一位专业写作者。你的职责是：
1. 根据研究素材撰写优美的文章
2. 使用合适的标题层级组织内容（# 一级标题 ## 二级标题 ### 三级标题）
3. 确保文章结构完整：有引言、主体段落和结论
4. 保持语言流畅、生动易懂

请直接输出文章正文，不需要额外说明。`;

    const result = await chatModel.invoke([
      { role: "system", content: sysPrompt },
      {
        role: "user",
        content: `请根据以下研究素材撰写一篇结构完整、内容详实的文章：\n\n研究素材：\n${input.material}`,
      },
    ]);

    console.log(`   ✅ 写作者完成文章\n`);
    return result.content;
  },
  {
    name: "write",
    description: "根据研究素材撰写结构清晰的文章",
    schema: z.object({
      material: z.string().describe("写作素材，通常是研究员产出的研究报告"),
    }),
  }
);

// 2.3 评审工具
const reviewTool = tool(
  async (input) => {
    console.log(`   📝 评审员正在审阅文章...`);

    const sysPrompt = `你是一位专业的评审编辑。你的职责是：
1. 审阅文章内容的准确性、完整性和逻辑性
2. 从以下维度进行评审：
   - 内容准确性：事实是否正确
   - 结构完整性：是否有引言、主体、结论
   - 逻辑连贯性：段落之间过渡是否自然
   - 语言表达：是否清晰易懂
3. 给出评审结论：通过 / 修改后通过 / 需要重写
4. 如果建议修改，请说明具体的改进方向

输出格式化的评审报告。`;

    const result = await chatModel.invoke([
      { role: "system", content: sysPrompt },
      {
        role: "user",
        content: `请审阅以下文章并给出评审报告：\n\n文章：\n${input.article}`,
      },
    ]);

    console.log(`   ✅ 评审员完成评审\n`);
    return result.content;
  },
  {
    name: "review",
    description: "对文章进行评审并提出改进建议",
    schema: z.object({
      article: z.string().describe("需要评审的文章内容"),
    }),
  }
);

// ==================== 3. 创建主管代理 ====================
//
// 主管代理拥有三个子代理工具，根据任务复杂度决定调用策略

const supervisorAgent = createAgent({
  name: "supervisor",
  model: chatModel,
  tools: [researchTool, writeTool, reviewTool],
  systemPrompt: `你是一位项目主管，负责协调团队完成用户的请求。

## 你的团队
- research - 研究员（深入研究主题，输出研究报告）
- write - 写作者（根据研究素材撰写文章）
- review - 评审员（评审文章质量，提供修改建议）

## 工作流程
根据任务复杂度选择合适的策略：

### 简单任务（如询问概念、事实等）
→ 直接回答，不需要调用任何工具

### 中等复杂度任务（如写一篇文章）
→ 按顺序调用 research → write
  research 先研究主题，然后将研究结果传给 write 来撰写文章

### 复杂任务（需要高质量输出）
→ 按顺序调用 research → write → review
  如果 review 建议修改，再次调用 write 进行修改，
  直到 review 给出"通过"的评审结论

## 重要规则
1. 调用工具时要传递完整的上下文，确保子代理有足够信息
2. 获得工具返回结果后，检查是否满足任务要求
3. 如果 review 提出修改意见，再次调用 write 修改文章
4. 最终输出要整合各子代理的工作成果，给用户一个完整的答案
5. 用中文和用户沟通`,
});

// ==================== 4. 执行任务 ====================

// 可以修改这里的问题来测试不同的任务复杂度
const task = "帮我写一篇关于人工智能在医疗领域应用的文章，包括最新的技术进展和未来展望";

console.log("=".repeat(60));
console.log("🤖  多智能体系统 - subagents 模式");
console.log("=".repeat(60));
console.log(`\n📋 用户任务：${task}\n`);
console.log("-".repeat(60));
console.log("⏳ 主管代理正在协调子代理工作...\n");
console.log("-".repeat(60));

const result = await supervisorAgent.invoke({
  messages: [{ role: "user", content: task }],
});

console.log("=".repeat(60));
console.log("✅ 主管代理最终输出：");
console.log("=".repeat(60));
console.log('hxx',result.content);
