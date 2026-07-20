import { Router } from "express";
import { chatController } from "../controllers/chat.controller.js";
import { agentController } from "../controllers/agent.controller.js";
import {
  ragAgentController,
  ragQueryController,
  rebuildController,
  statusController,
} from "../controllers/rag.controller.js";

const router = Router();

// 健康检查
router.get("/health", (_req, res) => {
  res.json({
    success: true,
    data: {
      status: "ok",
      timestamp: new Date().toISOString(),
    },
  });
});

// 聊天接口
router.post("/chat", chatController);

// Agent 接口
router.post("/agent", agentController);

// ===== 低空经济 RAG Agent 接口 =====

// RAG Agent（工具增强型）：问低空经济问题
router.post("/rag/agent", ragAgentController);

// 直接 RAG 问答：知识检索 + 生成回答
router.post("/rag/query", ragQueryController);

// 重建知识库向量索引
router.post("/rag/rebuild", rebuildController);

// 查询 RAG 系统状态
router.get("/rag/status", statusController);

export default router;
