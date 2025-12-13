# 从 Google Maps 列表导入地点 - 完整指南

## 方法 1: 使用 Apify 自动爬取 (推荐但可能有限制)

### 步骤

1. **确保 API 配置正确**
   ```bash
   cd wanderlog_api
   # 检查 .env 文件中的配置
   cat .env | grep APIFY
   ```

2. **运行导入脚本**
   ```bash
   http_proxy=http://127.0.0.1:7890 https_proxy=http://127.0.0.1:7890 npx tsx import_places.ts
   ```

### 注意事项
- Apify 对短链接 (goo.gl) 的支持可能有限
- 建议使用完整的 Google Maps 列表 URL
- 免费账户可能有请求限制

---

## 方法 2: 手动提取 Place ID (100% 可靠)

### 适用场景
- Apify 爬取失败
- 只有少量地点需要导入
- 需要精确控制导入的地点

### 步骤

#### 步骤 1: 打开 Google Maps 列表
访问你的 Google Maps 列表: https://maps.app.goo.gl/Cd5DMwwW89C2jDbU9

#### 步骤 2: 提取 Place ID

对于列表中的每个地点:

1. **点击地点**打开详情
2. **复制 URL** 从地址栏
   - URL 格式类似: `https://www.google.com/maps/place/...`
3. **从 URL 中提取 Place ID**:
   - 方法 A: 查找 `place_id=` 参数
     ```
     https://www.google.com/maps/place/...?place_id=ChIJLU7jZClu5kcR4PcOOO6p3I0
     ```
     Place ID = `ChIJLU7jZClu5kcR4PcOOO6p3I0`
   
   - 方法 B: 使用 Chrome DevTools
     1. 右键点击地点 → 检查
     2. 在 HTML 中搜索 `data-placeid`
     3. 复制值

#### 步骤 3: 创建 Place ID 列表文件

创建一个文件 `place_ids.json`:

```json
{
  "placeIds": [
    "ChIJLU7jZClu5kcR4PcOOO6p3I0",
    "ChIJD3uTd9hx5kcR1IQvGfr8dbk",
    "ChIJ...",
    "ChIJ..."
  ],
  "note": "从 Google Maps 列表手动提取的 Place IDs"
}
```

#### 步骤 4: 使用脚本导入

创建导入脚本 `import_manual_places.ts`:

```typescript
import dotenv from 'dotenv';
import publicPlaceService from './src/services/publicPlaceService';
import fs from 'fs';

dotenv.config();

async function main() {
  // 读取 Place IDs
  const data = JSON.parse(fs.readFileSync('place_ids.json', 'utf-8'));
  const placeIds = data.placeIds;

  console.log(`📥 准备导入 ${placeIds.length} 个地点...`);
  console.log('');

  const result = await publicPlaceService.batchAddByPlaceIds(
    placeIds,
    'manual',
    { note: data.note || '手动导入', timestamp: new Date() }
  );

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 导入结果');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ 成功: ${result.success} 个`);
  console.log(`❌ 失败: ${result.failed} 个`);
  console.log('');

  if (result.errors.length > 0) {
    console.log('❌ 错误详情:');
    result.errors.forEach((err, i) => {
      console.log(`  ${i + 1}. ${err}`);
    });
  }
}

main().catch(console.error);
```

运行:
```bash
cd wanderlog_api
http_proxy=http://127.0.0.1:7890 https_proxy=http://127.0.0.1:7890 npx tsx import_manual_places.ts
```

---

## 方法 3: 使用浏览器扩展提取 (最简单)

### 推荐扩展
1. **Google Maps Scraper** (Chrome)
2. **Instant Data Scraper** (Chrome/Firefox)

### 使用步骤
1. 安装扩展
2. 打开 Google Maps 列表
3. 运行扩展，选择提取 Place ID
4. 导出为 JSON 或 CSV
5. 使用方法 2 的脚本导入

---

## 方法 4: 使用 API 端点 (通过 HTTP 请求)

### 启动 API 服务器
```bash
cd wanderlog_api
http_proxy=http://127.0.0.1:7890 https_proxy=http://127.0.0.1:7890 npm run dev
```

### 批量导入 Place IDs

```bash
curl -X POST http://localhost:3000/api/public-places/import-by-place-ids \
  -H "Content-Type: application/json" \
  -d '{
    "placeIds": [
      "ChIJLU7jZClu5kcR4PcOOO6p3I0",
      "ChIJD3uTd9hx5kcR1IQvGfr8dbk"
    ],
    "sourceDetails": {
      "note": "从 Google Maps 列表导入",
      "listUrl": "https://maps.app.goo.gl/Cd5DMwwW89C2jDbU9"
    }
  }'
```

---

## 查看导入结果

### 查看所有地点
```bash
curl http://localhost:3000/api/public-places | python3 -m json.tool
```

### 查看统计信息
```bash
curl http://localhost:3000/api/public-places/stats | python3 -m json.tool
```

### 搜索地点
```bash
curl "http://localhost:3000/api/public-places/search?q=巴黎" | python3 -m json.tool
```

---

## 故障排除

### 问题 1: Apify 返回 0 个结果
**原因**: 
- Google Maps 短链接不被支持
- 列表是私有的
- Apify 账户限制

**解决方案**: 使用方法 2 手动提取 Place ID

### 问题 2: Google Maps API 错误
**原因**: 
- API Key 无效
- 超出配额限制
- 需要使用代理

**解决方案**: 
```bash
# 检查 API Key
cat wanderlog_api/.env | grep GOOGLE_MAPS_API_KEY

# 使用代理
export http_proxy=http://127.0.0.1:7890
export https_proxy=http://127.0.0.1:7890
```

### 问题 3: 数据库连接错误
**原因**: Prisma 数据库未初始化

**解决方案**:
```bash
cd wanderlog_api
npx prisma db push
npx prisma generate
```

---

## 性能优化

### 批量导入建议
- 每批 20-50 个 Place ID
- 使用 `Promise.all()` 并行处理
- 添加延迟避免 API 限制

### 示例: 带延迟的批量导入

```typescript
async function importWithDelay(placeIds: string[], delayMs: number = 1000) {
  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[]
  };

  for (const placeId of placeIds) {
    try {
      await publicPlaceService.addByPlaceId(placeId, 'manual');
      results.success++;
      console.log(`✅ Imported: ${placeId}`);
    } catch (error: any) {
      results.failed++;
      results.errors.push(`${placeId}: ${error.message}`);
      console.error(`❌ Failed: ${placeId}`);
    }
    
    // 添加延迟
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  return results;
}
```

---

## 相关文档
- [公共地点库 API 文档](./PUBLIC_PLACES_LIBRARY_README.md)
- [Google Maps API 设置](./GOOGLE_MAPS_SETUP.md)
- [Apify 配置指南](./PROXY_SETUP_GUIDE.md)
