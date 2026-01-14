# 取消收藏保留 Visited 数据修复

## 问题描述

当用户取消收藏（unsave）一个已经 check-in 的地点时，该地点的 visited 数据（visitDate, userRating, userNotes, userPhotos）会被删除，地点从 Visited 列表中消失。

这不符合预期：
- 用户可能只是想取消收藏，但不想删除 check-in 记录
- Check-in 记录是用户的旅行历史，应该保留

## 根本原因

之前的 `_handleRemoveWishlist` 逻辑：
```dart
await ref.read(tripRepositoryProvider).manageTripSpot(
  tripId: _destinationId!,
  spotId: _spotId,
  remove: true,  // 完全删除这个 spot
);
widget.onStatusChanged?.call(_spotId, isRemoved: true);
```

问题：
1. `remove: true` 会完全删除 tripSpot 记录，包括所有数据
2. `isRemoved: true` 会让 `spots_tab` 从列表中移除这个 entry
3. 用户的 check-in 数据丢失

## 解决方案

### 核心思路

区分两种情况：
1. **已 visited 的地点**：取消收藏时保留 visited 数据，只是改变状态
2. **未 visited 的地点**：取消收藏时完全删除

### 修改内容

**修改文件**: `wanderlog_app/lib/shared/widgets/unified_spot_detail_modal.dart`

**修改位置**: `_handleRemoveWishlist` 方法

```dart
Future<bool> _handleRemoveWishlist() async {
  if (_destinationId == null) return false;
  
  // 如果地点已经 visited，不应该完全删除，只是取消收藏状态
  final shouldKeepVisited = _isVisited;
  
  // Optimistic update - change state immediately
  setState(() {
    _isWishlist = false;
    _isMustGo = false;
    _isTodaysPlan = false;
  });
  CustomToast.showSuccess(context, 'Removed from Wishlist');
  
  // 如果已经 visited，不要从列表中移除，只是更新状态
  if (shouldKeepVisited) {
    widget.onStatusChanged?.call(_spotId, isRemoved: false, needsReload: true);
  } else {
    widget.onStatusChanged?.call(_spotId, isRemoved: true);
  }
  
  try {
    if (shouldKeepVisited) {
      // 保留 visited 数据，只是取消 wishlist/mustGo/todaysPlan 状态
      await ref.read(tripRepositoryProvider).manageTripSpot(
        tripId: _destinationId!,
        spotId: _spotId,
        status: TripSpotStatus.visited,
        // 保留现有的 visitDate, userRating, userNotes, userPhotos
      );
    } else {
      // 如果没有 visited 数据，可以完全删除
      await ref.read(tripRepositoryProvider).manageTripSpot(
        tripId: _destinationId!,
        spotId: _spotId,
        remove: true,
      );
      WishlistStatusCache.update(_spotId, null);
      _destinationId = null;
    }
    
    ref.invalidate(tripsProvider);
    ref.invalidate(wishlistStatusProvider);
    return true;
  } catch (e) {
    // Revert on error
    if (mounted) setState(() => _isWishlist = true);
    widget.onStatusChanged?.call(_spotId, isRemoved: false);
    _showError('Error: $e');
    return false;
  }
}
```

## 数据流

### 场景 1: 取消收藏已 visited 的地点

```
1. 用户点击心形按钮取消收藏
2. UnifiedSpotDetailModal:
   - 检测到 _isVisited = true
   - 调用 manageTripSpot(status: TripSpotStatus.visited)
   - 保留 visitDate, userRating, userNotes, userPhotos
   - 调用 onStatusChanged(isRemoved: false, needsReload: true)
3. spots_tab:
   - 收到 needsReload: true
   - 调用 _loadDestinationsFromServer()
   - 重新加载数据
   - 地点仍然在 Visited 列表中
   - 但不在 All/MustGo/Today's Plan 列表中（因为 status = visited）
4. UI 更新:
   - Visited 列表：地点仍然显示，check-in 数据完整
   - All 列表：地点消失（因为不再是 wishlist）
   - 详情页：心形按钮变为空心（未收藏状态）
```

### 场景 2: 取消收藏未 visited 的地点

```
1. 用户点击心形按钮取消收藏
2. UnifiedSpotDetailModal:
   - 检测到 _isVisited = false
   - 调用 manageTripSpot(remove: true)
   - 完全删除 tripSpot 记录
   - 调用 onStatusChanged(isRemoved: true)
3. spots_tab:
   - 收到 isRemoved: true
   - 从 _entries 列表中移除这个 entry
4. UI 更新:
   - All 列表：地点消失
   - 详情页：心形按钮变为空心（未收藏状态）
```

## 状态说明

### TripSpot 的状态组合

