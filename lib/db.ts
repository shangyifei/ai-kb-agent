// lib/db.ts
import { Pool } from 'pg';

// 在全局声明一个 pool，防止在开发环境热更新时不断创建新的连接池
const globalForPg = global as unknown as { pgPool: Pool };

export const pool = globalForPg.pgPool || new Pool({
  connectionString: 'postgresql://shangyifei@localhost:5432/ai_kb', // 你的本地连接
  max: 10, // 最大连接数，防止把数据库打挂
  idleTimeoutMillis: 30000, // 连接空闲 30 秒后自动释放
  connectionTimeoutMillis: 2000, // 超过 2 秒连不上就报错
});

if (process.env.NODE_ENV !== 'production') {
  globalForPg.pgPool = pool;
}