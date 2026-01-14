# 重复地点问题诊断

## 问题描述

后台出现了多条 "The Round Tower" 记录，看上去是今天创建的。

## 可能的原因

### 1. 取消收藏逻辑问题（已修复）

**问题**:
在 `_handleRemoveWishlist` 方法中，当地点已经 visited 时，调用 `manageTripSpot` 但没有传递 `spotPayload`。

**修复**:
```dart
await ref.read(tripRepositoryProvider).manageTripSpot(
  tripId: _destinationId!,
  spotId: _spotId,
  status: TripSpotStatus.visited,
  spotPayload: _spotPayload(), // 添加 spotPayload
);
```

### 2. 重复点击按钮

**可能场景**:
- 用户快速多次点击收藏/取消收藏按钮
- 网络延迟导致用户以为没有响应，多次点击
- 没有防抖（debounce）机制

**解决方案**:
- 添加 loading 状态，防止重复点击
- 添加防抖机制

### 3. 并发请求

**可能场景**:
- 同时打开多个详情页
- 同时进行多个操作（收藏 + MustGo + Today's Plan）
- 网络请求并发执行

**解决方案**:
- 使用队列机制，确保请求顺序执行
- 添加请求去重逻辑

### 4. 后端问题

**可能原因**:
- 后端没有正确处理 `spotId` 的唯一性约束
- 后端在某些情况下会创建新记录而不是更新现有记录
- 数据库事务问题

**需要检查**:
- `places` 表的 `google_place_id` 字段是否有唯一性约束
- `trip_spots` 表的 `(trip_id, spot_id)` 组合是否有唯一性约束
- 后端 API 的幂等性

## 诊断步骤

### 1. 检查数据库约束

```sql
-- 检查 places 表的约束
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'places';

-- 检查 google_place_id 是否有唯一性约束
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'places' AND indexdef LIKE '%google_place_id%';

-- 检查 trip_spots 表的约束
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'trip_spots';
```

### 2. 检查重复记录

```sql
-- 查找重复的 places 记录
SELECT google_place_id, name, COUNT(*) as count
FROM places
WHERE name = 'The Round Tower'
GROUP BY google_place_id, name
HAVING COUNT(*) > 1;

-- 查找今天创建的 The Round Tower 记录
SELECT id, google_place_id, name, created_at
FROM places
WHERE name = 'The Round Tower'
  AND created_at >= CURRENT_DATE
ORDER BY created_at DESC;

-- 查找关联的 trip_spots 记录
SELECT ts.id, ts.trip_id, ts.spot_id, ts.status, ts.created_at, p.name
FROM trip_spots ts
JOIN places p ON ts.spot_id = p.id
WHERE p.name = 'The Round Tower'
  AND ts.created_at >= CURRENT_DATE
ORDER BY ts.created_at DESC;
```

### 3. 检查 API 日志

查看后端日志，找出：
- 今天对 "The Round Tower" 的所有 API 请求
- 请求的时间戳
- 请求的参数（spotId, tripId, status 等）
- 是否有重复的请求

### 4. 前端日志

在前端添加日志，记录：
- 每次调用 `manageTripSpot` 的时间和参数
- 用户的操作序列
- 网络请求的响应时间

## 临时解决方案

### 1. 添加防抖机制

```dart
// 在 UnifiedSpotDetailModal 中添加
Timer? _debounceTimer;
bool _isProcessing = false;

Future<bool> _handleRemoveWishlist() async {
  if (_isProcessing) {
    print('⚠️ Already processing, ignoring duplicate call');
    return false;
  }
  
  _isProcessing = true;
  try {
    // 原有逻辑
    // ...
    return true;
  } finally {
    _isProcessing = false;
  }
}
```

### 2. 添加请求去重

```dart
// 使用 spotId 作为 key，防止重复请求
final Map<String, Future<bool>> _pendingRequests = {};

Future<bool> _handleRemoveWishlist() async {
  final key = 'remove_$_spotId';
  
  // 如果已有相同的请求在进行中，返回该请求
  if (_pendingRequests.containsKey(key)) {
    print('⚠️ Duplicate request detected, reusing existing request');
    return _pendingRequests[key]!;
  }
  
  // 创建新请求
  final request = _performRemoveWishlist();
  _pendingRequests[key] = request;
  
  try {
    return await request;
  } finally {
    _pendingRequests.remove(key);
  }
}

Future<bool> _performRemoveWishlist() async {
  // 原有逻辑
  // ...
}
```

