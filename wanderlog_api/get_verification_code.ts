import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function getVerificationCode() {
  const TEST_EMAIL = 'blcubahaa0627@gmail.com';
  
  try {
    // 查找最新的验证码
    const token = await prisma.verificationToken.findFirst({
      where: {
        user: { email: TEST_EMAIL },
        type: 'EMAIL_VERIFICATION',
        usedAt: null, // 未使用的
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: {
            email: true,
            name: true,
            isEmailVerified: true,
          },
        },
      },
    });

    if (!token) {
      console.log('❌ 没有找到验证码');
      console.log(`   请确认用户 ${TEST_EMAIL} 已注册`);
      return;
    }

    const now = new Date();
    const isExpired = token.expiresAt < now;
    const timeRemaining = Math.floor((token.expiresAt.getTime() - now.getTime()) / 1000);

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                     📧 验证码信息                             ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`📧 邮箱:        ${token.user.email}`);
    console.log(`👤 用户名:      ${token.user.name || '(未设置)'}`);
    console.log(`✉️  已验证:      ${token.user.isEmailVerified ? '是' : '否'}`);
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log(`🔑 验证码:      ${token.token}`);
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log(`⏰ 创建时间:    ${token.createdAt.toLocaleString('zh-CN')}`);
    console.log(`⏳ 过期时间:    ${token.expiresAt.toLocaleString('zh-CN')}`);
    
    if (isExpired) {
      console.log(`❌ 状态:        已过期`);
    } else {
      const minutes = Math.floor(timeRemaining / 60);
      const seconds = timeRemaining % 60;
      console.log(`✅ 状态:        有效 (剩余 ${minutes} 分 ${seconds} 秒)`);
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    if (isExpired) {
      console.log('💡 验证码已过期，请在应用中点击 "Resend Code" 重新发送');
    } else {
      console.log('💡 在 iOS 应用中输入上面的 6 位验证码');
    }
    
    console.log('');

  } catch (error: any) {
    console.error('❌ 查询失败:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

getVerificationCode();
