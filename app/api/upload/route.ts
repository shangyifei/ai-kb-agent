import { NextResponse } from 'next/server';
import { Client } from 'pg';
import { extractText, getDocumentProxy } from 'unpdf';

async function getEmbedding(text: string): Promise<number[]> {
    const res = await fetch('https://open.bigmodel.cn/api/paas/v4/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.ZHIPU_API_KEY}`,
        },
        body: JSON.stringify({ model: 'embedding-3', input: text }),
    });
    const data = await res.json();
    return data.data[0].embedding;
}

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: '没有收到文件' }, { status: 400 });
        }

        // 1. 提取文本
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        let text = '';

        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
            const uint8 = new Uint8Array(buffer);
            const pdf = await getDocumentProxy(uint8);
            const { text: pdfText } = await extractText(pdf, { mergePages: true });
            text = pdfText;
        } else {
            // 当作纯文本处理
            text = buffer.toString('utf-8');
        }

        if (!text.trim()) {
            return NextResponse.json({ error: '文件内容为空' }, { status: 400 });
        }

        // 2. 简单的文本切块（每500字一块）
        const chunkSize = 500;
        const chunks = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.slice(i, i + chunkSize));
        }

        console.log(`文件解析成功，共切分为 ${chunks.length} 块，开始向量化入库...`);

        // 3. 连数据库，循环入库
        const client = new Client({
            connectionString: 'postgresql://shangyifei@localhost:5432/ai_kb'
        });
        await client.connect();

        for (const chunk of chunks) {
            if (chunk.trim().length < 10) continue; // 忽略太短的碎片

            const vector = await getEmbedding(chunk);
            const vectorString = `[${vector.join(',')}]`;

            await client.query(
                'INSERT INTO documents (content, embedding) VALUES ($1, $2)',
                [chunk, vectorString]
            );
        }

        await client.end();

        return NextResponse.json({ success: true, message: `成功入库 ${chunks.length} 个片段` });

    } catch (error) {
        console.error('上传解析失败:', error);
        return NextResponse.json({ error: '上传解析失败' }, { status: 500 });
    }
}