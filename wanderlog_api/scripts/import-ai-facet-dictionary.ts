/**
 * Import AI Facet Dictionary from CSV
 * 
 * 从 ai_facet_dictionary.csv 导入数据到 ai_facet_dictionary 表
 * 
 * Usage: npx ts-node scripts/import-ai-facet-dictionary.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface FacetRecord {
  kind: string;
  id: string;
  en: string;
  zh: string;
  priority: number;
  allowed_categories: string[] | null;
  derive_from: { source: string } | null;
}

function parseCSV(content: string): FacetRecord[] {
  const lines = content.trim().split('\n');
  // Skip header line (lines[0])
  
  const records: FacetRecord[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse CSV line, handling quoted fields
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    // Map to record
    const record: FacetRecord = {
      kind: values[0] || '',
      id: values[1] || '',
      en: values[2] || '',
      zh: values[3] || '',
      priority: parseInt(values[4]) || 50,
      allowed_categories: values[5] ? values[5].split(';').filter(Boolean) : null,
      derive_from: values[6] ? { source: values[6] } : null,
    };
    
    // Only include facet records
    if (record.kind === 'facet' && record.id) {
      records.push(record);
    }
  }
  
  return records;
}

async function importFacetDictionary() {
  console.log('Starting AI Facet Dictionary import...\n');
  
  // Read CSV file
  const csvPath = path.join(__dirname, '../../ai_facet_dictionary.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`);
    process.exit(1);
  }
  
  const content = fs.readFileSync(csvPath, 'utf-8');
  const records = parseCSV(content);
  
  console.log(`Found ${records.length} facet records to import\n`);
  
  let imported = 0;
  let updated = 0;
  let errors = 0;
  
  for (const record of records) {
    try {
      // Use raw SQL to upsert since Prisma model might not exist yet
      await prisma.$executeRaw`
        INSERT INTO ai_facet_dictionary (id, en, zh, priority, allowed_categories, derive_from)
        VALUES (
          ${record.id},
          ${record.en},
          ${record.zh},
          ${record.priority},
          ${record.allowed_categories}::text[],
          ${record.derive_from ? JSON.stringify(record.derive_from) : null}::jsonb
        )
        ON CONFLICT (id) DO UPDATE SET
          en = EXCLUDED.en,
          zh = EXCLUDED.zh,
          priority = EXCLUDED.priority,
          allowed_categories = EXCLUDED.allowed_categories,
          derive_from = EXCLUDED.derive_from,
          updated_at = NOW()
      `;
      
      // Check if it was an insert or update
      const existing = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM ai_facet_dictionary WHERE id = ${record.id}
      `;
      
      if (existing[0].count > 0n) {
        updated++;
      } else {
        imported++;
      }
      
      console.log(`✓ ${record.id}: ${record.en} (${record.zh}) - priority: ${record.priority}`);
    } catch (error) {
      errors++;
      console.error(`✗ Error importing ${record.id}:`, error);
    }
  }
  
  console.log('\n========================================');
  console.log('Import Summary:');
  console.log(`  Total records: ${records.length}`);
  console.log(`  Imported: ${imported}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Errors: ${errors}`);
  console.log('========================================\n');
  
  // Verify import
  const count = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM ai_facet_dictionary
  `;
  console.log(`Total records in ai_facet_dictionary: ${count[0].count}`);
}

async function main() {
  try {
    await importFacetDictionary();
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
