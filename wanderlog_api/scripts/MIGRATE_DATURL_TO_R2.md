# DataURL 图片迁移到 R2 指南

## 概述

此脚本用于将数据库中所有 DataURL（base64）格式的图片迁移到 Cloudflare R2，并更新数据库中的 URL。

## 处理的表和字段

### 1. Place 表
- `coverImage` - 封面图
- `images` - 图片数组（JSON）

### 2. Collection 表
- `coverImage` - 集合封面图
- `people` - 人物数组中的 `avatarUrl`
- `works` - 作品数组中的 `coverImage`

### 3. Profile 表
- `avatarUrl` - 用户头像

### 4. Trip 表
- `coverImage` - 行程封面图

### 5. TripSpot 表
- `userPhotos` - 用户照片数组（JSON）

## 使用方法

### 1. 确保环境变量已配置

在 `.env` 文件中配置 R2 相关变量：

```bash
R2_PUBLIC_URL=https://wanderlog-images.blcubahaa0627.workers.dev
R2_UPLOAD_SECRET=your-secret-token
```

### 2. 运行迁移脚本

```bash
cd wanderlog_api
npx tsx scripts/migrate-daturl-to-r2.ts
```

### 3. 查看结果

脚本会：
- 实时显示迁移进度
- 打印每个表的统计信息（总数、成功、失败、跳过）
- 将失败记录保存到 `failed-daturl-migration.csv`

## 注意事项

1. **备份数据库**：运行前请先备份数据库
2. **R2 配置**：确保 `R2_UPLOAD_SECRET` 已正确配置
3. **网络连接**：需要稳定的网络连接上传图片到 R2
4. **处理时间**：根据 DataURL 数量，可能需要较长时间
5. **批次大小**：默认每批处理 10 条记录，可在脚本中调整 `BATCH_SIZE`

## 失败处理

如果迁移过程中有失败记录：

1. 查看 `failed-daturl-migration.csv` 文件
2. 检查失败原因（通常是网络问题或 R2 配置问题）
3. 修复问题后可以重新运行脚本（已迁移的会自动跳过）

## 验证迁移结果

迁移完成后，可以运行以下查询验证：

```sql
-- 检查是否还有 DataURL
SELECT COUNT(*) FROM places WHERE cover_image LIKE 'data:image/%';
SELECT COUNT(*) FROM collections WHERE cover_image LIKE 'data:image/%';
SELECT COUNT(*) FROM profiles WHERE avatar_url LIKE 'data:image/%';
SELECT COUNT(*) FROM trips WHERE cover_image LIKE 'data:image/%';
```

如果所有查询都返回 0，说明迁移成功。

## 性能优化

- 如果数据量很大，可以考虑分批运行（修改脚本中的查询条件）
- 可以调整 `BATCH_SIZE` 和 `DELAY_BETWEEN_BATCHES` 来平衡速度和稳定性