### 3. 后端添加幂等性检查

```typescript
// 伪代码
async function manageTripSpot(tripId, spotId, options) {
  // 检查是否已存在相同的记录
  const existing = await db.tripSpots.findOne({
    trip_id: tripId,
    spot_id: spotId,
  });
  
  if (existing) {
    // 更新现有记录
    return await db.tripSpots.update(existing.id, options);
  } else {
    // 创建新记录
    return await db.tripSpots.create({
      trip_id: tripId,
      spot_id: spotId,
      ...options,
    });
  }
}
```

## 清理重复数据

### 1. 找出重复的 places 记录

```sql
-- 找出所有重复的 google_place_id
WITH duplicates AS (
  SELECT google_place_id, MIN(id) as keep_id
  FROM places
  WHERE google_place_id IS NOT NULL
  GROUP BY google_place_id
  HAVING COUNT(*) > 1
)
SELECT p.id, p.google_place_id, p.name, p.created_at,
       CASE WHEN p.id = d.keep_id THEN 'KEEP' ELSE 'DELETE' END as action
FROM places p
JOIN duplicates d ON p.google_place_id = d.google_place_id
ORDER BY p.google_place_id, p.created_at;
```

### 2. 删除重复记录（谨慎操作！）

```sql
-- 备份数据
CREATE TABLE places_backup AS SELECT * FROM places;
CREATE TABLE trip_spots_backup AS SELECT * FROM trip_spots;

-- 删除重复的 places 记录（保留最早创建的）
WITH duplicates AS (
  SELECT google_place_id, MIN(id) as keep_id
  FROM places
  WHERE google_place_id IS NOT NULL
  GROUP BY google_place_id
  HAVING COUNT(*) > 1
),
to_delete AS (
  SELECT p.id
  FROM places p
  JOIN duplicates d ON p.google_place_id = d.google_place_id
  WHERE p.id != d.keep_id
)
DELETE FROM places
WHERE id IN (SELECT id FROM to_delete);

-- 注意：删除前需要先处理外键关联（trip_spots 等）
```

### 3. 更新 trip_spots 的引用

```sql
-- 将 trip_spots 中的重复 spot_id 更新为保留的 spot_id
WITH duplicates AS (
  SELECT google_place_id, MIN(id) as keep_id, ARRAY_AGG(id) as all_ids
  FROM places
  WHERE google_place_id IS NOT NULL
  GROUP BY google_place_id
  HAVING COUNT(*) > 1
)
UPDATE trip_spots ts
SET spot_id = d.keep_id
FROM duplicates d
WHERE ts.spot_id = ANY(d.all_ids) AND ts.spot_id != d.keep_id;
```

## 预防措施

### 1. 数据库层面

```sql
-- 添加唯一性约束
ALTER TABLE places
ADD CONSTRAINT places_google_place_id_unique
UNIQUE (google_place_id);

-- 添加复合唯一性约束
ALTER TABLE trip_spots
ADD CONSTRAINT trip_spots_trip_spot_unique
UNIQUE (trip_id, spot_id);
```

### 2. 应用层面

- 添加防抖机制
- 添加请求去重
- 添加 loading 状态
- 添加错误重试机制（带指数退避）

### 3. 监控和告警

- 监控重复记录的数量
- 监控 API 请求的频率
- 设置告警阈值

## 相关文件

- `wanderlog_app/lib/shared/widgets/unified_spot_detail_modal.dart` - 前端详情页
- `wanderlog_app/lib/core/supabase/repositories/trip_repository.dart` - 前端数据仓库
- 后端 API: `/api/trips/:tripId/spots` - 管理 trip spots

## 建议

1. **立即修复**: 添加 `spotPayload` 参数（已完成）
2. **短期**: 添加防抖和请求去重机制
3. **中期**: 后端添加幂等性检查和唯一性约束
4. **长期**: 添加监控和告警系统

## 注意事项

1. **数据完整性**: 删除重复记录前，确保备份数据
2. **外键关联**: 删除 places 记录前，先处理 trip_spots 等关联表
3. **用户数据**: 如果重复记录包含用户数据（check-in），需要合并数据
4. **测试**: 在测试环境验证修复方案后再应用到生产环境
