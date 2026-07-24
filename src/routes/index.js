/*
 * @Author: hxx
 * @Date: 2026-07-20 15:05:29
 * @LastEditors: hxx
 * @LastEditTime: 2026-07-24 10:48:45
 */
import { Router } from "express";
import {
  rebuildController,
  ragChatStreamController,
} from "../controllers/rag.controller.js";

const router = Router();

// ===== 低空经济 RAG Agent 接口 =====

// 流式 RAG 问答（SSE）：实时展示检索进度和 LLM 生成
router.post("/rag/chat/stream", ragChatStreamController);

// 重建知识库向量索引
router.post("/rag/rebuild", rebuildController);

export default router;
