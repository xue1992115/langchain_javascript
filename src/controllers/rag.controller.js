/**
 * 低空经济 RAG Agent 控制器
 *
 * 处理低空经济相关的 RAG 问答和 Agent 任务请求。
 */

import { invokeRAGAgent } from "../services/rag-agent.service.js";
import { queryLowAltitudeKnowledge, getRAGStatus } from "../services/rag.service.js";
import { buildVectorStore } from "../services/rag.service.js";
import { createError } from "../middleware/error.middleware.js";

/**
 * RAG Agent 任务接口
 * POST /api/rag/agent
 * 使用 Agent（工具调用）+ RAG 检索来回答问题
 */
export async function ragAgentController(req, res, next) {
  try {
    const { query } = req.body;

    if (!query || typeof query !== "string") {
      throw createError(400, "请提供 query 字段（字符串类型）");
    }

    const result = await invokeRAGAgent(query);

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 直接 RAG 问答接口
 * POST /api/rag/query
 * 直接使用 RAG 检索 + 生成回答（不带 Agent 工具层）
 */
export async function ragQueryController(req, res, next) {
  try {
    const { query } = req.body;

    if (!query || typeof query !== "string") {
      throw createError(400, "请提供 query 字段（字符串类型）");
    }

    const result = await queryLowAltitudeKnowledge(query);

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 重新构建知识库向量索引
 * POST /api/rag/rebuild
 */
export async function rebuildController(req, res, next) {
  try {
    await buildVectorStore(true);

    const status = await getRAGStatus();

    res.json({
      success: true,
      message: "知识库向量索引重建完成",
      data: status,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * RAG 系统状态接口
 * GET /api/rag/status
 */
export async function statusController(req, res, next) {
  try {
    const status = await getRAGStatus();

    res.json({
      success: true,
      data: status,
    });
  } catch (err) {
    next(err);
  }
}
