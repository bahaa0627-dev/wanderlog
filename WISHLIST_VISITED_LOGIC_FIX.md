# Wishlist 和 Visited 逻辑修复

## 问题理解

之前对 Wishlist 和 Visited 的关系理解有误。正确的逻辑应该是：

### 1. Wishlist（收藏）和 Visited（点评）是独立的

- **Wishlist**: 用户想去的地点列表
  - 收藏后可以标记为 MustGo 或 Today's Plan
  - 取消收藏后，自动从 MustGo 和 Today's Plan 移除

- **Visited（点评）**: 用户已访问并评价的地点
  - 可以在未收藏的情况下点评
  - 可以在已收藏的情况下点评
  - 点评数据（visitDate, userRating, userNotes, userPhotos）永久保留

### 2. 数据库状态（status 字段）

```
WISHLIST      - 在愿望清单中（未访问）
TODAYS_PLAN   - 在今日计划中（未访问）
VISITED       - 已访问（可能已取消收藏）
```

**重要**: `status` 字段只能有一个值，不能同时表示"visited + wishlist"

### 3. UI 显示逻辑

- **心形按钮（收藏）**:
  - `status = WISHLIST` 或 `TODAYS_PLAN` → 实心（已收藏）
  - `status = VISITED` → 空心（未收藏，但已点评）

- **MustGo / Today's Plan**:
  - 只有在已收藏（`status = WISHLIST` 或 `TODAYS_PLAN`）时才能操作
  - 取消收藏后自动禁用

## 修复内容

### 文件: `spot_detail_modal.dart`

#### 1. 修复 `_loadStatus` 方法

**问题**: 只要找到 tripSpot 就设置 `_isWishlist = true`

**修复**: 根据 status 判断是否在 wishlist 中

```dart
_isWishlist = tripSpot.status == TripSpotStatus.wishlist || 
              tripSpot.status == TripSpotStatus.todaysPlan;
```

#### 2. 修复 `_handleRemoveWishlist` 方法

**问题**: 取消收藏会删除 visited 数据

**修复**: 
- 如果地点已 visited: 保留 visited 状态和 check-in 数据，只将 status 改为 VISITED
- 如果地点未 visited: 完全删除记录

```dart
if (_isVisited) {
  // 保留 visited 数据，只是取消 wishlist 状态
  await manageTripSpot(
    status: TripSpotStatus.visited,
    priority: SpotPriority.optional,
  );
} else {
  // 完全删除
  await manageTripSpot(remove: true);
}
```

## 用户场景

### 场景 1: 收藏 → 点评 → 取消收藏

1. 用户收藏地点 A (`status = WISHLIST`)
2. 用户访问并点评地点 A (`status = VISITED`, 保存 check-in 数据)
3. 用户取消收藏地点 A
   - `status` 保持 `VISITED`
   - check-in 数据保留
   - 心形按钮变为空心
   - 从 All/MustGo/Today's Plan 列表移除
   - 仍然在 Visited 列表中显示

### 场景 2: 点评 → 收藏

1. 用户直接点评地点 B（未收藏）(`status = VISITED`)
2. 用户收藏地点 B
   - `status` 改为 `WISHLIST`
   - check-in 数据保留
   - 心形按钮变为实心
   - 出现在 All 列表中
   - 仍然在 Visited 列表中显示

### 场景 3: 收藏 → 取消收藏（未点评）

1. 用户收藏地点 C (`status = WISHLIST`)
2. 用户取消收藏地点 C
   - 记录被完全删除
   - 从所有列表中移除

## 测试要点

1. ✅ 已 visited 的地点可以取消收藏
2. ✅ 取消收藏后 check-in 数据保留
3. ✅ 取消收藏后心形按钮变为空心
4. ✅ 取消收藏后从 All/MustGo/Today's Plan 列表移除
5. ✅ 取消收藏后仍在 Visited 列表中显示
6. ✅ 未收藏的地点可以点评
7. ✅ 已点评的地点可以收藏

## 相关文件

- `wanderlog_app/lib/features/trips/presentation/widgets/myland/spot_detail_modal.dart`
- `wanderlog_app/lib/shared/widgets/save_spot_button.dart`
- `wanderlog_api/prisma/schema.prisma` (TripSpot model)
