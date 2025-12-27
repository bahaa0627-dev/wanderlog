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
app.use(cors());
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
app.use('/admin', express.static(publicPath));
app.use(express.static(publicPath)); // 也允许根路径访问静态文件

// Health check - 放在最前面
app.get('/health', (_req, res) => {
  console.log('🏥 Health check requested');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

