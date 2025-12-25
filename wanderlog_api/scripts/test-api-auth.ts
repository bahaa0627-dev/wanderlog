/**
 * 测试 API 认证和 destinations 端点
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testApiAuth() {
  console.log('🔐 测试 API 认证...\n');

  // 1. 登录获取 token
  console.log('1. 登录获取 token...');
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: 'blcubahaa0627@gmail.com',
    password: 'Wanderlog123!',
  });

  if (signInError) {
    console.error('❌ 登录失败:', signInError.message);
    return;
  }

  const accessToken = signInData.session?.access_token;
  console.log('✅ 登录成功');
  console.log(`   User ID: ${signInData.user?.id}`);
  console.log(`   Token: ${accessToken?.substring(0, 50)}...`);

  // 2. 调用 /api/destinations
  console.log('\n2. 调用 /api/destinations...');
  try {
    const response = await axios.get('http://localhost:3000/api/destinations', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('✅ API 调用成功');
    console.log(`   返回 ${response.data.length} 条 trips:`);
    for (const trip of response.data) {
      console.log(`   - ${trip.name} (${trip.city || 'no city'})`);
    }
  } catch (e: any) {
    console.error('❌ API 调用失败:', e.response?.data || e.message);
  }

  // 3. 测试获取单个 trip 详情
  console.log('\n3. 测试获取 trip 详情...');
  try {
    // 先获取列表
    const listResponse = await axios.get('http://localhost:3000/api/destinations', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (listResponse.data.length > 0) {
      const tripId = listResponse.data[0].id;
      const detailResponse = await axios.get(`http://localhost:3000/api/destinations/${tripId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      console.log('✅ 获取详情成功');
      console.log(`   Trip: ${detailResponse.data.name}`);
      console.log(`   Spots: ${detailResponse.data.tripSpots?.length || 0} 个`);
      
      if (detailResponse.data.tripSpots?.length > 0) {
        for (const spot of detailResponse.data.tripSpots.slice(0, 3)) {
          console.log(`     - ${spot.spot?.name || spot.place?.name || 'Unknown'}`);
        }
      }
    }
  } catch (e: any) {
    console.error('❌ 获取详情失败:', e.response?.data || e.message);
  }

  console.log('\n🎉 测试完成！');
}

testApiAuth();
