import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 被误删的佛罗伦萨地点数据
const florencePlaces = [
  {
    id: 'f046b17f-2468-4ba2-b419-292833cbe8f2',
    name: 'Caffè Gilli',
    city: 'Florence',
    country: 'Italy',
    latitude: 0,
    longitude: 0,
    source: 'ai_search',
    created_at: '2025-12-26T16:30:37.000Z'
  },
  {
    id: '0e714cdc-3488-467b-9a55-d54eb92ad7ce',
    name: 'La Ménagère',
    city: 'Florence',
    country: 'Italy',
    latitude: 0,
    longitude: 0,
    source: 'ai_search',
    created_at: '2025-12-26T16:30:38.000Z'
  },
  {
    id: 'eaecc05a-0ba9-4176-8b59-0afa7df829a6',
    name: 'Ditta Artigianale',
    city: 'Florence',
    country: 'Italy',
    latitude: 0,
    longitude: 0,
    source: 'ai_search',
    created_at: '2025-12-26T16:30:39.000Z'
  },
  {
    id: 'b3f392d6-a590-45c4-ad8c-3d5d6b0ba1bc',
    name: 'Caffe Concerto Paszkowski',
    city: 'Florence',
    country: 'Italy',
    latitude: 0,
    longitude: 0,
    source: 'ai_search',
    created_at: '2025-12-26T16:30:40.000Z'
  },
  {
    id: '44854b92-6fd1-4e46-9505-b4afbe9ff1f2',
    name: 'Shake Café',
    city: 'Florence',
    country: 'Italy',
    latitude: 0,
    longitude: 0,
    source: 'ai_search',
    created_at: '2025-12-26T16:30:41.000Z'
  }
];

async function restoreFlorencePlaces() {
  console.log('🔄 开始恢复佛罗伦萨地点...\n');

  for (const place of florencePlaces) {
    console.log(`  恢复: ${place.name}`);
    
    const { error } = await supabase
      .from('places')
      .insert({
        id: place.id,
        name: place.name,
        city: place.city,
        country: place.country,
        latitude: place.latitude,
        longitude: place.longitude,
        source: place.source,
        created_at: place.created_at,
        updated_at: place.created_at
      });

    if (error) {
      console.error(`  ❌ 恢复失败: ${place.name}`, error);
    } else {
      console.log(`  ✅ 恢复成功: ${place.name} (ID: ${place.id})`);
    }
  }

  console.log('\n✅ 恢复完成！');
  console.log('💡 提示: 这些地点的坐标为 (0,0)，后续可以使用 Apify 补充正确的坐标信息');
}

restoreFlorencePlaces().catch(console.error);
