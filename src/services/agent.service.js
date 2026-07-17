import { ChatOpenAI } from "@langchain/openai";
import { createAgent, tool } from "langchain";
import { z } from "zod";
import { config } from "../config/index.js";

/**
 * 创建 DeepSeek LLM 实例（供 Agent 使用）
 */
function createAgentLLM() {
  return new ChatOpenAI(
    {
      model: config.llm.deepseek.model,
      temperature: 0.7,
    },
    {
      baseURL: config.llm.deepseek.baseUrl,
      apiKey: config.llm.deepseek.apiKey,
    }
  );
}

/**
 * 天气查询工具
 * 演示 Agent 的工具调用能力
 */
const getWeather = tool(
  async ({ city }) => {
    // 实际项目中可调用真实天气 API
    return `${city}的天气是晴天，温度 25°C，适宜出行。`;
  },
  {
    name: "getWeather",
    description: "查询指定城市的当前天气情况",
    schema: z.object({
      city: z.string().describe("城市名称，例如：西安、北京、上海"),
    }),
  }
);

/**
 * 调用 Agent 处理用户任务
 * @param {string} query - 用户的问题或任务描述
 * @returns {Promise<{ content: string; steps?: unknown[] }>}
 */
export async function invokeAgent(query) {
  const llm = createAgentLLM();

  const agent = await createAgent({
    model: llm,
    tools: [getWeather],
  });

  const response = await agent.invoke({ input: query });

  return {
    content: response.output || response.text || JSON.stringify(response),
    steps: response.intermediateSteps,
  };
}
