import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = 'blcubahaa0627@gmail.com';
const TEST_PASSWORD = 'Test123456';
const TEST_NAME = 'Test User';

async function completeRegistrationTest() {
  console.log('🧪 开始完整的注册流程测试\n');
  
  try {
    // Step 1: 注册新用户
    console.log('📝 Step 1: 注册新用户');
    const registerResponse = await axios.post(
      `${API_BASE_URL}/api/auth/register`,
      {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        name: TEST_NAME
      }
    );
    
    console.log('✅ 注册成功!');
    console.log(`   Token: ${registerResponse.data.token.substring(0, 20)}...`);
    const tempToken = registerResponse.data.token;
    
    // Step 2: 尝试未验证邮箱登录
    console.log('\n🔐 Step 2: 尝试未验证邮箱登录');
    try {
      await axios.post(
        `${API_BASE_URL}/api/auth/login`,
        {
          email: TEST_EMAIL,
          password: TEST_PASSWORD
        }
      );
      console.log('❌ 错误: 应该阻止未验证邮箱的用户登录');
      process.exit(1);
    } catch (error: any) {
      if (error.response?.status === 403) {
        console.log('✅ 正确: 未验证邮箱无法登录');
      } else {
        throw error;
      }
    }
    
    // Step 3: 从数据库获取验证码
    console.log('\n📧 Step 3: 从数据库获取验证码');
    const user = await prisma.user.findUnique({
      where: { email: TEST_EMAIL }
    });
    
    if (!user) {
      throw new Error('找不到用户');
    }
    
    const verificationToken = await prisma.verificationToken.findFirst({
      where: {
        userId: user.id,
        type: 'EMAIL_VERIFICATION'
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    if (!verificationToken) {
      throw new Error('找不到验证码');
    }
    
    console.log(`✅ 获取到验证码: ${verificationToken.token}`);
    
    // Step 4: 验证邮箱
    console.log('\n✉️ Step 4: 验证邮箱');
    const verifyResponse = await axios.post(
      `${API_BASE_URL}/api/auth/verify-email`,
      { token: verificationToken.token },
      {
        headers: {
          Authorization: `Bearer ${tempToken}`
        }
      }
    );
    
    console.log('✅ 邮箱验证成功!');
    console.log(`   用户: ${verifyResponse.data.user.name} (${verifyResponse.data.user.email})`);
    console.log(`   邮箱已验证: ${verifyResponse.data.user.emailVerified}`);
    
    // Step 5: 使用已验证的账号登录
    console.log('\n🔑 Step 5: 使用已验证的账号登录');
    const loginResponse = await axios.post(
      `${API_BASE_URL}/api/auth/login`,
      {
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      }
    );
    
    console.log('✅ 登录成功!');
    console.log(`   Token: ${loginResponse.data.token.substring(0, 20)}...`);
    console.log(`   用户: ${loginResponse.data.user.name}`);
    console.log(`   邮箱已验证: ${loginResponse.data.user.isEmailVerified}`);
    
    // Step 6: 获取当前用户信息
    console.log('\n👤 Step 6: 获取当前用户信息');
    const meResponse = await axios.get(
      `${API_BASE_URL}/api/auth/me`,
      {
        headers: {
          Authorization: `Bearer ${loginResponse.data.token}`
        }
      }
    );
    
    console.log('✅ 获取用户信息成功!');
    console.log(`   ID: ${meResponse.data.id}`);
    console.log(`   邮箱: ${meResponse.data.email}`);
    console.log(`   姓名: ${meResponse.data.name}`);
    console.log(`   邮箱已验证: ${meResponse.data.isEmailVerified}`);
    
    // 总结
    console.log('\n' + '='.repeat(50));
    console.log('📊 测试完成摘要:');
    console.log('='.repeat(50));
    console.log('✅ 用户注册成功');
    console.log('✅ 未验证邮箱无法登录');
    console.log('✅ 验证码获取成功');
    console.log('✅ 邮箱验证成功');
    console.log('✅ 登录成功');
    console.log('✅ 获取用户信息成功');
    console.log('\n🎉 所有测试通过！注册流程正常工作！');
    
  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.response) {
      console.error('   状态码:', error.response.status);
      console.error('   错误详情:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

completeRegistrationTest();
