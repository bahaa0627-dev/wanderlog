// 这些是被删除的佛罗伦萨地点
const deletedPlaces = [
  { id: 'f046b17f-2468-4ba2-b419-292833cbe8f2', name: 'Caffè Gilli' },
  { id: '0e714cdc-3488-467b-9a55-d54eb92ad7ce', name: 'La Ménagère' },
  { id: 'eaecc05a-0ba9-4176-8b59-0afa7df829a6', name: 'Ditta Artigianale' },
  { id: 'b3f392d6-a590-45c4-ad8c-3d5d6b0ba1bc', name: 'Caffe Concerto Paszkowski' },
  { id: '44854b92-6fd1-4e46-9505-b4afbe9ff1f2', name: 'Shake Café' }
];

console.log('被删除的佛罗伦萨地点:');
deletedPlaces.forEach((p, i) => {
  console.log(`${i + 1}. ${p.name} (${p.id})`);
});
console.log('\n这些地点都有名称和城市信息，只是坐标为(0,0)');
console.log('可以通过 Google Places API 或 Apify 补齐坐标');
