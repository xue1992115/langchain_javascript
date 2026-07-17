import { Router } from "express";
import { chatController } from "../controllers/chat.controller.js";
import { agentController } from "../controllers/agent.controller.js";

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

export default router;
