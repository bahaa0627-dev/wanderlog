# Mocation 电影 5448 导入记录

## 电影信息
- **电影ID**: 5448
- **中文名**: 我的天才女友 第二季
- **英文名**: My Brilliant Friend Season 2
- **来源URL**: https://prd.mocation.cc/html/movie_detail.html?id=5448
- **地点数量**: 33（爬取）/ 42（数据库中）

## 导入时间
2026-01-20 15:44

## 导入结果
✅ **成功导入 33 个地点**
- 新增地点: 33
- 更新地点: 0（部分地点之前已存在，添加了新的电影关联）
- 跳过重复: 0
- 失败: 0

📊 **数据库验证**: 42 个地点关联到电影 5448
- 包含之前已存在的地点（添加了新的电影关联）
- 所有地点都已正确标记 `source: "mocation"`
- 所有地点都包含 `tags.others: ["Pilgrimage"]`

## 地点列表

### 意大利 - 那不勒斯 (Naples)
1. 卡罗三世广场 (Piazza Carlo III)
2. 那不勒斯艺术学院 (Art School Di Napoli)
3. 阿莱西奥·马佐基街 (Via Alessio Mazzocchi)
4. G.诺皮科内男装店 (G.no Picone)
5. 格拉维纳宫 (Palazzo Gravina)
6. 理想浴室海滨浴场 (Bagno Ideal)
7. 马里奥·华伦天奴鞋店 (Mario Valentino)
8. 基艾亚滨海路215号 (Riviera di Chiaia, 215)
9. 贝里西奥书店 (Libreria Berisio)
10. 维格列纳街44号 (44 Via Vigliena)

### 意大利 - 卡塞塔 (Caserta)
11. 《我的天才女友》布景 (My Brilliant Friend film set)
12. 卡斯特拉纳餐厅 (La Castellana)
13. 松林街露台 (Terrace of Via della Pineta)

### 意大利 - 索伦托 (Sorrento)
14. 伊克斯西尔维多利亚大酒店 (Grand Hotel Excelsior Vittoria)

### 意大利 - 皮亚诺迪索伦托 (Piano di Sorrento)
15. 阿马尔菲大道观景台 (Amalfi Drive Viewpoint)

### 意大利 - 加埃塔 (Gaeta)
16. 最后的狂野海滩 (Ultima Spiaggia "Selvaggia")

### 意大利 - 伊斯基亚岛地区
17. 老佩扎皮亚纳街16号 (Via Vecchia Pezzapiana, 16) - 福里奥
18. 安吉洛·里佐利道144号 (Corso Angelo Rizzoli, 144) - 拉科阿梅诺
19. 红衣主教路易吉·拉维特拉诺街36号 (Via Cardinale Luigi Lavitrano, 36) - 福里奥
20. 托里奥内街 (Via Torrione) - 福里奥
21. 阿拉贡广场 (Piazzale Aragonese) - 伊斯基亚
22. 乔治·科拉法街36号 (Via Giorgio Corafà, 36) - 巴拉诺迪伊斯基亚

### 意大利 - 比萨 (Pisa)
23. 比萨高等师范学校 (Scuola Normale Superiore di Pisa)
24. 伦卡诺安东尼奥·帕西诺蒂大道 (Lungarno Antonio Pacinotti)
25. 盖尔斯服装店 (Marciano GUESS)
26. 皇家维多利亚酒店 (Royal Victoria Hotel)
27. 中桥 (Ponte di Mezzo)
28. 骑士咖啡馆 (Cavalieri)
29. 提迪胡同 (Vicolo del Tidi)
30. 弗朗西斯科·卡拉拉广场 (Piazza Francesco Carrara)
31. 比萨斜塔 (Leaning Tower of Pisa)

