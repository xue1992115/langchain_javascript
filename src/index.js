import app from "./app.js";
import { config } from "./config/index.js";

const { port, env } = config;

// 启动时预构建向量存储（避免首次请求等待）
try {
  const { buildVectorStore } = await import("./services/rag.service.js");
  await buildVectorStore();
  console.log("[启动] ✅ 向量存储已就绪");
} catch (err) {
  console.warn("[启动] ⚠️ 向量存储构建跳过:", err.message);
}

app.listen(port, () => {
  console.log(`
🚀 LangChain API Server 已启动
──────────────────────────────
  环境:     ${env}
  端口:     ${port}
  地址:     http://localhost:${port}
  API 文档: http://localhost:${port}/api/health
──────────────────────────────
  [POST] /api/chat        - 对话聊天
  [POST] /api/agent       - Agent 任务
  [GET]  /api/health      - 健康检查
  [POST] /api/rag/query   - RAG 知识问答（低空经济）
  [POST] /api/rag/agent   - RAG Agent 智能代理（低空经济）
  [POST] /api/rag/chat/stream - RAG 流式问答（SSE）
  [POST] /api/rag/rebuild - 重建知识库索引
  [GET]  /api/rag/status  - RAG 系统状态
`);
});
