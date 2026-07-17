import { invokeAgent } from "../services/agent.service.js";
import { createError } from "../middleware/error.middleware.js";

/**
 * 处理 Agent 任务请求
 * POST /api/agent
 */
export async function agentController(req, res, next) {
  try {
    const { query } = req.body;

    if (!query || typeof query !== "string") {
      throw createError(400, "请提供 query 字段（字符串类型）");
    }

    const result = await invokeAgent(query);

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}
