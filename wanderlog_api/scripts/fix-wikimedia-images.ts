/**
 * 批量修复 wikimedia 图片
 * 
 * 查找 images 中包含 wikimedia URL 的记录，下载并上传到 R2
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const R2_WORKER_URL = 'https://wanderlog-images.blcubahaa0627.workers.dev';
const R2_AUTH_KEY = process.env.R2_AUTH_KEY;

async function uploadToR2(imageUrl: string, placeId: string): Promise<string | null> {
  try {
    // 添加重试逻辑
    let retries = 3;
    let response;
    
    while (retries > 0) {
      try {
        response = await fetch(imageUrl, {
          headers: {
            'User-Agent': 'WanderlogBot/1.0 (https://wanderlog.app; contact@wanderlog.app)'
          },
        });
        if (response.ok) break;
      } catch (e) {
        retries--;
        if (retries === 0) throw e;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    
    if (!response || !response.ok) {
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const r2Key = `places/images/${placeId}/${uuidv4()}.${ext}`;
    
    const uploadResponse = await fetch(`${R2_WORKER_URL}/${r2Key}`, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'X-Custom-Auth-Key': R2_AUTH_KEY || '',
      },
      body: buffer,
    });
    
    if (!uploadResponse.ok) {
      return null;
    }
    
    return `${R2_WORKER_URL}/${r2Key}`;
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log('批量修复 Wikimedia 图片...');

  // 查找所有已合并的记录
  const { data: places, error } = await supabase
    .from('places')
    .select('id, name, images')
    .eq('source', 'apify_google_places')
    .not('source_detail', 'is', null);

  if (error) {
    console.log('查询失败:', error.message);
    return;
  }

  console.log('检查 ' + (places?.length || 0) + ' 条已合并的记录');

  let fixedCount = 0;
  let totalImagesFixed = 0;

  for (let i = 0; i < (places?.length || 0); i++) {
    const place = places![i];
    const images: any[] = place.images || [];
    
    // 检查是否有 wikimedia URL
    const hasWikimedia = images.some((img: any) => {
      const url = typeof img === 'string' ? img : img?.url;
      return url && (url.includes('wikimedia') || url.includes('wikipedia'));
    });
    
    if (!hasWikimedia) continue;
    
    // 处理每张图片
    const newImages: string[] = [];
    let imagesFixed = 0;
    
    for (const img of images) {
      const url = typeof img === 'string' ? img : img?.url;
      if (!url) continue;
      
      // 如果是 wikimedia URL，上传到 R2
      if (url.includes('wikimedia') || url.includes('wikipedia')) {
        const r2Url = await uploadToR2(url, place.id);
        if (r2Url) {
          newImages.push(r2Url);
          imagesFixed++;
        }
      } else {
        // 保留已有的 R2 URL
        newImages.push(url);
      }
    }
    
    if (imagesFixed > 0) {
      // 更新数据库
      const { error: updateError } = await supabase
        .from('places')
        .update({ images: newImages })
        .eq('id', place.id);
      
      if (!updateError) {
        fixedCount++;
        totalImagesFixed += imagesFixed;
        if (fixedCount % 50 === 0) {
          console.log(`已修复 ${fixedCount} 条记录...`);
        }
      }
    }
  }

  console.log('完成！');
  console.log('修复了 ' + fixedCount + ' 条记录');
  console.log('共上传 ' + totalImagesFixed + ' 张图片到 R2');
}

main().catch(console.error);
