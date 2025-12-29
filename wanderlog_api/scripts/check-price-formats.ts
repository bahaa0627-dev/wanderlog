/**
 * 检查 price 字段的各种格式
 */

import prisma from '../src/config/database';

async function main() {
  const places = await prisma.place.findMany({
    where: { price: { not: null } },
    select: { id: true, name: true, price: true, priceLevel: true }
  });
  
  const dollarSigns: { id: string; name: string; price: string; level: number }[] = [];
  const priceRanges: { name: string; price: string }[] = [];
  const others: { name: string; price: string }[] = [];
  
  for (const p of places) {
    const price = p.price || '';
    
    // $ 符号格式 (代表 price level)
    if (/^\$+$/.test(price)) {
      dollarSigns.push({
        id: p.id,
        name: p.name,
        price: price,
        level: price.length  // $ = 1, $$ = 2, $$$ = 3, $$$$ = 4
      });
    }
    // 价格范围格式 (如 €10–20, $10-20)
    else if (/[€$£¥]?\d+[–-]/.test(price)) {
      priceRanges.push({ name: p.name, price: price });
    }
    else {
      others.push({ name: p.name, price: price });
    }
  }
  
  console.log('📊 Price 字段格式分析:\n');
  console.log(`总计有 price 的记录: ${places.length}`);
  console.log(`  - $ 符号格式 (应转为 priceLevel): ${dollarSigns.length}`);
  console.log(`  - 价格范围格式 (正确的 price): ${priceRanges.length}`);
  console.log(`  - 其他格式: ${others.length}`);
  
  if (dollarSigns.length > 0) {
    console.log('\n💰 $ 符号格式示例 (需要转换为 priceLevel):');
    const byLevel: Record<number, number> = {};
    for (const d of dollarSigns) {
      byLevel[d.level] = (byLevel[d.level] || 0) + 1;
    }
    for (const [level, count] of Object.entries(byLevel)) {
      console.log(`  ${'$'.repeat(Number(level))} (level ${level}): ${count} 条`);
    }
  }
  
  if (priceRanges.length > 0) {
    console.log('\n💵 价格范围格式示例:');
    for (const p of priceRanges.slice(0, 5)) {
      console.log(`  ${p.name.substring(0, 30)}: ${p.price}`);
    }
  }
  
  if (others.length > 0) {
    console.log('\n❓ 其他格式:');
    for (const p of others.slice(0, 10)) {
      console.log(`  ${p.name.substring(0, 30)}: "${p.price}"`);
    }
  }
  
  // 返回需要转换的数据
  return dollarSigns;
}

main()
  .then(async (dollarSigns) => {
    if (dollarSigns.length === 0) {
      console.log('\n✅ 无需转换');
      return;
    }
    
    console.log(`\n🔄 开始转换 ${dollarSigns.length} 条 $ 符号数据到 priceLevel...`);
    
    let converted = 0;
    for (const item of dollarSigns) {
      await prisma.place.update({
        where: { id: item.id },
        data: {
          priceLevel: item.level,
          price: null  // 清空 price，因为这不是真正的价格范围
        }
      });
      converted++;
    }
    
    console.log(`✅ 转换完成: ${converted} 条`);
  })
  .catch(console.error)
  .finally(() => prisma.$disconnect());
