// build-embeddings.ts
import fs from 'fs';
import path from 'path';

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
  console.log("开始离线计算向量...");
  const vectorStore = [];

  for (const item of knowledgeBase) {
    const vector = await getEmbedding(item.text);
    vectorStore.push({ text: item.text, vector });
    console.log(`已处理: ${item.text}`);
  }

  const filePath = path.join(process.cwd(), 'data', 'vector-store.json');
  fs.writeFileSync(filePath, JSON.stringify(vectorStore, null, 2));
  console.log("向量库构建完成！已保存到 data/vector-store.json");
}

build();