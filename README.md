 # LangChain JavaScript 学习笔记

本仓库用于记录 LangChain.js 的学习过程与实践项目。

## 项目结构

```
langchain_javascript/
├── examples/           # LangChain 基础示例代码
│   ├── hello-world/    # 最简单的 Hello World 示例
│   ├── prompts/        # Prompt 模板与 Prompt 管理
│   ├── models/         # LLM 模型调用与对比
│   ├── chains/         # Chain 编排示例
│   └── agents/         # Agent 与工具调用
├── projects/           # 综合实践项目
├── notes/              # 学习笔记
└── package.json        # 项目依赖
```

## 环境要求

- Node.js >= 18
- npm / yarn

## 快速开始

```bash
# 安装依赖
npm install

# 运行示例
node examples/hello-world/index.js
```

## 学习路线

| 模块 | 内容 | 状态 |
|------|------|------|
| 环境变量配置 | `.env` 配置 OpenAI API Key | ⬜ |
| Prompts | Prompt Templates, Output Parsers | ⬜ |
| Models | Chat Models, LLMs | ⬜ |
| Chains | Sequential, LLMChain | ⬜ |
| Memory | Conversation Buffer Memory | ⬜ |
| Tools | Custom Tools, Built-in Tools | ⬜ |
| Agents | ReAct, Conversational Agent | ⬜ |
| Documents | Loading, Splitting, Embeddings | ⬜ |
| Vector Stores | FAISS, Chroma, Pinecone | ⬜ |
| RAG | Retrieval-Augmented Generation | ⬜ |
| Evaluation | 模型输出评估 | ⬜ |

## 相关资源

- [LangChain.js 官方文档](https://js.langchain.com/)
- [LangChain GitHub](https://github.com/langchain-ai/langchainjs)
- [OpenAI API 文档](https://platform.openai.com/docs)

## License

MIT
*** End of File
