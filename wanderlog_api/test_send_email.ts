import { sendVerificationEmail } from './src/services/emailService';
import prisma from './src/config/database';

async function testEmailSending() {
  console.log('📧 测试邮件发送功能...\n');
  
  try {
    // 获取用户信息
    const user = await prisma.user.findUnique({
      where: { email: 'catherine_0627@sina.com' },
    });
    
    if (!user) {
      console.log('❌ 未找到用户');
      return;
    }
    
    // 获取最新的验证码
    const token = await prisma.verificationToken.findFirst({
      where: {
        userId: user.id,
        type: 'EMAIL_VERIFICATION',
        usedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    
    if (!token) {
      console.log('❌ 未找到有效的验证码');
      return;
    }
    
    console.log('📬 尝试发送验证邮件到:', user.email);
    console.log('🔑 验证码:', token.token);
    console.log('⏰ 过期时间:', token.expiresAt);
    
    // 发送邮件
    const result = await sendVerificationEmail(user.email, token.token, user.name || undefined);
    
    if (result) {
      console.log('\n✅ 邮件发送成功!');
      console.log('📬 收件人:', user.email);
      console.log('🔑 验证码:', token.token);
      console.log('\n请检查邮箱:', user.email);
      console.log('（请同时检查垃圾邮件文件夹）');
    } else {
      console.log('\n❌ 邮件发送失败，请检查日志');
    }
    
  } catch (error: any) {
    console.error('\n❌ 邮件发送失败:');
    console.error('错误:', error.message);
    if (error.response) {
      console.error('响应:', JSON.stringify(error.response, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
}

testEmailSending();
