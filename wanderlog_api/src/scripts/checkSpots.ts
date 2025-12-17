/**
 * Quick script to check imported spots
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSpots() {
  try {
    // Get all places
    const allSpots = await prisma.place.findMany({
      orderBy: {
        rating: 'desc'
      }
    });

    console.log(`\n📊 Total places in database: ${allSpots.length}\n`);

    // Group by city
    const byCity = allSpots.reduce((acc: any, spot) => {
      acc[spot.city] = (acc[spot.city] || 0) + 1;
      return acc;
    }, {});

    console.log('By City:');
    Object.entries(byCity).forEach(([city, count]) => {
      console.log(`   ${city}: ${count} spots`);
    });

    // Group by category
    const byCategory = allSpots.reduce((acc: any, spot) => {
      const cat = spot.category || 'Unknown';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {});

    console.log('\nBy Category:');
    Object.entries(byCategory).forEach(([category, count]) => {
      console.log(`   ${category}: ${count} spots`);
    });

    // Show top 10 rated spots
    console.log('\n⭐ Top 10 Rated Places:');
    allSpots
      .filter(s => s.rating)
      .slice(0, 10)
      .forEach((spot, i) => {
        console.log(`   ${i + 1}. ${spot.name} - ${spot.rating}⭐ (${spot.ratingCount || 0} reviews)`);
        console.log(`      ${spot.category} in ${spot.city}`);
      });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSpots();
