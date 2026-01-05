/**
 * Find and fix invalid UUIDs in the places table
 */

import prisma from '../src/config/database';

async function main() {
  console.log('🔍 Searching for invalid UUIDs...\n');
  
  try {
    // 查找所有 id 不符合 UUID 格式的记录
    const badRecords = await prisma.$queryRaw<any[]>`
      SELECT id::text, name, city FROM places 
      WHERE id::text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      LIMIT 50
    `;
    
    if (badRecords.length === 0) {
      console.log('✅ No invalid UUIDs found');
    } else {
      console.log(`❌ Found ${badRecords.length} records with invalid UUIDs:\n`);
      for (const record of badRecords) {
        console.log(`  ID: "${record.id}" | Name: "${record.name}" | City: "${record.city}"`);
      }
      
      // 删除这些无效记录
      console.log('\n🗑️  Deleting invalid records...');
      const badIds = badRecords.map(r => r.id);
      
      const deleteResult = await prisma.$executeRaw`
        DELETE FROM places WHERE id = ANY(${badIds}::text[])
      `;
      
      console.log(`✅ Deleted ${deleteResult} invalid records`);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
