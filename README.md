# AI 智能知识库助手 (AI KB Agent)

一个基于 Next.js 和 RAG 架构的全栈 AI 应用，支持上传文档并进行流式问答。

## 技术栈
- **前端/全栈框架**: Next.js (App Router), React, Tailwind CSS
- **AI 交互**: Vercel AI SDK, DeepSeek (流式对话)
- **向量化**: 智谱 Embedding-3
- **数据库**: PostgreSQL + pgvector (余弦相似度检索)
- **文档解析**: unpdf

## 核心功能
1. **流式对话**: 丝滑的打字机效果。
2. **文档解析与切块**: 支持上传 PDF/TXT，自动提取文本并按 500 字符切块。
3. **离线建库与在线检索**: 自动调用 Embedding API 将文档向量化并存入 PostgreSQL，提问时通过 `<=>` 操作符进行相似度检索。
4. **RAG 防幻觉**: 结合检索到的上下文生成回答，拒绝大模型胡编乱造。

## 本地启动指南
1. 安装依赖：`npm install`
2. 配置 `.env.local`（需要 DeepSeek 和智谱的 API Key）
3. 启动本地数据库并建表（附上建表 SQL）
4. 启动开发服务器：`npm run dev`