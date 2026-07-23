/*
 * @Author: hxx
 * @Date: 2026-07-22 16:48:35
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-23 15:02:26
 */
/**
 * 1、防护栏 - PII中间件测试
 * 背景：在人工智能系统中经常出现各种意外情况，如防止个人信息泄漏、检测并阻止恶意攻击等。
 * 解决方法：利用内置提供的防护机制（例如个人身份信息检测），同时也提供了灵活的中间件系统。
 *
 * piiMiddleware 中间件处理用户的敏感信息，防止信息泄漏。
 *
 * 内置PII类型：
 *   - email: 电子邮件地址
 *   - credit_card: 信用卡号（经过Luhn算法验证）
 *   - ip: IP地址
 *   - mac_address: MAC地址
 *   - url: URL链接
 *
 * 策略有四种：
 *   redact：直接将敏感信息替换为 "[REDACTED_TYPE]"
 *   mask：部分遮盖敏感信息（如 "j***@domain.com"）
 *   hash：将敏感信息替换为哈希值 "<type_hash:xxxx>"
 *   block：直接拒绝包含敏感信息的请求，抛出 PIIDetectionError
 *
 * 本文件包含两部分测试：
 *   第一部分：纯函数测试（直接测试检测和策略函数，不需要API调用）
 *   第二部分：中间件测试（使用实际的 agent + piiMiddleware）
 * 
 * 
 * 2、Human-in-the-loop  人在回路中/人类参与控制过程
 * 背景：在人工智能系统中，人类参与控制过程是必要的，例如在处理敏感信息时需要人工确认。
 * 解决方法：使用 Human-in-the-loop 机制，在检测到敏感信息时，系统会暂停并请求人工确认。
 * 
 * 
 * 3、自定义防护工具
 */
import "dotenv/config";
import {
  piiMiddleware, createAgent, initChatModel, tool,
  detectEmail, detectCreditCard, detectIP, detectMacAddress, detectUrl,
  applyStrategy, PIIDetectionError,
  humanInTheLoopMiddleware
} from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { MemorySaver, Command } from "@langchain/langgraph";
import * as z from "zod";

// ============================================================
// 第一部分：纯函数测试 — 直接测试 PII 检测和策略应用
// 这部分不需要 API 调用，可以快速验证
// ============================================================
console.log("=".repeat(60));
console.log("📋 第一部分：PII 纯函数测试");
console.log("=".repeat(60));

// 测试内容
const testContent = `
  个人信息：
  - 邮箱: john.doe@example.com
  - 信用卡: 5105-1051-0510-5100
  - IP地址: 192.168.1.100
  - MAC地址: 00:1A:2B:3C:4D:5E
  - API密钥: sk-abcdef1234567890abcdef1234567890
`;

console.log("\n📝 原始内容:");
console.log(testContent);

// 1. 测试各种 PII 检测函数
console.log("\n" + "-".repeat(40));
console.log("🔍 1. 测试 PII 检测函数:");
console.log("-".repeat(40));

const emailMatches = detectEmail(testContent);
console.log(`📧 检测到邮箱: ${emailMatches.length > 0 ? emailMatches.map(m => m.text).join(", ") : "无"}`);

const cardMatches = detectCreditCard(testContent);
console.log(`💳 检测到信用卡: ${cardMatches.length > 0 ? cardMatches.map(m => m.text).join(", ") : "无"}`);

const ipMatches = detectIP(testContent);
console.log(`🌐 检测到IP地址: ${ipMatches.length > 0 ? ipMatches.map(m => m.text).join(", ") : "无"}`);

const macMatches = detectMacAddress(testContent);
console.log(`🔗 检测到MAC地址: ${macMatches.length > 0 ? macMatches.map(m => m.text).join(", ") : "无"}`);

const urlMatches = detectUrl(testContent);
console.log(`🔗 检测到URL: ${urlMatches.length > 0 ? urlMatches.map(m => m.text).join(", ") : "无"}`);

// 2. 测试各种策略（使用独立的测试字符串和重新检测）
console.log("\n" + "-".repeat(40));
console.log("🛡️  2. 测试各策略效果（使用邮箱检测）:");
console.log("-".repeat(40));

// ⚠️ 注意：每次测试必须对目标字符串重新检测 PII，
// 因为 match 对象中的 start/end 位置是相对于检测时的原始字符串的
const testEmailStr = "请联系 john.doe@example.com 获取帮助";
const testEmailStrMatches = detectEmail(testEmailStr);

