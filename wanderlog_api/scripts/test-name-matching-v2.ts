/**
 * Test name matching with language variations
 */
import { calculateNameSimilarity } from '../src/services/placeMatcherService';

const testCases = [
  // Spanish variations
  ['La Rambla', 'Las Ramblas', 'Spanish plural'],
  ['Park Güell', 'Park Guell', 'Umlaut'],
  ['Park Güell', 'Parc Güell', 'Catalan spelling'],
  
  // Accents and diacritics
  ['Café de Flore', 'Cafe de Flore', 'French accent'],
  ['Sagrada Familia', 'Sagrada Família', 'Spanish tilde'],
  ['Casa Batlló', 'Casa Batllo', 'Catalan accent'],
  
  // Prefix variations
  ['Gothic Quarter', 'Barri Gòtic', 'Translation'],
  ['La Boqueria', 'Mercat de la Boqueria', 'Full name'],
  
  // Should NOT match
  ['Park Güell', 'Sagrada Familia', 'Different places'],
  ['La Rambla', 'Casa Batlló', 'Different places'],
];

console.log('=== Name Matching Test ===\n');

for (const [name1, name2, description] of testCases) {
  const score = calculateNameSimilarity(name1, name2);
  const status = score >= 0.7 ? '✅' : '❌';
  console.log(`${status} ${description}`);
  console.log(`   "${name1}" vs "${name2}"`);
  console.log(`   Score: ${score.toFixed(2)}\n`);
}
