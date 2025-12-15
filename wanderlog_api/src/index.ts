import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { bootstrap } from 'global-agent';

import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

// Enable global proxy agent if HTTP_PROXY or HTTPS_PROXY is set
// This allows all HTTP/HTTPS requests (including google-auth-library) to use the proxy
const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.https_proxy;
if (proxyUrl) {
  console.log(`🌐 Using proxy: ${proxyUrl}`);
  bootstrap();
} else {
  console.log('ℹ️  No proxy configured');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // 允许内联脚本用于管理后台
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务 - 管理后台
app.use('/admin', express.static('public'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

import authRoutes from './routes/authRoutes';
import spotRoutes from './routes/spotRoutes';
import tripRoutes from './routes/tripRoutes';
import publicPlaceRoutes from './routes/publicPlaceRoutes';

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/spots', spotRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/public-places', publicPlaceRoutes);
// app.use('/api/trips', tripRoutes);
// app.use('/api/spots', spotRoutes);

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});

export default app;