// 2a. redact 策略
const redacted = applyStrategy(testEmailStr, testEmailStrMatches, "redact", "email");
console.log(`🔴 redact  : ${redacted}`);

// 2b. mask 策略
const masked = applyStrategy(testEmailStr, testEmailStrMatches, "mask", "email");
console.log(`🟡 mask    : ${masked}`);

// 2c. hash 策略
const hashed = applyStrategy(testEmailStr, testEmailStrMatches, "hash", "email");
console.log(`🟢 hash    : ${hashed}`);

// 2d. block 策略
console.log(`🔵 block   : `);
try {
  applyStrategy(testEmailStr, testEmailStrMatches, "block", "email");
  console.log("   ❌ 未抛出异常（异常！）");
} catch (e) {
  if (e instanceof PIIDetectionError) {
    console.log(`   ✅ 抛出 PIIDetectionError: PII 类型 = ${e.piiType}, 匹配数 = ${e.matches.length}`);
  } else {
    console.log(`   ❌ 抛出未知异常: ${e}`);
  }
}

// 3. 测试信用卡 mask 策略（特殊遮盖格式）
console.log("\n" + "-".repeat(40));
console.log("💳 3. 测试信用卡 mask 策略:");
console.log("-".repeat(40));

const cardContent = "信用卡号是 5105-1051-0510-5100";
const cardMatchesOnly = detectCreditCard(cardContent);
const cardMasked = applyStrategy(cardContent, cardMatchesOnly, "mask", "credit_card");
console.log(`   原始: ${cardContent}`);
console.log(`   mask: ${cardMasked}`);

// 4. 测试自定义 PII 类型（API密钥检测）
console.log("\n" + "-".repeat(40));
console.log("🔑 4. 测试自定义 PII 类型:");
console.log("-".repeat(40));

// 直接用自定义正则做检测
const apiKeyPattern = /sk-[a-zA-Z0-9]{32}/g;
const apiKeyContent = "我的 API Key 是 sk-abcdef1234567890abcdef1234567890，请勿泄露";
const apiKeyMatches = [];
let apiMatch;
const regexCopy = new RegExp(apiKeyPattern);
while ((apiMatch = regexCopy.exec(apiKeyContent)) !== null) {
  apiKeyMatches.push({
    text: apiMatch[0],
    start: apiMatch.index,
    end: apiMatch.index + apiMatch[0].length,
  });
}
console.log(`   检测到: ${apiKeyMatches.length > 0 ? apiKeyMatches.map(m => m.text).join(", ") : "无"}`);

const apiKeyRedacted = applyStrategy(apiKeyContent, apiKeyMatches, "redact", "api_key");
console.log(`   redact: ${apiKeyRedacted}`);

const apiKeyBlocked = () => {
  try {
    applyStrategy(apiKeyContent, apiKeyMatches, "block", "api_key");
    return "❌ 未拦截";
  } catch (e) {
    if (e instanceof PIIDetectionError) return `✅ 已拦截: ${e.message}`;
    return `❌ 异常: ${e}`;
  }
};
console.log(`   block : ${apiKeyBlocked()}`);

// 5. 测试多类型混合处理
console.log("\n" + "-".repeat(40));
console.log("🔄 5. 测试混合类型处理:");
console.log("-".repeat(40));

const mixedContent = "邮箱: alice@test.com, 信用卡: 4111-1111-1111-1111, IP: 10.0.0.1";
const mixedEmailMatches = detectEmail(mixedContent);
const mixedCardMatches = detectCreditCard(mixedContent);
const mixedIPMatches = detectIP(mixedContent);

console.log(`   原始: ${mixedContent}`);
// 依次应用不同策略
let step1 = applyStrategy(mixedContent, mixedEmailMatches, "mask", "email");
console.log(`   ① email(mask): ${step1}`);
let step2 = applyStrategy(step1, mixedCardMatches, "redact", "credit_card");
console.log(`   ② card(redact): ${step2}`);
let step3 = applyStrategy(step2, mixedIPMatches, "hash", "ip");
console.log(`   ③ ip(hash):     ${step3}`);

// ============================================================
// 第二部分：中间件测试 — 使用实际的 agent + piiMiddleware
// 这需要实际的 API 调用（使用 MiniMax 模型）
// 使用 AbortController 设置超时避免长时间卡住
// ============================================================
console.log("\n\n" + "=".repeat(60));
console.log("🤖 第二部分：PII 中间件测试（需要 API 调用）");
console.log("=".repeat(60));

