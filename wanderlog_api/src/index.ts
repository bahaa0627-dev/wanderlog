console.log('=== BOOT: dist/index.js started ===');
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';

console.log('🔄 Starting application...');
console.log('📍 NODE_ENV:', process.env.NODE_ENV);
console.log('📍 PORT:', process.env.PORT);
console.log("BOOT: index.ts running");
console.log("PORT =", process.env.PORT);

// Load environment variables
dotenv.config();

console.log('📍 APIFY_API_TOKEN loaded:', process.env.APIFY_API_TOKEN ? 'Yes (' + process.env.APIFY_API_TOKEN.substring(0, 20) + '...)' : 'No');

// Enable global proxy agent if HTTP_PROXY or HTTPS_PROXY is set
const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.https_proxy;
if (proxyUrl) {
  console.log(`🌐 Using proxy: ${proxyUrl}`);
  const { bootstrap } = require('global-agent');
  bootstrap();
} else {
  console.log('ℹ️  No proxy configured');
}

import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

console.log('✅ Core modules loaded');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // 允许内联脚本用于管理后台
}));

// CORS 配置 - 允许管理后台和 App 访问
const allowedOrigins = [
  'https://admin.vago.to',
  'https://manage.vago.to',
  'https://vago.to',
  'https://www.vago.to',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'capacitor://localhost',  // iOS App
  'http://localhost',       // Android App
];

app.use(cors({
  origin: (origin, callback) => {
    // 允许无 origin 的请求（如移动端 App 或 curl）
    if (!origin) return callback(null, true);
    // 检查是否在允许列表中
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // 允许所有 vago.to 子域名
    if (origin.endsWith('.vago.to')) {
      return callback(null, true);
    }
    // 开发环境允许所有
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    console.warn(`⚠️ CORS blocked origin: ${origin}`);
    callback(null, true); // 暂时允许所有，方便调试
  },
  credentials: true,
}));

app.use(express.json({ limit: '50mb' })); // 增加JSON body大小限制到50MB
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // 增加URL编码body大小限制

// 简易请求日志，方便排查前端请求是否命中后端
app.use((req, _res, next) => {
  console.log(`➡️  ${req.method} ${req.originalUrl}`);
  next();
});

// 静态文件服务 - 管理后台
const publicPath = path.join(__dirname, '..', 'public');
console.log(`📁 Static files path: ${publicPath}`);

// HTML 文件不允许 Cloudflare/浏览器缓存，确保每次都拿最新版本
const staticOptions = {
  setHeaders: (res: any, filePath: string) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
    }
  }
};
app.use('/admin', express.static(publicPath, staticOptions));
app.use(express.static(publicPath, staticOptions)); // 也允许根路径访问静态文件

// Auth callback 页面 - 用于邮箱验证后的跳转
app.get('/auth/callback', (_req, res) => {
  res.sendFile(path.join(publicPath, 'auth-callback.html'));
});

// Health check - 放在最前面
app.get('/health', async (_req, res) => {
  console.log('🏥 Health check requested');
  
  // 检查数据库连接
  let dbStatus = 'unknown';
  try {
    const prisma = (await import('./config/database')).default;
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch (dbError: any) {
    console.error('❌ Health check: Database connection failed:', dbError.message);
    dbStatus = 'disconnected';
  }
  
  res.json({ 
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    database: dbStatus,
  });
});

console.log('🔄 Loading routes...');

import authRoutes from './routes/authRoutes';
console.log('  ✅ authRoutes loaded');
import spotRoutes from './routes/spotRoutes';
console.log('  ✅ spotRoutes loaded');
import tripRoutes from './routes/tripRoutes';
console.log('  ✅ tripRoutes loaded');
import destinationRoutes from './routes/destinationRoutes';
console.log('  ✅ destinationRoutes loaded');
import collectionRoutes from './routes/collectionRoutes';
console.log('  ✅ collectionRoutes loaded');
import publicPlaceRoutes from './routes/publicPlaceRoutes';
console.log('  ✅ publicPlaceRoutes loaded');
import collectionRecommendationRoutes from './routes/collectionRecommendationRoutes';
console.log('  ✅ collectionRecommendationRoutes loaded');
import searchV2Routes from './routes/searchV2Routes';
console.log('  ✅ searchV2Routes loaded');
import uploadRoutes from './routes/uploadRoutes';
console.log('  ✅ uploadRoutes loaded');
import mineRoutes from './routes/mineRoutes';
console.log('  ✅ mineRoutes loaded');
import userRecommendationRoutes from './routes/userRecommendationRoutes';
console.log('  ✅ userRecommendationRoutes loaded');
import appConfigRoutes from './routes/appConfigRoutes';
console.log('  ✅ appConfigRoutes loaded');

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/spots', spotRoutes);
// 兼容新路由，前端已优先 /places，暂时共存
app.use('/api/places', spotRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/destinations', destinationRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/public-places', publicPlaceRoutes);
app.use('/api/collection-recommendations', collectionRecommendationRoutes);
console.log('✅ Collection recommendations routes registered');
app.use('/api/places/ai', searchV2Routes);
console.log('✅ Search V2 routes registered');
app.use('/api/upload', uploadRoutes);
console.log('✅ Upload routes registered');
app.use('/api/mine', mineRoutes);
console.log('✅ Mine routes registered');
app.use('/api/user-recommendations', userRecommendationRoutes);
console.log('✅ User recommendations routes registered');
app.use('/api/app-config', appConfigRoutes);
console.log('✅ App config routes registered');
// app.use('/api/trips', tripRoutes);
// app.use('/api/spots', spotRoutes);

// Error handling
app.use(errorHandler);

// Start server
console.log(`🚀 Starting server on port ${PORT}...`);
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`✅ Server is running on 0.0.0.0:${PORT}`);
  console.log(`🏥 Health check available at /health`);
  logger.info(`Server is running on port ${PORT}`);
});

export default app;

