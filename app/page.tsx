'use client';

import { useChat } from '@ai-sdk/react';
import { useState } from 'react';

export default function Chat() {
  const [input, setInput] = useState('');
  const { messages, sendMessage } = useChat();

  // 在组件内部加上传状态
  const [isUploading, setIsUploading] = useState(false);

  // 定义一个处理上传的函数
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert('上传失败');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map((message, index) => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, i) => {
            switch (part.type) {
              case 'text':
                return <div key={`${message.id}-${i}`}>{part.text}</div>;
              case 'data-sources':
                return <div className="mt-2 text-sm border-l-2 border-blue-500 pl-3 text-gray-500 bg-gray-50 p-2 rounded">
                  <details>
                    <summary className="cursor-pointer font-semibold text-blue-600">查看参考资料</summary>
                    <div className="mt-2 whitespace-pre-wrap">
                     {(part.data as string[])?.join('\n\n')}
                    </div>
                  </details>
                </div>;
            }
          })}
        </div>
      ))}

      <form
        onSubmit={e => {
          e.preventDefault();
          sendMessage({ text: input });
          setInput('');
        }}
      >
        <div className="mb-4">
          <input
            type="file"
            accept=".pdf,.txt"
            onChange={handleUpload}
            disabled={isUploading}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {isUploading && <p className="text-sm text-blue-500 mt-2">正在上传并解析入库...</p>}
        </div>
        <input
          className="fixed dark:bg-zinc-900 bottom-0 w-full max-w-md p-2 mb-8 border border-zinc-300 dark:border-zinc-800 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={e => setInput(e.currentTarget.value)}
        />
      </form>
    </div>
  );
}