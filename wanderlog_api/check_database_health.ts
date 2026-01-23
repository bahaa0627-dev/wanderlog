import prisma from './src/config/database';

async function checkDatabaseHealth() {
  console.log('🔍 Checking database health...\n');

  // 1. 检查连接
  console.log('1️⃣ Testing database connection...');
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connection: OK\n');
  } catch (error: any) {
    console.error('❌ Database connection: FAILED');
    console.error('   Error:', error.message);
    console.error('   Code:', error.code);
    await prisma.$disconnect();
    process.exit(1);
  }

  // 2. 检查表是否存在
  console.log('2️⃣ Checking Place table...');
  try {
    const count = await prisma.place.count();
    console.log(`✅ Place table: OK (${count} records)\n`);
  } catch (error: any) {
    console.error('❌ Place table: FAILED');
    console.error('   Error:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }

  // 3. 测试查询
  console.log('3️⃣ Testing getAllPlaces query...');
  try {
    const places = await prisma.place.findMany({
      take: 5,
      select: {
        id: true,
        name: true,
        city: true,
        country: true,
      }
    });
    console.log(`✅ Query test: OK (found ${places.length} places)`);
    if (places.length > 0) {
      console.log('   Sample place:', places[0].name);
    }
    console.log('');
  } catch (error: any) {
    console.error('❌ Query test: FAILED');
    console.error('   Error:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }

  // 4. 检查环境变量
  console.log('4️⃣ Checking environment variables...');
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    const maskedUrl = dbUrl.replace(/:[^:@]+@/, ':****@');
    console.log(`✅ DATABASE_URL: Set (${maskedUrl.substring(0, 50)}...)`);
  } else {
    console.error('❌ DATABASE_URL: Not set!');
  }
  console.log('');

  console.log('✅ All checks passed! Database is healthy.');
  await prisma.$disconnect();
}

checkDatabaseHealth().catch((error) => {
  console.error('❌ Health check failed:', error);
  process.exit(1);
});
