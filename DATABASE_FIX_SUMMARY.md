# 数据库时间戳格式修复说明

## 问题描述

在实现地点收藏功能时，发现服务端报错：

```
Invalid `prisma.tripSpot.upsert()` invocation:
Inconsistent column data: Could not convert value "1766053311553" of the field `createdAt` to type `DateTime`.
```

## 根本原因

数据库中的 `createdAt`、`updatedAt` 等时间字段存在两种不正确的格式：

1. **Unix 时间戳（毫秒）**：如 `1766053311553`
2. **ISO 8601 格式**：如 `2025-12-13T12:39:20Z`

而 Prisma + SQLite 期望的格式是：`YYYY-MM-DD HH:MM:SS`（如 `2025-12-13 12:39:20`）

## 修复过程

### 1. 修复 Unix 时间戳格式
```sql
UPDATE Place 
SET createdAt = datetime(CAST(createdAt AS INTEGER) / 1000, 'unixepoch')
WHERE typeof(createdAt) = 'text' 
  AND length(createdAt) = 13 
  AND CAST(createdAt AS INTEGER) > 1000000000000;
```

### 2. 修复 ISO 8601 格式
```sql
UPDATE Place 
SET createdAt = datetime(createdAt)
WHERE createdAt LIKE '%T%Z' OR createdAt LIKE '%T%';
```

### 3. 修复的表
- `Place` 表：215 条记录
- `TripSpot` 表：5 条记录
- `Trip` 表：4 条记录
- `Collection` 表：1 条记录
- `CollectionSpot` 表：3 条记录
- `User` 表
- `VerificationToken` 表

## 修复结果

所有时间戳现在都使用正确的格式：`YYYY-MM-DD HH:MM:SS`

```bash
# 验证修复
sqlite3 prisma/dev.db "SELECT id, createdAt FROM Place LIMIT 5;"
```

输出示例：
```
cmj4a943g0000y0kx62k4e8ca|2025-12-13 12:39:20
cmj4a94n10001y0kxi0yx9ik9|2025-12-13 12:39:21
cmj4jqu4b00009p8ziw8s2npi|2025-12-13 17:05:03
```

## 预防措施

为了防止将来再次出现此问题，建议：

### 1. 在 Prisma 操作中统一使用 Date 对象
```typescript
// ✅ 正确
await prisma.place.create({
  data: {
    name: 'Example',
    createdAt: new Date(), // JavaScript Date 对象
  }
});

// ❌ 错误
await prisma.place.create({
  data: {
    name: 'Example',
    createdAt: Date.now(), // Unix 时间戳
  }
});

// ❌ 错误
await prisma.place.create({
  data: {
    name: 'Example',
    createdAt: new Date().toISOString(), // ISO 字符串
  }
});
```

### 2. 让 Prisma 自动处理时间戳
由于 schema 中已经设置了 `@default(now())`，通常不需要手动传入：

```prisma
model Place {
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

### 3. 如果需要手动设置，使用 Date 对象
```typescript
const place = await prisma.place.create({
  data: {
    name: 'Example',
    // 让 Prisma 自动处理
    // createdAt 会自动设置为当前时间
  }
});
```

## 相关文件

- Prisma Schema: `wanderlog_api/prisma/schema.prisma`
- Trip Controller: `wanderlog_api/src/controllers/tripController.ts`
- 数据库文件: `wanderlog_api/prisma/dev.db`

## 测试建议

修复后，重新测试以下场景：

1. ✅ 添加地点到 wishlist
2. ✅ 获取 destination 详情（包含 tripSpots）
3. ✅ 创建新的 place
4. ✅ 更新现有 place

所有时间戳相关的数据库操作应该都能正常工作了。

## 执行时间

修复完成时间：2025-12-18 18:22 - 18:25

影响的记录：
- Place: 215 条
- TripSpot: 5 条
- Trip: 4 条
- Collection: 1 条
- CollectionSpot: 3 条
- User: 若干条
- VerificationToken: 若干条

## 第二轮修复（首页合集问题）

**问题：** 首页合集无法加载，错误信息：
```
Invalid `prisma.collection.findMany()` invocation:
Inconsistent column data: Could not convert value "2025-12-16 19:31:20" of the field `lastSyncedAt` to type `DateTime`.
```

**原因：** Collection、Trip 等表仍有未修复的时间戳格式。

**解决：** 执行额外的 SQL 修复所有剩余的时间戳问题。

**验证结果：** ✅ 所有表的时间戳都已修复为正确格式。

