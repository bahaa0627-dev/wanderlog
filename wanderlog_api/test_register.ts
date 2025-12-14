import prisma from './src/config/database';

async function testRegister() {
  console.log('🔍 检查注册情况...\n');
  
  // 查找用户
  const user = await prisma.user.findUnique({
    where: { email: 'catherine_0627@sina.com' },
  });
  
  if (user) {
    console.log('✅ 找到用户:');
    console.log('   ID:', user.id);
    console.log('   Email:', user.email);
    console.log('   Name:', user.name);
    console.log('   已验证:', user.isEmailVerified);
    console.log('   创建时间:', user.createdAt);
    console.log('   认证方式:', user.authProvider);
    
    // 查找验证码记录
    console.log('\n🔑 查找验证码记录...');
    const tokens = await prisma.verificationToken.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    
    if (tokens.length > 0) {
      console.log(`   找到 ${tokens.length} 条验证码记录:`);
      tokens.forEach((token, index) => {
        console.log(`\n   [${index + 1}]`);
        console.log('   验证码:', token.token);
        console.log('   类型:', token.type);
        console.log('   过期时间:', token.expiresAt);
        console.log('   已使用:', token.usedAt ? '是' : '否');
        console.log('   创建时间:', token.createdAt);
      });
    } else {
      console.log('   ⚠️  没有找到验证码记录');
    }
  } else {
    console.log('❌ 未找到用户: catherine_0627@sina.com');
  }
  
  await prisma.$disconnect();
}

testRegister().catch(console.error);
