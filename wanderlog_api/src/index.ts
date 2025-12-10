import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

import authRoutes from './routes/authRoutes';
import spotRoutes from './routes/spotRoutes';
import tripRoutes from './routes/tripRoutes';

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/spots', spotRoutes);
app.use('/api/trips', tripRoutes);
// app.use('/api/trips', tripRoutes);
// app.use('/api/spots', spotRoutes);

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});

export default app;

