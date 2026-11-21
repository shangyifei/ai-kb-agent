import { createOpenAI } from '@ai-sdk/openai';
import { streamText, UIMessage, convertToModelMessages, createUIMessageStreamResponse, toUIMessageStream, createUIMessageStream, generateText } from 'ai';
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
    const originalQuery = lastMessage.parts.find((p) => p.type === 'text')?.text || '';

    if (!originalQuery) {
        return new Response('No query found', { status: 400 });
    }

    let userQuery = originalQuery; // 默认使用原问题

    // 2. 如果存在多轮对话，使用 Vercel AI SDK 的 generateText 进行改写
    if (messages.length > 1) {
        try {
            // 提取最近几轮对话作为上下文
            const historyForRewrite = messages.slice(-4).map((m) => {
                const text = m.parts.find((p) => p.type === 'text')?.text || '';
                return `${m.role}: ${text}`;
            }).join('\n');

            // 用 Vercel AI SDK 直接调大模型改写
            const { text: rewrittenQuery } = await generateText({
                model: deepseek('deepseek-chat'),
                temperature: 0, // 设为0，保证每次改写结果最稳定
                system: '你是一个搜索查询重写助手。请根据历史对话，将用户最新的提问重写成一个独立、完整的搜索查询。如果最新提问本身已经完整，请直接输出原话。绝对不要输出任何解释，只输出重写后的那一句话。',
                prompt: `【历史对话】\n${historyForRewrite}\n\n【最新提问】\n${originalQuery}`,
            });

            // 清理一下大模型可能多输出的空格或换行
            userQuery = rewrittenQuery.trim();
            console.log(`原问题: "${originalQuery}" -> 改写后: "${userQuery}"`);

        } catch (e) {
            console.error('查询重写失败，使用原问题', e);
        }
    }

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
    if (res.rows.length > 0 && res.rows[0].similarity > 0.55) {
        retrievedContext = res.rows[0].content;
        console.log('数据库检索结果:', retrievedContext, '相似度:', res.rows[0].similarity);
    }

    // 7. 生成阶段：拼装 Prompt 发送给 DeepSeek
    const systemPrompt = `你是一个严谨的文档问答机器人。
【当前参考资料】：
${retrievedContext}

【最高指令】：
1. 你只能使用上面的【当前参考资料】来回答用户的最新提问。
2. 绝对禁止使用你自己大脑里的常识，绝对禁止参考历史对话。
3. 如果【当前参考资料】中找不到答案，请直接回复：“根据资料，我无法回答这个问题。”不要做任何猜测。
4. 回答前，先确认资料是否真的能解答用户的问题。
`;
    const result = streamText({
        model: deepseek('deepseek-chat'),
        system: systemPrompt,
        messages: await convertToModelMessages(messages.slice(-1)),
    });


    return createUIMessageStreamResponse({
        stream: createUIMessageStream({
            execute: ({ writer }) => {
                if (retrievedContext !== "没有找到相关资料") {
                    writer.write({
                        type: 'data-sources',
                        data: [retrievedContext],
                    });
                }
                writer.merge(toUIMessageStream({ stream: result.stream, sendStart: false }));
            },
        }),
    });
}
