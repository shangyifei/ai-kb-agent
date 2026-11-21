import { createOpenAI } from '@ai-sdk/openai';
import { streamText, UIMessage, convertToModelMessages, createUIMessageStreamResponse, toUIMessageStream } from 'ai';
import fs from 'fs';
import path from 'path';

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

// 3. 计算两个向量的余弦相似度
// 相似度越接近 1，说明两段话的意思越相近
function cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
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
    const vectorStore = loadVectorStore();

    // 5. 遍历知识库，计算相似度
    let bestMatch = '';
    let highestScore = -1;

    for (const item of vectorStore) {
        const score = cosineSimilarity(queryVector, item.vector);
        if (score > highestScore) {
            highestScore = score;
            bestMatch = item.text;
        }
    }


    // 6. 拼装上下文
    // 我们设定一个阈值（比如0.5），如果最高分都低于这个值，说明知识库里没有相关内容
    let retrievedContext = "没有找到相关资料";
    if (highestScore > 0.4 && bestMatch) {
        retrievedContext = bestMatch;
    }
    console.log('当前提问:', userQuery);
    console.log('匹配得分:', highestScore);
    console.log('检索到的上下文:', retrievedContext);
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