const chatMiniMax = new ChatOpenAI({
  model: "MiniMax-M2.7",
  apiKey: process.env.MINIMAX_API_KEY,
  configuration: { baseURL: process.env.MINIMAX_API_BASE_URL },
  temperature: 0,
});

// 定义一个工具，用于发送邮件
const emailTool = tool(
    ({ to, subject, body }) => {
        console.log(`\n📧 [工具执行] 发送邮件: to=${to}, subject=${subject}, body=${body}`);
        return `邮件发送成功: 已发送至 ${to}`;
    },
    {
        name: "email",
        description: "发送邮件的工具，需要提供收件人地址、邮件主题和正文",
        schema: z.object({
            to: z.string().describe("收件人邮箱地址"),
            subject: z.string().describe("邮件主题"),
            body: z.string().describe("邮件正文"),
        })
    }
);

// 带超时的 invoke 包装函数
async function invokeWithTimeout(agent, input, timeoutMs = 60000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await agent.invoke(input, { signal: controller.signal });
    clearTimeout(timeoutId);
    return result;
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

// 策略1: redact — 将敏感信息替换为 [REDACTED_TYPE]
console.log("\n" + "-".repeat(40));
console.log("🔴 测试策略1 — redact（替换为 [REDACTED_TYPE]）");
console.log("-".repeat(40));

const agentRedact = createAgent({
  model: chatMiniMax,
  tools: [emailTool],
  middleware: [
    piiMiddleware("email", { strategy: "redact" }),
    piiMiddleware("credit_card", { strategy: "redact" }),
  ],
});

try {
  console.log("   发送: 'My email is john.doe@example.com and card is 5105-1051-0510-5100'");
  const result1 = await invokeWithTimeout(agentRedact, {
    messages: [{
      role: "user",
      content: "My email is john.doe@example.com and card is 5105-1051-0510-5100"
    }]
  });
  console.log(`   ✅ 成功，邮箱和信用卡已被 [REDACTED_*] 替换`);
} catch (e) {
  if (e.name === "AbortError") {
    console.log(`   ⏱️ 超时（API响应过慢）`);
  } else {
    console.log(`   ❌ 错误: ${e.message}`);
  }
}

// 策略2: mask — 部分遮盖敏感信息
console.log("\n" + "-".repeat(40));
console.log("🟡 测试策略2 — mask（部分遮盖）");
console.log("-".repeat(40));

const agentMask = createAgent({
  model: chatMiniMax,
  tools: [emailTool],
  middleware: [
    piiMiddleware("email", { strategy: "mask" }),
    piiMiddleware("credit_card", { strategy: "mask" }),
  ],
});

try {
  console.log("   发送: 'My email is john.doe@example.com and card is 5105-1051-0510-5100'");
  const result2 = await invokeWithTimeout(agentMask, {
    messages: [{
      role: "user",
      content: "My email is john.doe@example.com and card is 5105-1051-0510-5100"
    }]
  });
  console.log(`   ✅ 成功`);
} catch (e) {
  if (e.name === "AbortError") {
    console.log(`   ⏱️ 超时（API响应过慢）`);
  } else {
    console.log(`   ❌ 错误: ${e.message}`);
  }
}

// 策略3: hash — 替换为哈希值
console.log("\n" + "-".repeat(40));
console.log("🟢 测试策略3 — hash（哈希替换）");
console.log("-".repeat(40));

const agentHash = createAgent({
  model: chatMiniMax,
  tools: [emailTool],
  middleware: [
    piiMiddleware("email", { strategy: "hash" }),
  ],
});

try {
  console.log("   发送: 'Contact me at alice@test.com'");
  const result3 = await invokeWithTimeout(agentHash, {
    messages: [{
      role: "user",
      content: "Contact me at alice@test.com"
    }]
  });
  console.log(`   ✅ 成功，邮箱已被哈希替换`, result3);
} catch (e) {
  if (e.name === "AbortError") {
    console.log(`   ⏱️ 超时（API响应过慢）`);
  } else {
    console.log(`   ❌ 错误: ${e.message}`);
  }
}

// 策略4: block — 拒绝包含敏感信息的请求
console.log("\n" + "-".repeat(40));
console.log("🔵 测试策略4 — block（直接拒绝）");
console.log("-".repeat(40));

const agentBlock = createAgent({
  model: chatMiniMax,
  tools: [emailTool],
  middleware: [
    piiMiddleware("email", { strategy: "block" }),
  ],
});

try {
  console.log("   发送: 'My email is user@example.com'");
  const result4 = await invokeWithTimeout(agentBlock, {
    messages: [{
      role: "user",
      content: "My email is user@example.com"
    }]
  });
  console.log(`   ⚠️ 未抛出异常（可能邮件格式未匹配）`);
} catch (e) {
  if (e.name === "AbortError") {
    console.log(`   ⏱️ 超时（API响应过慢）`);
  } else if (e instanceof PIIDetectionError) {
    console.log(`   ✅ 抛出了 PIIDetectionError: ${e.message}`);
  } else {
    console.log(`   ❌ 其他错误: ${e.constructor.name}: ${e.message}`);
  }
}

// ============================================================
// 第三部分：Human-in-the-loop — 人工确认机制
// 背景：当 AI 执行敏感操作（发送邮件、删除数据）时需要人工确认
// 使用 humanInTheLoopMiddleware + MemorySaver 实现中断/恢复
// ============================================================
console.log("\n\n" + "=".repeat(60));
console.log("🤝 第三部分：Human-in-the-Loop 测试");
console.log("=".repeat(60));
console.log("⚠️  注意：HITL 需要 checkpointer（MemorySaver），首次 invoke");
console.log("   会被中断（__interrupt__），需要使用 Command({ resume }) 恢复执行");
console.log("-".repeat(40));

// MemorySaver 用于保存中断状态，必须要有
const memory = new MemorySaver();

const agentWithHITL = createAgent({
  model: chatMiniMax,
  tools: [emailTool],
  checkpointer: memory,  // 必须提供 checkpointer 才能处理中断
  middleware: [
    humanInTheLoopMiddleware({
      interruptOn: {
        // 工具名称必须与 tool() 定义中的 name 一致（这里是 "email"）
        email: {
          allowedDecisions: ["approve", "edit", "reject"],
          description: "⚠️ 发送邮件需要人工确认，请审核后再操作",
        },
        // 如果后续添加其他工具，可以用 false 自动放行
      },
      descriptionPrefix: "人工审核请求",
    }),
  ],
});

// 线程 ID，用于跨多次 invoke 恢复状态
const threadConfig = { configurable: { thread_id: "hitl-email-demo" } };

// 使用带超时的 invoke，HITL 部分给更长的时间
async function invokeWithTimeoutHITL(agent, input, config, timeoutMs = 90000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await agent.invoke(input, { ...config, signal: controller.signal });
    clearTimeout(timeoutId);
    return result;
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

try {
  console.log("\n📤 第1步：发送请求");
  console.log("   用户: '给 john.doe@example.com 发送一封邮件，主题为「Hello」，内容为「这是一封测试邮件」'");
  console.log("   预期：AI 会调用 email 工具 → HITL 中间件检测到工具调用 → 中断等待确认");
  const step1 = await invokeWithTimeoutHITL(agentWithHITL, {
    messages: [{
      role: "user",
      content: "给 john.doe@example.com 发送一封邮件，主题为「Hello」，内容为「这是一封测试邮件」",
    }],
  }, threadConfig, 120000);

  // 检查是否被中断
  if (step1.__interrupt__) {
    console.log("   ✅ 请求已被 HITL 中间件中断，等待人工确认");
    console.log(`   中断信息: ${JSON.stringify(step1.__interrupt__[0]?.value, null, 2)}`);

    // 模拟人工审核通过（在真实场景中，这里会弹出界面让用户选择）
    console.log("\n📤 第2步：人工审核通过，使用 Command({ resume }) 恢复");
    const step2 = await agentWithHITL.invoke(
      new Command({
        resume: {
          decisions: [{
            type: "approve",  // 批准执行
          }],
        },
      }),
      threadConfig,
    );
    console.log(`   最终结果: ${JSON.stringify(step2.messages?.[step2.messages.length - 1]?.content ?? step2)}`);
  } else {
    console.log("   ⚠️ 请求未被中断（可能未触发工具调用）");
    console.log(`   直接结果: ${JSON.stringify(step1)}`);
  }
} catch (e) {
  if (e.name === "AbortError") {
    console.log("   ⏱️ API 调用超时（模型响应过慢）");
  } else {
    console.log(`   ❌ 错误: ${e.constructor.name}: ${e.message}`);
  }
}

// 全部完成
console.log("\n" + "=".repeat(60));
console.log("✅ 所有测试完成");
console.log("=".repeat(60));