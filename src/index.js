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
  [POST] /api/chat   - 对话聊天
  [POST] /api/agent  - Agent 任务
  [GET]  /api/health - 健康检查
`);
});
