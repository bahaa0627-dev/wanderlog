import * as fs from 'fs';
import * as path from 'path';

// List of Pritzker Prize laureates
const pritzkerArchitects = [
  "Aldo Rossi",
  "Alejandro Alavena",
  "Arata Isozaki",
  "Balkrishna Doshi",
  "Christian de Portzamparc",
  "David Chipperfield",
  "Diébédo Francis Kéré",
  "Eduardo Souto de Moura",
  "Frank Gehry",
  "Frei Otto",
  "Fumihiko Maki",
  "Gordon Bunshaft",
  "Gottfried Böhm",
  "Hans Hollein",
  "Herzog & de Meuron",
  "I. M. Pei",
  "Jacques Herzog",
  "James Stirling",
  "Jean Nouvel",
  "Jean-Philippe Vassal",
  "Jørn Utzon",
  "Kazuyo Sejima",
  "Kenzō Tange",
  "Kevin Roche",
  "Luis Barragán",
  "Norman Foster",
  "Oscar Niemeyer",
  "Paulo Mendes da Rocha",
  "Peter Zumthor",
  "Philip Johnson",
  "Pierre de Meuron",
  "RCR Arquitectes",
  "Rafael Moneo",
  "Rem Koolhaas",
  "Renzo Piano",
  "Richard Meier",
  "Richard Rogers",
  "Riken Yamamoto",
  "Robert Venturi",
  "Ryue Nishizawa",
  "SANAA",
  "Shelley McNamara",
  "Shigeru Ban",
  "Sverre Fehn",
  "Tadao Ando",
  "Thom Mayne",
  "Toyo Ito",
  "Wang Shu",
  "Yvonne Farrell",
  "Zaha Hadid",
  "Álvaro Siza Vieira"
];

const filePath = path.resolve(process.cwd(), '../Architecture from wikidata/Architecture list.json');

console.log('📊 Counting Pritzker Prize architect works...\n');

const fileContent = fs.readFileSync(filePath, 'utf-8');
const entries = JSON.parse(fileContent);

console.log(`Total entries in file: ${entries.length}\n`);

const pritzkerWorks = entries.filter((entry: any) => 
  pritzkerArchitects.includes(entry.architectLabel)
);

console.log(`Total Pritzker Prize architect works: ${pritzkerWorks.length}\n`);

// Count by architect
const countByArchitect: Record<string, number> = {};
pritzkerWorks.forEach((entry: any) => {
  const architect = entry.architectLabel;
  countByArchitect[architect] = (countByArchitect[architect] || 0) + 1;
});

console.log('Works by architect:');
Object.entries(countByArchitect)
  .sort((a, b) => b[1] - a[1])
  .forEach(([architect, count]) => {
    console.log(`  ${architect}: ${count}`);
  });

console.log(`\n✅ Total: ${pritzkerWorks.length} works from ${Object.keys(countByArchitect).length} Pritzker laureates`);
