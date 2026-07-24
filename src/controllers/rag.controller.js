/**
 * 低空经济 RAG Agent 控制器
 *
 * 处理低空经济相关的 RAG 问答和 Agent 任务请求。
 */

import {
  getRAGStatus,
  streamRAGChat,
  buildVectorStore,
} from "../services/rag.service.js";
import { createError } from "../middleware/error.middleware.js";

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
 * 流式 RAG 问答（SSE）
 * POST /api/rag/chat/stream
 *
 * 逐步推送事件，让前端实时展示检索进度和 LLM 生成内容。
 * 前端使用 fetch + ReadableStream 消费 SSE 事件流。
 */
export async function ragChatStreamController(req, res, next) {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return next(createError(400, "请提供 messages 数组（对话消息列表）"));
  }

  // 获取最后一条用户消息
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMsg) {
    return next(createError(400, "缺少用户消息"));
  }
  const query = lastUserMsg.content;

  // 设置 SSE 响应头并立即刷新
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  if (res.socket) res.socket.setNoDelay(true);
  res.flushHeaders();

  // 发送 SSE 事件
  const send = (event, data) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      console.error("[SSE] write error:", e.message);
    }
  };

  let aborted = false;
  req.on("close", () => { aborted = true; });

  try {
    await streamRAGChat(messages, (event) => {
      if (res.destroyed || res.writableEnded) { aborted = true; return; }
      send(event.type, event.data);
    });
  } catch (err) {
    if (!res.destroyed && !res.writableEnded) {
      send("error", { message: err.message || "流式处理异常" });
    }
  } finally {
    if (!res.destroyed && !res.writableEnded) {
      res.end();
    }
  }
}
