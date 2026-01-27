import express from 'express';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

app.get('/check-images', async (req, res) => {
  try {
    const places = await prisma.place.findMany({
      where: {
        coverImage: { not: null }
      },
      select: {
        id: true,
        name: true,
        city: true,
        coverImage: true,
      }
    });

    const oldFormat = places.filter(p => 
      p.coverImage?.match(/\/places\/[a-f0-9-]{36}\/cover\.jpg/)
    );

    const newFormat = places.filter(p =>
      p.coverImage?.includes('/places/cover/v1/')
    );

    const other = places.filter(p =>
      !p.coverImage?.match(/\/places\/[a-f0-9-]{36}\/cover\.jpg/) &&
      !p.coverImage?.includes('/places/cover/v1/')
    );

    res.json({
      total: places.length,
      oldFormat: {
        count: oldFormat.length,
        places: oldFormat.map(p => ({
          name: p.name,
          city: p.city,
          id: p.id,
          url: p.coverImage
        }))
      },
      newFormat: { count: newFormat.length },
      other: { count: other.length }
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Check images: http://localhost:${PORT}/check-images`);
});
