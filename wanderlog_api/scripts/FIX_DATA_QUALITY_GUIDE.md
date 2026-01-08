# Data Quality Fix Script - 使用指南

## 概述

`fix-data-quality.ts` 脚本用于修复 Wikidata 导入数据的质量问题，包括：

1. **QID 名称修复** - 将 "Q12345" 格式的名称替换为真实名称
2. **分类重新检测** - 根据名称关键词重新分类地点
3. **名称英文化** - 将非英文名称转换为英文

## 使用方法

### 基本命令

```bash
# 预览所有修复（不实际修改数据库）
npx ts-node scripts/fix-data-quality.ts --dry-run

# 执行所有修复
npx ts-node scripts/fix-data-quality.ts

# 只修复 QID 名称
npx ts-node scripts/fix-data-quality.ts --fix-type qid-names

# 只修复分类
npx ts-node scripts/fix-data-quality.ts --fix-type categories

# 只修复翻译
npx ts-node scripts/fix-data-quality.ts --fix-type translations

# 限制处理数量（用于测试）
npx ts-node scripts/fix-data-quality.ts --dry-run --limit 10
```

### 命令行参数

- `--dry-run` - 预览模式，不实际修改数据库
- `--limit N` - 限制处理 N 条记录（用于测试）
- `--fix-type TYPE` - 指定修复类型：
  - `qid-names` - 只修复 QID 名称
  - `categories` - 只修复分类
  - `translations` - 只修复翻译
  - `all` - 执行所有修复（默认）

## 功能详解

### 1. QID 名称修复

**问题**：某些地点的名称是 Wikidata QID（如 "Q12345"）而不是真实名称。

**解决方案**：
- 扫描所有 `name` 字段为 Q+数字 格式的记录
- 从 Wikidata API 获取真实名称
- 保存原始 QID 到 `customFields.originalName`
- 更新 `name` 字段为真实名称

**示例**：
```
Q17452818 → Eiffel Tower
Q243 → Louvre Museum
```

### 2. 分类重新检测

**问题**：许多地点被错误分类为 "landmark" 或 "architecture"。

**解决方案**：
- 扫描 `category_slug` 为 landmark 或 architecture 的记录
- 根据名称关键词检测正确分类
- 支持多语言关键词（英语、法语、德语、意大利语、日语）
- 保存原始分类到 `customFields.originalCategory`
- 更新 `categorySlug`, `categoryEn`, `categoryZh` 三个字段

**支持的分类**：
- museum（博物馆）
- church（教堂）
- castle（城堡）
- temple（寺庙）
- library（图书馆）
- university（大学）
- hotel（酒店）
- cafe（咖啡馆）
- restaurant（餐厅）
- bar（酒吧）
- theater（剧院）
- stadium（体育场）

**示例**：
```
"Louvre Museum" → category: museum
"Notre Dame Cathedral" → category: church
"Château de Versailles" → category: castle
```

### 3. 名称英文化

**问题**：某些地点的名称包含非 ASCII 字符（非英文）。

**解决方案**：
- 扫描包含非 ASCII 字符的名称
- 从 Wikidata API 获取英文名称
- 保存原始名称到 `customFields.originalName`
- 更新 `name` 字段为英文名称

**示例**：
```
"埃菲尔铁塔" → "Eiffel Tower"
"Château de Versailles" → "Palace of Versailles"
```

## 性能特性

### 批量处理
- 每批处理 50 条记录
- 使用数据库事务确保数据一致性

### 速率限制
- Wikidata API 请求限制为 10 req/s
- 自动速率控制，避免 API 限流

### 错误处理
- 自动重试失败的 API 请求（指数退避：1s, 2s, 4s）
- 最多重试 3 次
- 收集所有错误到报告中
- 跳过无 `sourceDetail` 的记录

### 进度日志
- 每 100 条记录输出进度
- 实时显示处理状态

## 数据保护

### 原始数据保存

所有修改前的数据都会保存到 `customFields`：

```json
{
  "originalName": "Q12345",
  "originalCategory": "landmark",
  "lastFixedAt": "2026-01-08T10:30:00.000Z",
  "fixType": ["qid_name", "category"]
}
```

### 可追溯性

- `originalName` - 原始名称（如果被修改）
- `originalCategory` - 原始分类（如果被修改）
- `lastFixedAt` - 最后修复时间
- `fixType` - 应用的修复类型数组

## 报告输出

脚本执行后会生成详细报告：

```
==================================================
📊 Summary Report
==================================================
Mode: LIVE
Total scanned: 1000
QID names fixed: 150
Categories changed: 320
Names translated: 85
Errors: 5

📝 QID Name Fixes (sample):
  Q17452818 → Eiffel Tower
  Q243 → Louvre Museum
  ...

🏷️ Category Fixes (sample):
  Louvre Museum: landmark → museum
  Notre Dame Cathedral: landmark → church
  ...

🌐 Translation Fixes (sample):
  埃菲尔铁塔 → Eiffel Tower
  ...

❌ Errors (sample):
  abc123: Network timeout
  ...
```

## 测试

### 运行属性测试

```bash
npm test -- --testPathPattern="dataQuality.*property"
```

### 测试覆盖

- ✅ QID 名称检测（Property 1）
- ✅ 分类检测（Property 2）
- ✅ 非 ASCII 检测（Property 3）
- ✅ 标签选择优先级（Property 4）
- ✅ 原始数据保存（Property 5）
- ✅ 修复类型记录（Property 6）
- ✅ 分类字段一致性（Property 7）

所有测试：54 passed

## 最佳实践

1. **先运行 dry-run**
   ```bash
   npx ts-node scripts/fix-data-quality.ts --dry-run --limit 100
   ```
   检查修复结果是否符合预期

2. **分步执行**
   ```bash
   # 先修复分类（不需要 API 调用，速度快）
   npx ts-node scripts/fix-data-quality.ts --fix-type categories
   
   # 再修复 QID 名称
   npx ts-node scripts/fix-data-quality.ts --fix-type qid-names
   
   # 最后修复翻译
   npx ts-node scripts/fix-data-quality.ts --fix-type translations
   ```

3. **小批量测试**
   ```bash
   npx ts-node scripts/fix-data-quality.ts --limit 50
   ```
   先处理少量数据，确认无误后再处理全部

4. **监控错误**
   - 查看报告中的错误列表
   - 对于网络错误，可以重新运行脚本
   - 脚本会跳过已修复的记录（通过 `customFields.fixType` 判断）

## 注意事项

⚠️ **网络依赖**
- QID 名称修复和翻译需要访问 Wikidata API
- 确保网络连接稳定
- API 请求可能较慢，请耐心等待

⚠️ **数据备份**
- 建议在执行前备份数据库
- 原始数据会保存在 `customFields` 中，但仍建议备份

⚠️ **重复执行**
- 脚本可以安全地重复执行
- 已修复的记录会被跳过（除非原始数据已被覆盖）

## 技术实现

### 架构
- 使用 Prisma ORM 访问数据库
- 复用 `wikidataImportUtils.ts` 中的工具函数
- 批量更新使用数据库事务
- 速率限制使用 RateLimiter 类
- 错误重试使用 RetryHandler 类

### 依赖
- Prisma - 数据库 ORM
- wikidataImportUtils - 工具函数库
- Wikidata API - 获取实体标签

## 相关文档

- 需求文档：`.kiro/specs/wikidata-data-quality/requirements.md`
- 设计文档：`.kiro/specs/wikidata-data-quality/design.md`
- 任务列表：`.kiro/specs/wikidata-data-quality/tasks.md`
