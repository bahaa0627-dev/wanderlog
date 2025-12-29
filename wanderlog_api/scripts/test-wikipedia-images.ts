import { wikipediaImageService } from '../src/services/wikipediaImageService';

async function test() {
  const places = [
    { name: 'El Bosc de les Fades', city: 'Barcelona' },
    { name: 'Granja Viader', city: 'Barcelona' },
    { name: 'Sagrada Familia', city: 'Barcelona' },
    { name: 'Park Güell', city: 'Barcelona' },
    { name: 'Eiffel Tower', city: 'Paris' },
  ];

  console.log('Testing Wikipedia image service...\n');

  for (const place of places) {
    console.log(`Searching: ${place.name} (${place.city})`);
    const result = await wikipediaImageService.getImageForPlace(place.name, place.city);
    if (result.imageUrl) {
      console.log(`  ✅ Found: ${result.imageUrl.substring(0, 80)}...`);
    } else {
      console.log(`  ❌ Not found`);
    }
  }
}

test().catch(console.error);
