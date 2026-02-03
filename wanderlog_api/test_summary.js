function isSummaryRelevant(placeName, summary) {
  if (!placeName || !summary) return false;
  const normalizedSummary = summary.toLowerCase();
  const tokens = placeName
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3);

  if (tokens.length === 0) return false;
  return tokens.some(token => normalizedSummary.includes(token));
}

// Test cases
const tests = [
  ['Catacombs of Paris', 'The Catacombs of Paris hold the remains of over six million people and are famous for their eerie underground ossuaries.'],
  ['Cemetery du Père-Lachaise', 'Cimetière du Père-Lachaise in Paris is known for its famous residents like Jim Morrison and Oscar Wilde.'],
  ['Central Cemetery', 'The Central Cemetery in Vienna is known for the graves of Beethoven, Mozart, and Schubert.'],
  ['Highgate Cemetery', 'Highgate Cemetery in London is known for its Victorian-era graves and notable burials like Karl Marx.'],
];

for (const [name, summary] of tests) {
  const result = isSummaryRelevant(name, summary);
  const tokens = name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\s]/g, ' ').split(/\s+/).filter(t => t.length >= 3);
  console.log('Name:', name);
  console.log('Tokens:', tokens);
  console.log('Result:', result);
  console.log('---');
}
