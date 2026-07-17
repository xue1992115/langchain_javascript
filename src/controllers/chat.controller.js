import { chat } from "../services/llm.service.js";
import { createError } from "../middleware/error.middleware.js";

/**
 * 处理聊天请求
 * POST /api/chat
 */
export async function chatController(req, res, next) {
  try {
    const { message, provider } = req.body;

    if (!message || typeof message !== "string") {
      throw createError(400, "请提供 message 字段（字符串类型）");
    }

    const reply = await chat(message, provider);

    res.json({
      success: true,
      data: {
        reply,
        provider: provider || "deepseek",
      },
    });
  } catch (err) {
    next(err);
  }
}
