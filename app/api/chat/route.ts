import { createOpenAI } from '@ai-sdk/openai';
import { streamText, UIMessage, convertToModelMessages, createUIMessageStreamResponse, toUIMessageStream } from 'ai';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';



// 1. 配置 DeepSeek 用于对话生成
const deepseek = createOpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY,
});

// 读取现有的向量库（为了演示方便，每次请求时读，真实工程会放在内存或专门的数据库）
function loadVectorStore() {
    const filePath = path.join(process.cwd(), 'data', 'vector-store.json');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(fileContent);
}
// 2. 调用智谱的 Embedding API 获取向量
async function getEmbedding(text: string): Promise<number[]> {
    const res = await fetch('https://open.bigmodel.cn/api/paas/v4/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.ZHIPU_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'embedding-3', // 智谱的向量模型
            input: text,
        }),
    });

    if (!res.ok) {
        console.error('Embedding 请求失败', await res.text());
        throw new Error('Embedding 失败');
    }

    const data = await res.json();
    return data.data[0].embedding; // 返回向量数组，例如 [0.12, -0.54, ...]
}

export async function POST(req: Request) {
    const { messages }: { messages: UIMessage[] } = await req.json();

    // 获取用户最新一句话的文本内容
    const lastMessage = messages[messages.length - 1];
    const userQuery = lastMessage.parts.find((p) => p.type === 'text')?.text || '';

    if (!userQuery) {
        return new Response('No query found', { status: 400 });
    }

    console.log('用户提问:', userQuery);

    // 4. 检索阶段：把问题变成向量
    const queryVector = await getEmbedding(userQuery);
    const queryVectorString = `[${queryVector.join(',')}]`;
    // 2. 连数据库，直接用 pgvector 的 <=> 操作符算余弦距离
    const client = new Client({
        connectionString: 'postgresql://shangyifei@localhost:5432/ai_kb'
    });
    await client.connect();
    const res = await client.query(
        `SELECT content, 1 - (embedding <=> $1) AS similarity 
     FROM documents 
     ORDER BY embedding <=> $1 
     LIMIT 1`,
        [queryVectorString]
    );

    await client.end();

    let retrievedContext = "没有找到相关资料";
    if (res.rows.length > 0 && res.rows[0].similarity > 0.4) {
        retrievedContext = res.rows[0].content;
        console.log('数据库检索结果:', retrievedContext, '相似度:', res.rows[0].similarity);
    }

    // 7. 生成阶段：拼装 Prompt 发送给 DeepSeek
    const systemPrompt = `你是一个公司助手。请严格根据以下参考资料回答用户的问题。如果参考资料里没有相关答案，请直接回答“我不知道”。\n\n参考资料：\n${retrievedContext}`;

    const result = streamText({
        model: deepseek('deepseek-chat'),
        system: systemPrompt,
        messages: await convertToModelMessages(messages),
    });


    return createUIMessageStreamResponse({
        stream: toUIMessageStream({ stream: result.stream }),
    });
}
