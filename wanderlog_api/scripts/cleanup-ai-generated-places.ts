/**
 * Cleanup AI-Generated Places Script
 * 
 * Removes duplicate ai_generated places from the database using the same
 * 3-tier detection strategy as the live duplicate prevention:
 * 1. Exact name match (case-insensitive)
 * 2. Same city + name similarity > 0.8
 * 3. Nearby coordinates (0.01 degree ~1km) + name similarity > 0.6
 * 
 * Usage: npx ts-node scripts/cleanup-ai-generated-places.ts [--dry-run]
 */

import prisma from '../src/config/database';
import { calculateNameSimilarity } from '../src/services/placeMatcherService';

interface DuplicateGroup {
  keepId: string;
  keepName: string;
  duplicateIds: string[];
  duplicateNames: string[];
  reason: string;
}

async function findDuplicates(): Promise<DuplicateGroup[]> {
  console.log('🔍 Finding duplicate ai_generated places...\n');
  
  // Get all ai_generated places
  const aiPlaces = await prisma.place.findMany({
    where: { source: 'ai_generated' },
    select: {
      id: true,
      name: true,
      city: true,
      country: true,
      latitude: true,
      longitude: true,
      createdAt: true,
      coverImage: true,
    },
    orderBy: { createdAt: 'asc' }, // Keep oldest
  });
  
  console.log(`📊 Found ${aiPlaces.length} ai_generated places\n`);
  
  const duplicateGroups: DuplicateGroup[] = [];
  const processedIds = new Set<string>();
  
  for (let i = 0; i < aiPlaces.length; i++) {
    const place = aiPlaces[i];
    if (processedIds.has(place.id)) continue;
    
    const duplicates: { id: string; name: string; reason: string }[] = [];
    
    for (let j = i + 1; j < aiPlaces.length; j++) {
      const other = aiPlaces[j];
      if (processedIds.has(other.id)) continue;
      
      // Strategy 1: Exact name match (case-insensitive)
      if (place.name.toLowerCase() === other.name.toLowerCase()) {
        duplicates.push({ id: other.id, name: other.name, reason: 'exact_name' });
        processedIds.add(other.id);
        continue;
      }
      
      // Strategy 2: Same city + name similarity > 0.8
      if (place.city && other.city && 
          place.city.toLowerCase() === other.city.toLowerCase()) {
        const similarity = calculateNameSimilarity(place.name, other.name);
        if (similarity > 0.8) {
          duplicates.push({ 
            id: other.id, 
            name: other.name, 
            reason: `same_city_similar_name (${similarity.toFixed(2)})` 
          });
          processedIds.add(other.id);
          continue;
        }
      }
      
      // Strategy 3: Nearby coordinates + name similarity > 0.6
      const latDiff = Math.abs(place.latitude - other.latitude);
      const lngDiff = Math.abs(place.longitude - other.longitude);
      if (latDiff < 0.01 && lngDiff < 0.01) {
        const similarity = calculateNameSimilarity(place.name, other.name);
        if (similarity > 0.6) {
          duplicates.push({ 
            id: other.id, 
            name: other.name, 
            reason: `nearby_similar_name (${similarity.toFixed(2)})` 
          });
          processedIds.add(other.id);
        }
      }
    }
    
    if (duplicates.length > 0) {
      duplicateGroups.push({
        keepId: place.id,
        keepName: place.name,
        duplicateIds: duplicates.map(d => d.id),
        duplicateNames: duplicates.map(d => d.name),
        reason: duplicates.map(d => d.reason).join(', '),
      });
    }
  }
  
  return duplicateGroups;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  
  console.log('🧹 AI-Generated Places Cleanup Script');
  console.log('=====================================\n');
  
  if (isDryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }
  
  try {
    const duplicateGroups = await findDuplicates();
    
    if (duplicateGroups.length === 0) {
      console.log('✅ No duplicates found!');
      return;
    }
    
    console.log(`\n📋 Found ${duplicateGroups.length} duplicate groups:\n`);
    
    let totalDuplicates = 0;
    for (const group of duplicateGroups) {
      console.log(`  Keep: "${group.keepName}" (${group.keepId})`);
      for (let i = 0; i < group.duplicateIds.length; i++) {
        console.log(`    ❌ Delete: "${group.duplicateNames[i]}" (${group.duplicateIds[i]})`);
      }
      console.log(`    Reason: ${group.reason}\n`);
      totalDuplicates += group.duplicateIds.length;
    }
    
    console.log(`\n📊 Summary: ${totalDuplicates} duplicates to remove\n`);
    
    if (!isDryRun) {
      console.log('🗑️  Deleting duplicates...\n');
      
      const allDuplicateIds = duplicateGroups.flatMap(g => g.duplicateIds);
      
      const result = await prisma.place.deleteMany({
        where: { id: { in: allDuplicateIds } },
      });
      
      console.log(`✅ Deleted ${result.count} duplicate places`);
    } else {
      console.log('💡 Run without --dry-run to delete duplicates');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
