import { createOpenAI } from '@ai-sdk/openai';
import { streamText, UIMessage, convertToModelMessages, createUIMessageStreamResponse, toUIMessageStream, } from 'ai';

const deepseek = createOpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY,
});

// 1. 模拟我们的“本地知识库”
const knowledgeBase = [
    { text: "公司的年假制度是：入职满1年有5天年假，满3年有10天年假。" },
    { text: "公司的报销流程是：需要在每月25号前，将发票拍照上传到财务系统。" },
    { text: "老板的名字叫王建国，他非常讨厌员工迟到。" },
];

export async function POST(req: Request) {
    const { messages }: { messages: UIMessage[] } = await req.json();
    const lastMessage = messages[messages.length - 1];

    // 提取用户最新的问题文本 (这里简单处理一下)
    const userQuery = lastMessage.parts.find(p => p.type === 'text')?.text || "";
    console.log("用户提问:", userQuery);

    // 2. 【检索阶段】真实情况下这里会用 Embedding 去算余弦相似度。
    // 为了今天先跑通，我们用一个极其粗暴的关键词匹配来模拟检索！
    let retrievedContext = "";
    if (userQuery.includes("年假")) {
        retrievedContext = knowledgeBase[0].text;
    } else if (userQuery.includes("报销")) {
        retrievedContext = knowledgeBase[1].text;
    } else if (userQuery.includes("老板")) {
        retrievedContext = knowledgeBase[2].text;
    }

    console.log("检索到的上下文:", retrievedContext);

    // 3. 【生成阶段】把检索到的内容和用户的问题拼在一起，发给大模型
    // 注意这里我们加了一个 system prompt 来约束 AI
    const systemPrompt = `你是一个公司助手。请根据以下参考资料回答用户的问题。如果参考资料里没有，请回答“我不知道”。\n参考资料：${retrievedContext || "无"}`;

    const result = streamText({
        model: deepseek('deepseek-chat'), // 注意：deepseek-flash 可能不支持复杂的 system prompt，换回 chat
        system: systemPrompt,
        messages: await convertToModelMessages(messages),
    });

    return createUIMessageStreamResponse({
        stream: toUIMessageStream({ stream: result.stream }),
    });
}