### 意大利 - 其他城市
32. 皇家阿尼工厂旧址 (Real Fabbrica D' Arni) - 托雷安农齐亚塔
33. 博卡书店 (Libreria Bocca) - 米兰

## 技术细节

### 爬虫命令
```bash
npx tsx wanderlog_api/scripts/scrape-mocation.ts \
  --type movie \
  --start 5448 \
  --end 5448 \
  --output wanderlog_api/mocation-movie-5448.json
```

### 导入命令
```bash
npx tsx wanderlog_api/scripts/import-mocation-json.ts \
  wanderlog_api/mocation-movie-5448.json \
  --upload-r2
```

### 数据处理
- ✅ 图片已下载并上传到 Cloudflare R2
- ✅ 地点信息已保存到 Supabase 数据库
- ✅ 电影关联信息已建立
- ✅ 标签已自动生成（pilgrimage 标签添加到 tags.others）

## 数据特点

### 地理分布
- 主要取景地：那不勒斯及周边地区
- 伊斯基亚岛：多个场景
- 比萨：埃莱娜上大学的场景
- 其他意大利城市：索伦托、卡塞塔、米兰等

### 场景类型
- 建筑地标：格拉维纳宫、比萨斜塔
- 教育机构：那不勒斯艺术学院、比萨高等师范学校
- 商业场所：书店、鞋店、服装店、咖啡馆
- 住宅：多个街道地址
- 自然景观：海滩、观景台
- 酒店：伊克斯西尔维多利亚大酒店、皇家维多利亚酒店

### 剧集分布
- 第1集：5个地点
- 第2集：4个地点
- 第3集：3个地点
- 第4集：3个地点
- 第5集：6个地点
- 第7集：5个地点
- 第8集：7个地点

## 数据库字段

每个地点包含以下信息：
- `name`: 地点中文名
- `i18n.name_en`: 地点英文名
- `i18n.name_zh`: 地点中文名
- `city`: 城市（包含国家信息，如"那不勒斯 意大利"）
- `country`: 国家（部分为 null）
- `latitude`: 纬度（部分为 0，需要后续补充）
- `longitude`: 经度（部分为 0，需要后续补充）
- `cover_image`: 封面图片（R2 URL: https://img.vago.to/places/cover/...）
- `images`: 图片数组
- `source`: "mocation"
- `source_detail`: "movie:5448:地点名"
- `tags.others`: ["Pilgrimage"]
- `custom_fields.movies`: 电影信息数组
  - `movieId`: "5448"
  - `movieNameCn`: "我的天才女友 第二季"
  - `movieNameEn`: "My Brilliant Friend Season 2"
  - `sceneDescription`: 场景描述
  - `image`: 场景图片 URL
  - `sourceUrl`: 电影详情页 URL
- `custom_fields.sourceUrl`: 电影详情页 URL
- `description`: 场景描述

## 相关文件
- `wanderlog_api/mocation-movie-5448.json` - 爬取的原始数据
- `wanderlog_api/scripts/scrape-mocation.ts` - 爬虫脚本
- `wanderlog_api/scripts/import-mocation-json.ts` - 导入脚本
- `wanderlog_api/check-movie-5448.ts` - 数据验证脚本
- `wanderlog_api/check-supabase-connection.ts` - 数据库连接检查脚本
- `wanderlog_api/check-place-structure.ts` - 地点数据结构检查脚本

## 后续操作建议

### 1. 验证数据
访问管理后台查看导入的地点：
```
http://localhost:3000/admin/admin.html
```

筛选条件：
- 来源：mocation
- 标签：Pilgrimage

或使用检查脚本：
```bash
npx tsx wanderlog_api/check-movie-5448.ts
```

### 2. 创建合集
可以基于这些地点创建"我的天才女友 第二季"主题合集：
- 合集名称：我的天才女友 第二季取景地
- 描述：跟随剧集探访意大利那不勒斯、伊斯基亚岛和比萨的经典场景
- 封面图：选择代表性场景图片
- 地点：选择33个导入的地点

### 3. 数据质量检查
- 验证地理坐标准确性
- 检查图片显示是否正常
- 确认标签分类是否合理
- 补充缺失的地址或描述信息

## 注意事项
- 所有图片已从 mocation 源站下载并上传到 R2，避免外链失效
- 地点名称保留了中英文双语
- 场景描述和时间戳信息保存在 customFields 中
- 自动添加了 "pilgrimage" 标签用于影视朝圣地筛选
