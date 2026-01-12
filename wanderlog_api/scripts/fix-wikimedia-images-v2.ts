/**
 * 批量修复 wikimedia 图片 v2
 * 
 * 查找 images 中包含 wikimedia URL 的记录，下载并上传到 R2
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const R2_WORKER_URL = process.env.R2_PUBLIC_URL || 'https://wanderlog-images.blcubahaa0627.workers.dev';
const R2_UPLOAD_SECRET = process.env.R2_UPLOAD_SECRET;

// 延迟函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function uploadToR2(imageUrl: string, placeId: string): Promise<string | null> {
  try {
    // 处理 Special:FilePath URL - 需要跟随重定向
    let finalUrl = imageUrl;
    
    // 如果是 Special:FilePath URL，转换为直接的 upload.wikimedia.org URL
    if (imageUrl.includes('Special:FilePath')) {
      // 提取文件名
      const match = imageUrl.match(/Special:FilePath\/(.+)$/);
      if (match) {
        const fileName = decodeURIComponent(match[1]);
        // 使用 Wikimedia API 获取实际图片 URL
        const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(fileName)}&prop=imageinfo&iiprop=url&format=json`;
        
        const apiResponse = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'WanderlogBot/1.0 (https://wanderlog.app; contact@wanderlog.app)'
          }
        });
        
        if (apiResponse.ok) {
          const data = await apiResponse.json() as any;
          const pages = data.query?.pages;
          if (pages) {
            const pageId = Object.keys(pages)[0];
            const imageInfo = pages[pageId]?.imageinfo?.[0];
            if (imageInfo?.url) {
              finalUrl = imageInfo.url;
            }
          }
        }
      }
    }
    
    // 下载图片
    const response = await fetch(finalUrl, {
      headers: {
        'User-Agent': 'WanderlogBot/1.0 (https://wanderlog.app; contact@wanderlog.app)'
      },
      redirect: 'follow'
    });
    
    if (!response.ok) {
      console.log(`  下载失败: ${response.status} - ${finalUrl.substring(0, 80)}...`);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    // 检查是否是有效图片
    if (buffer.length < 1000) {
      console.log(`  图片太小，跳过: ${buffer.length} bytes`);
      return null;
    }
    
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const r2Key = `places/images/${placeId}/${uuidv4()}.${ext}`;
    
    const uploadResponse = await fetch(`${R2_WORKER_URL}/${r2Key}`, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Authorization': `Bearer ${R2_UPLOAD_SECRET}`,
      },
      body: buffer,
    });
    
    if (!uploadResponse.ok) {
      console.log(`  上传失败: ${uploadResponse.status}`);
      return null;
    }
    
    return `${R2_WORKER_URL}/${r2Key}`;
  } catch (e: any) {
    console.log(`  错误: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log('批量修复 Wikimedia 图片 v2...\n');

  // 查找所有包含 wikimedia URL 的记录
  const { data: places, error } = await supabase
    .from('places')
    .select('id, name, images, cover_image');

  if (error) {
    console.log('查询失败:', error.message);
    return;
  }

  // 过滤出需要修复的记录
  const needsFix = (places || []).filter(place => {
    const images: any[] = place.images || [];
    const coverImage = place.cover_image;
    
    const hasWikimediaInImages = images.some((img: any) => {
      const url = typeof img === 'string' ? img : img?.url;
      return url && (url.includes('wikimedia') || url.includes('wikipedia'));
    });
    
    const hasWikimediaInCover = coverImage && 
      (coverImage.includes('wikimedia') || coverImage.includes('wikipedia'));
    
    return hasWikimediaInImages || hasWikimediaInCover;
  });

  console.log(`找到 ${needsFix.length} 条需要修复的记录\n`);

  let fixedCount = 0;
  let totalImagesFixed = 0;
  let failedCount = 0;

  for (let i = 0; i < needsFix.length; i++) {
    const place = needsFix[i];
    const images: any[] = place.images || [];
    
    console.log(`[${i + 1}/${needsFix.length}] ${place.name}`);
    
    // 处理每张图片
    const newImages: string[] = [];
    let imagesFixed = 0;
    
    for (const img of images) {
      const url = typeof img === 'string' ? img : img?.url;
      if (!url) continue;
      
      // 如果是 wikimedia URL，上传到 R2
      if (url.includes('wikimedia') || url.includes('wikipedia')) {
        console.log(`  处理: ${url.substring(0, 60)}...`);
        const r2Url = await uploadToR2(url, place.id);
        if (r2Url) {
          newImages.push(r2Url);
          imagesFixed++;
          console.log(`  ✓ 上传成功`);
        } else {
          failedCount++;
          // 失败的图片不保留，直接跳过
          console.log(`  ✗ 跳过失败的图片`);
        }
        // 避免请求过快
        await delay(500);
      } else {
        // 保留已有的 R2 URL
        newImages.push(url);
      }
    }
    
    // 处理 cover_image
    let newCoverImage = place.cover_image;
    if (place.cover_image && (place.cover_image.includes('wikimedia') || place.cover_image.includes('wikipedia'))) {
      console.log(`  处理封面: ${place.cover_image.substring(0, 60)}...`);
      const r2Url = await uploadToR2(place.cover_image, place.id);
      if (r2Url) {
        newCoverImage = r2Url;
        imagesFixed++;
        console.log(`  ✓ 封面上传成功`);
      }
      await delay(500);
    }
    
    if (imagesFixed > 0 || newImages.length !== images.length || newCoverImage !== place.cover_image) {
      // 更新数据库 - 即使没有成功上传也要更新，移除失败的 wikimedia URL
      const updateData: any = { images: newImages };
      if (newCoverImage !== place.cover_image) {
        updateData.cover_image = newCoverImage;
      }
      
      const { error: updateError } = await supabase
        .from('places')
        .update(updateData)
        .eq('id', place.id);
      
      if (!updateError) {
        fixedCount++;
        totalImagesFixed += imagesFixed;
        console.log(`  ✓ 数据库已更新\n`);
      } else {
        console.log(`  ✗ 数据库更新失败: ${updateError.message}\n`);
      }
    } else {
      console.log(`  - 无需更新\n`);
    }
  }

  console.log('\n========== 完成 ==========');
  console.log(`修复了 ${fixedCount} 条记录`);
  console.log(`共上传 ${totalImagesFixed} 张图片到 R2`);
  console.log(`失败 ${failedCount} 张图片`);
}

main().catch(console.error);
