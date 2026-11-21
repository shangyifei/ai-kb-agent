// build-embeddings.ts
import fs from 'fs';
import path from 'path';

import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// 连接数据库
const client = new Client({
  // Postgres.app 默认没有密码，用户名就是你的 mac 用户名
  connectionString: 'postgresql://shangyifei@localhost:5432/ai_kb'
});

const knowledgeBase = [
  { text: "公司的年假制度是：入职满1年有5天年假，满3年有10天年假。" },
  { text: "公司的报销流程是：需要在每月25号前，将发票拍照上传到财务系统。" },
  { text: "老板的名字叫王建国，他非常讨厌员工迟到。" },
];

async function getEmbedding(text: string): Promise<number[]> {
  console.log('请求文本:', process.env.ZHIPU_API_KEY);
  const res = await fetch('https://open.bigmodel.cn/api/paas/v4/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ZHIPU_API_KEY}`,
    },
    body: JSON.stringify({ model: 'embedding-3', input: text }),
  });
  const data = await res.json();
  console.log('智谱原始返回:', data); // <--- 加这一行
  return data.data[0].embedding;
}

async function build() {
  await client.connect();
  console.log("已连接数据库，开始计算向量并入库...");
  // 清空之前的测试数据
  await client.query('TRUNCATE TABLE documents RESTART IDENTITY');

  for (const item of knowledgeBase) {
    const vector = await getEmbedding(item.text);
    const vectorString = `[${vector.join(',')}]`; // 转成 pgvector 接受的字符串格式

    await client.query(
      'INSERT INTO documents (content, embedding) VALUES ($1, $2)',
      [item.text, vectorString]
    );
    console.log(`已入库: ${item.text}`);
  }
  await client.end();
  console.log("全部入库完成！");
}

build();