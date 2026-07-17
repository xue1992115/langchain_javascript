# LangChain JavaScript 后端 API

基于 **Express.js** + **LangChain.js** 构建的 AI 后端服务，提供大模型对话和智能 Agent 能力。

## 项目结构

```
langchain_javascript/
├── src/                     # 后端源码
│   ├── index.js            # 服务入口
│   ├── app.js              # Express 应用配置
│   ├── config/             # 配置管理
│   │   └── index.js
│   ├── routes/             # API 路由
│   │   └── index.js
│   ├── controllers/        # 请求控制器
│   │   ├── chat.controller.js
│   │   └── agent.controller.js
│   ├── services/           # 业务逻辑层
│   │   ├── llm.service.js  # 大模型服务
│   │   └── agent.service.js# Agent 服务
│   └── middleware/         # 中间件
│       ├── error.middleware.js
│       └── logger.middleware.js
├── examples/               # LangChain 学习示例
├── .env                    # 环境变量
└── package.json
```

## 环境要求

- Node.js >= 18

## 快速开始

```bash
# 安装依赖
pnpm install

# 配置环境变量
# 复制 .env 并填写对应 API Key

# 开发模式启动（热重载）
pnpm dev

# 生产模式启动
pnpm start
```

## API 接口

### 健康检查

```bash
curl http://localhost:3000/api/health
```

### 对话聊天

向大模型发送消息并获取回复。

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "你好，介绍一下你自己"}'
```

**参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | string | 是 | 用户消息 |
| `provider` | string | 否 | 模型提供商，`deepseek` 或 `openai`，默认 `deepseek` |

### Agent 任务

使用具备工具调用能力的智能 Agent 处理任务。

```bash
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"query": "今天西安的天气怎么样？"}'
```

**参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | 是 | 用户问题或任务描述 |

## 配置

通过 `.env` 文件配置：

| 变量 | 说明 |
|------|------|
| `PORT` | 服务端口，默认 3000 |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 |
| `DEEPSEEK_BASE_URL` | DeepSeek API 地址 |
| `DEEPSEEK_MODEL` | DeepSeek 模型名称 |
| `OPENAI_API_KEY` | OpenAI API 密钥 |
| `OPENAI_MODEL` | OpenAI 模型名称 |
| `NODE_ENV` | 运行环境 |

## 学习资源

仓库保留了 `examples/` 目录，用于 LangChain.js 的学习与实践。

- [LangChain.js 官方文档](https://js.langchain.com/)
- [LangChain GitHub](https://github.com/langchain-ai/langchainjs)

## License

MIT
