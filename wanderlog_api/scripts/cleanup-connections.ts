/**
 * 清理数据库空闲连接
 * 紧急使用，释放被占用的连接槽
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const directUrl = process.env.DIRECT_URL;

if (!directUrl) {
  console.error('❌ DIRECT_URL not found');
  process.exit(1);
}

async function cleanupConnections() {
  console.log('🧹 Cleaning up idle database connections...\n');
  
  const client = new Client({ connectionString: directUrl });
  
  try {
    await client.connect();
    
    // 1. 查看当前连接
    const countResult = await client.query(`
      SELECT count(*) as total, state 
      FROM pg_stat_activity 
      WHERE datname = 'postgres' 
      GROUP BY state;
    `);
    console.log('📊 Current connections:');
    countResult.rows.forEach(row => {
      console.log(`   ${row.state}: ${row.total}`);
    });
    console.log('');
    
    // 2. 终止超过5分钟的空闲连接
    const killResult = await client.query(`
      SELECT pg_terminate_backend(pid), state, state_change
      FROM pg_stat_activity 
      WHERE datname = 'postgres' 
        AND state = 'idle' 
        AND state_change < NOW() - INTERVAL '5 minutes'
        AND pid != pg_backend_pid();
    `);
    
    console.log(`✅ Terminated ${killResult.rowCount || 0} idle connections\n`);
    
    // 3. 再次查看
    const newCountResult = await client.query(`
      SELECT count(*) as total, state 
      FROM pg_stat_activity 
      WHERE datname = 'postgres' 
      GROUP BY state;
    `);
    console.log('📊 After cleanup:');
    newCountResult.rows.forEach(row => {
      console.log(`   ${row.state}: ${row.total}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.end();
  }
}

cleanupConnections();
