import { createOpenAI } from '@ai-sdk/openai';
import { streamText, UIMessage, convertToModelMessages, createUIMessageStreamResponse, toUIMessageStream } from 'ai';

// 1. 配置 DeepSeek 用于对话生成
const deepseek = createOpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY,
});

// 模拟我们的“本地知识库”
const knowledgeBase = [
    { text: "公司的年假制度是：入职满1年有5天年假，满3年有10天年假。" },
    { text: "公司的报销流程是：需要在每月25号前，将发票拍照上传到财务系统。" },
    { text: "老板的名字叫王建国，他非常讨厌员工迟到。" },
];

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

    // 5. 遍历知识库，计算相似度
    let bestMatchIndex = -1;
    let highestScore = -1;

    // 注意：真实工程中，知识库的向量应该预先计算好存起来。这里为了演示，每次提问都临时计算。
    for (let i = 0; i < knowledgeBase.length; i++) {
        const docVector = await getEmbedding(knowledgeBase[i].text);
        const score = cosineSimilarity(queryVector, docVector);
        console.log(`与段落 ${i} 的相似度:`, score);

        if (score > highestScore) {
            highestScore = score;
            bestMatchIndex = i;
        }
    }

    // 6. 拼装上下文
    // 我们设定一个阈值（比如0.5），如果最高分都低于这个值，说明知识库里没有相关内容
    let retrievedContext = "没有找到相关资料";
    if (highestScore > 0.4 && bestMatchIndex !== -1) {
        retrievedContext = knowledgeBase[bestMatchIndex].text;
    }

    console.log('最终检索到的上下文:', retrievedContext, '相似度得分:', highestScore);

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
