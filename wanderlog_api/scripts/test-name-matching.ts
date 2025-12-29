import { calculateNameSimilarity } from '../src/services/placeMatcherService';

// Test cases for prefix translation matching
const testCases = [
  // Same name
  ['Musée du Louvre', 'Musée du Louvre', 'exact match'],
  
  // Translated prefix
  ['Museum du Louvre', 'Musée du Louvre', 'translated prefix'],
  ['Restaurant El Bulli', 'Restaurante El Bulli', 'translated prefix'],
  ['Square de Catalunya', 'Plaça de Catalunya', 'translated prefix'],
  
  // Contains match (key test cases)
  ['Sagrada Familia', 'Basílica de la Sagrada Família', 'contains match'],
  ['Park Güell', 'Park Guell', 'accent difference'],
  ['Las Ramblas', 'La Rambla', 'similar names'],
  ['Casa Batlló', 'Casa Batllo', 'accent difference'],
  
  // Different names (should have low score)
  ['Café Central', 'Restaurant El Bulli', 'different names'],
  ['Eiffel Tower', 'Louvre Museum', 'different names'],
];

console.log('Testing name similarity with improved matching:\n');

for (const [name1, name2, description] of testCases) {
  const score = calculateNameSimilarity(name1, name2);
  const status = score >= 0.7 ? '✅' : score >= 0.5 ? '⚠️' : '❌';
  console.log(`${status} ${description}`);
  console.log(`   "${name1}" vs "${name2}"`);
  console.log(`   Score: ${score.toFixed(3)}\n`);
}
