/**
 * Simple test server to verify spots data
 */

import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/spots', async (req, res) => {
  try {
    const spots = await prisma.place.findMany({
      orderBy: { rating: 'desc' },
      take: 30
    });
    res.json({ count: spots.length, spots });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/spots/city-center/:city', async (req, res) => {
  try {
    const { city } = req.params;
    const spots = await prisma.place.findMany({
      where: {
        city: {
          equals: city,
        }
      },
      orderBy: [
        { rating: 'desc' },
        { ratingCount: 'desc' }
      ],
      take: 30
    });

    const center = {
      'copenhagen': { lat: 55.6761, lng: 12.5683 },
      'Copenhagen': { lat: 55.6761, lng: 12.5683 },
    }[city] || { lat: 55.6761, lng: 12.5683 };

    res.json({
      city,
      center,
      count: spots.length,
      spots
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3001; // Use different port to avoid conflict

app.listen(PORT, () => {
  console.log(`✅ Test server running on http://localhost:${PORT}`);
  console.log(`   Try: http://localhost:${PORT}/api/spots/city-center/copenhagen`);
});
