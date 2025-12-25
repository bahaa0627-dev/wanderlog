import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function enablePostGIS() {
  console.log('🌍 启用 PostGIS 扩展...\n');
  
  try {
    // 启用 PostGIS
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS postgis');
    console.log('✅ PostGIS 扩展已启用');
    
    // 检查 spatial_ref_sys 表
    const result: any[] = await prisma.$queryRawUnsafe('SELECT COUNT(*)::int as count FROM spatial_ref_sys');
    console.log(`📊 spatial_ref_sys 表记录数: ${result[0].count}`);
    
    // 检查 PostGIS 版本
    const version: any[] = await prisma.$queryRawUnsafe('SELECT PostGIS_Version() as version');
    console.log(`📦 PostGIS 版本: ${version[0].version}`);
    
  } catch (e: any) {
    console.log('❌ 错误:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

enablePostGIS();
