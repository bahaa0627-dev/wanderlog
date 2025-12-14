import dotenv from 'dotenv';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  verifyEmailConfiguration,
} from './src/services/emailService';
import { generateVerificationCode } from './src/utils/tokenGenerator';

// 加载环境变量
dotenv.config();

/**
 * 测试邮件服务
 */
async function testEmailService() {
  console.log('\n🧪 Testing Email Service...\n');

  // 1. 验证配置
  console.log('1️⃣ Verifying email configuration...');
  const isConfigured = await verifyEmailConfiguration();
  if (!isConfigured) {
    console.error('❌ Email service is not properly configured');
    console.log('\n📝 Please set the following environment variables in .env:');
    console.log('   RESEND_API_KEY=your_api_key_here');
    console.log('   RESEND_FROM_EMAIL=WanderLog <onboarding@resend.dev>');
    console.log('\n🔗 Get your API key from: https://resend.com/api-keys');
    process.exit(1);
  }
  console.log('✅ Configuration verified\n');

  // 2. 获取测试邮箱
  const testEmail = process.argv[2];
  if (!testEmail) {
    console.error('❌ Please provide a test email address');
    console.log('\nUsage: npm run test:email <your-email@example.com>');
    process.exit(1);
  }

  console.log(`📧 Test email: ${testEmail}\n`);

  // 3. 测试邮箱验证邮件
  console.log('2️⃣ Testing verification email...');
  const verificationCode = generateVerificationCode();
  console.log(`   Verification code: ${verificationCode}`);
  
  const verificationSent = await sendVerificationEmail(
    testEmail,
    verificationCode,
    'Test User'
  );
  
  if (verificationSent) {
    console.log('✅ Verification email sent successfully\n');
  } else {
    console.error('❌ Failed to send verification email\n');
  }

  // 等待 2 秒
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 4. 测试密码重置邮件
  console.log('3️⃣ Testing password reset email...');
  const resetCode = generateVerificationCode();
  console.log(`   Reset code: ${resetCode}`);
  
  const resetSent = await sendPasswordResetEmail(
    testEmail,
    resetCode,
    'Test User'
  );
  
  if (resetSent) {
    console.log('✅ Password reset email sent successfully\n');
  } else {
    console.error('❌ Failed to send password reset email\n');
  }

  // 等待 2 秒
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 5. 测试欢迎邮件
  console.log('4️⃣ Testing welcome email...');
  const welcomeSent = await sendWelcomeEmail(testEmail, 'Test User');
  
  if (welcomeSent) {
    console.log('✅ Welcome email sent successfully\n');
  } else {
    console.error('❌ Failed to send welcome email\n');
  }

  // 6. 总结
  console.log('\n📊 Test Summary:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✉️  Verification Email: ${verificationSent ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`🔒 Password Reset Email: ${resetSent ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`🎉 Welcome Email: ${welcomeSent ? '✅ PASS' : '❌ FAIL'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const allPassed = verificationSent && resetSent && welcomeSent;
  if (allPassed) {
    console.log('\n🎉 All tests passed! Check your inbox at:', testEmail);
    console.log('   (Don\'t forget to check spam folder)');
  } else {
    console.log('\n⚠️  Some tests failed. Check the logs above for details.');
  }
  
  console.log('\n');
  process.exit(allPassed ? 0 : 1);
}

// 运行测试
testEmailService().catch((error) => {
  console.error('\n❌ Test failed with error:', error);
  process.exit(1);
});