| 状态 | wishlist | mustGo | todaysPlan | visited | 说明 |
|------|----------|--------|------------|---------|------|
| 未收藏 | false | false | false | false | 不在任何列表中 |
| 收藏（All） | true | false | false | false | 在 All 列表中 |
| MustGo | true | true | false | false | 在 All 和 MustGo 列表中 |
| Today's Plan | true | false | true | false | 在 All 和 Today's Plan 列表中 |
| Visited（已收藏） | true | false | false | true | 在 All 和 Visited 列表中 |
| **Visited（已取消收藏）** | **false** | **false** | **false** | **true** | **只在 Visited 列表中** |

### 关键点

修改后，一个地点可以处于 "visited but not in wishlist" 状态：
- `status = TripSpotStatus.visited`
- `priority = null` 或 `SpotPriority.optional`
- 不在 All/MustGo/Today's Plan 列表中
- 仍然在 Visited 列表中
- Check-in 数据完整保留

## 测试步骤

### 测试 1: 取消收藏已 visited 的地点

1. 打开 VAGO → Visited 标签
2. 找到一个已 check-in 的地点（有 "Your Visit" 内容）
3. 点击地点，打开详情页
4. 点击心形按钮取消收藏
5. 关闭详情页
6. **预期结果**:
   - 地点仍然在 Visited 列表中
   - Check-in 数据（日期、评分、笔记）完整显示
   - 地点不在 All 列表中

### 测试 2: 重新收藏已 visited 的地点

1. 继续上面的测试
2. 打开 Visited 列表中的地点详情页
3. 点击心形按钮重新收藏
4. 关闭详情页
5. 切换到 All 标签
6. **预期结果**:
   - 地点出现在 All 列表中
   - 地点仍然在 Visited 列表中
   - Check-in 数据完整保留

### 测试 3: 取消收藏未 visited 的地点

1. 打开 VAGO → All 标签
2. 找到一个未 check-in 的地点
3. 点击地点，打开详情页
4. 点击心形按钮取消收藏
5. 关闭详情页
6. **预期结果**:
   - 地点从 All 列表中消失
   - 地点不在 Visited 列表中

### 测试 4: MustGo 地点取消收藏

1. 打开 VAGO → MustGo 标签
2. 找到一个已 check-in 的 MustGo 地点
3. 点击地点，打开详情页
4. 点击心形按钮取消收藏
5. 关闭详情页
6. **预期结果**:
   - 地点从 MustGo 列表中消失
   - 地点从 All 列表中消失
   - 地点仍然在 Visited 列表中
   - Check-in 数据完整保留

### 测试 5: 删除 check-in vs 取消收藏

1. 打开 VAGO → Visited 标签
2. 找到一个已 check-in 的地点
3. 点击地点，打开详情页
4. 点击删除 check-in 按钮（垃圾桶图标）
5. 确认删除
6. **预期结果**:
   - 地点从 Visited 列表中消失
   - 如果地点还在 wishlist 中，会出现在 All 列表中
   - Check-in 数据被删除

## 后端 API 说明

### manageTripSpot API

```dart
Future<void> manageTripSpot({
  required String tripId,
  required String spotId,
  TripSpotStatus? status,
  SpotPriority? priority,
  DateTime? visitDate,
  int? userRating,
  String? userNotes,
  List<String>? userPhotos,
  Map<String, dynamic>? spotPayload,
  bool remove = false,
});
```

**关键参数**:
- `remove: true` - 完全删除 tripSpot 记录
- `status: TripSpotStatus.visited` - 保留 visited 状态，但不设置 wishlist
- 如果不传递 `visitDate`, `userRating`, `userNotes`, `userPhotos`，后端会保留现有值

## 相关文件

- `wanderlog_app/lib/shared/widgets/unified_spot_detail_modal.dart` - 详情页组件
- `wanderlog_app/lib/features/trips/presentation/pages/myland/spots_tab.dart` - VAGO 页面
- `wanderlog_app/lib/core/supabase/repositories/trip_repository.dart` - Trip 数据仓库

## 注意事项

1. **数据一致性**: 取消收藏后，地点仍然在数据库中，只是状态改变
2. **列表过滤**: Visited 列表应该显示所有 `status = visited` 的地点，无论是否在 wishlist 中
3. **重新收藏**: 用户可以随时重新收藏已 visited 的地点，check-in 数据不会丢失
4. **删除 check-in**: 如果用户想删除 check-in 数据，应该使用删除按钮，而不是取消收藏

## 总结

通过区分 "取消收藏" 和 "删除 check-in" 两个操作，我们确保了：
1. ✅ 取消收藏不会删除 visited 数据
2. ✅ Visited 列表仍然显示已 check-in 的地点
3. ✅ 用户可以随时重新收藏
4. ✅ Check-in 记录作为旅行历史被保留

这是一个更符合用户预期的行为，保护了用户的数据。
