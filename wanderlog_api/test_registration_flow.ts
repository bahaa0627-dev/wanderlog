import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = 'blcubahaa0627@gmail.com';
const TEST_PASSWORD = 'Test123456';
const TEST_NAME = 'Test User';

interface RegisterResponse {
  message: string;
  userId: string;
}

interface VerifyResponse {
  message: string;
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
  };
}

async function testRegistrationFlow() {
  console.log('🧪 开始测试注册流程\n');
  
  try {
    // Step 1: 注册新用户
    console.log('📝 Step 1: 注册新用户');
    console.log(`   邮箱: ${TEST_EMAIL}`);
    console.log(`   密码: ${TEST_PASSWORD}`);
    console.log(`   姓名: ${TEST_NAME}\n`);
    
    const registerResponse = await axios.post<RegisterResponse>(
      `${API_BASE_URL}/api/auth/register`,
      {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        name: TEST_NAME
      }
    );
    
    console.log('✅ 注册成功!');
    console.log(`   用户ID: ${registerResponse.data.userId}`);
    console.log(`   消息: ${registerResponse.data.message}\n`);
    
    const userId = registerResponse.data.userId;
    
    // Step 2: 尝试未验证邮箱登录
    console.log('🔐 Step 2: 尝试未验证邮箱登录');
    
    try {
      await axios.post(
        `${API_BASE_URL}/api/auth/login`,
        {
          email: TEST_EMAIL,
          password: TEST_PASSWORD
        }
      );
      console.log('❌ 错误: 应该阻止未验证邮箱的用户登录\n');
    } catch (error: any) {
      if (error.response?.status === 403) {
        console.log('✅ 正确: 未验证邮箱无法登录');
        console.log(`   错误消息: ${error.response.data.error}\n`);
      } else {
        throw error;
      }
    }
    
    // Step 3: 获取验证码
    console.log('📧 Step 3: 从数据库获取验证码');
    console.log('   ⚠️  请检查邮箱获取验证码，或者使用 Prisma Studio 查看数据库');
    console.log('   Prisma Studio: http://localhost:5555\n');
    
    // 提示用户输入验证码
    console.log('💡 请执行以下步骤完成测试:');
    console.log('   1. 检查邮箱 blcubahaa0627@gmail.com 获取验证码');
    console.log('   2. 或者打开 Prisma Studio (http://localhost:5555)');
    console.log('   3. 找到 VerificationToken 表中的最新记录');
    console.log('   4. 复制 token 字段的值');
    console.log('   5. 使用以下命令验证:\n');
    console.log(`   curl -X POST ${API_BASE_URL}/api/auth/verify-email \\`);
    console.log(`        -H "Content-Type: application/json" \\`);
    console.log(`        -d '{"token": "YOUR_TOKEN_HERE"}'\n`);
    console.log('   6. 验证成功后，使用以下命令登录:\n');
    console.log(`   curl -X POST ${API_BASE_URL}/api/auth/login \\`);
    console.log(`        -H "Content-Type: application/json" \\`);
    console.log(`        -d '{"email": "${TEST_EMAIL}", "password": "${TEST_PASSWORD}"}'\n`);
    
    console.log('📊 测试摘要:');
    console.log('   ✅ 用户注册成功');
    console.log('   ✅ 未验证邮箱无法登录');
    console.log('   ⏳ 等待邮箱验证');
    console.log('\n🎯 下一步: 请检查邮箱并完成验证流程');
    
  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.response) {
      console.error('   状态码:', error.response.status);
      console.error('   错误详情:', JSON.stringify(error.response.data, null, 2));
    }
    
    // 如果是用户已存在的错误，提供清理建议
    if (error.response?.status === 400 && error.response?.data?.error?.includes('already exists')) {
      console.log('\n💡 用户已存在，请先清理测试数据:');
      console.log('   方法1: 使用 Prisma Studio 删除用户');
      console.log('   方法2: 运行以下命令:\n');
      console.log(`   cd wanderlog_api && npx tsx -e "import { PrismaClient } from '@prisma/client'; const prisma = new PrismaClient(); await prisma.user.delete({ where: { email: '${TEST_EMAIL}' } }); console.log('用户已删除'); await prisma.\\$disconnect();"\n`);
    }
    
    process.exit(1);
  }
}

// 运行测试
testRegistrationFlow();
