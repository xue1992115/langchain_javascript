import app from "./app.js";
import { config } from "./config/index.js";

const { port, env } = config;

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
  [POST] /api/rag/rebuild - 重建知识库索引
  [GET]  /api/rag/status  - RAG 系统状态
`);
});
