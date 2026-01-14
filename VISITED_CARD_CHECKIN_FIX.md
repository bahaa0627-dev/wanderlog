# Visited Card Check-in Display Fix

## 问题总结

1. **已 check-in 的地点无法取消收藏** - `spot_detail_modal.dart` 中使用 `remove: true` 会删除整个 trip_spot 记录
2. **取消收藏后 check-in 信息丢失** - 同上原因
3. **Visited 卡片缺少用户评价信息** - 卡片上没有显示用户的评分和访问时间

## 修复内容

### 1. 修复 `spot_detail_modal.dart` 中的取消收藏逻辑

**文件**: `wanderlog_app/lib/features/trips/presentation/widgets/myland/spot_detail_modal.dart`

**修改**: `_handleRemoveWishlist` 方法

**原因**: 对于已 visited 的地点，应该保留 check-in 数据（visitDate, userRating, userNotes, userPhotos），只取消收藏状态。

**修改后逻辑**:
- 如果地点已 visited: 调用 `manageTripSpot` 保持 `status: TripSpotStatus.visited`，不传 `remove: true`
- 如果地点未 visited: 调用 `manageTripSpot` 传 `remove: true` 完全删除

### 2. Visited 卡片显示 Check-in 信息

**文件**: `wanderlog_app/lib/features/trips/presentation/pages/myland/spots_tab.dart`

**组件**: `_VisitedSpotCard`

**已有功能**:
- 卡片分为上下两部分
- 上部分: 图片 + 基本信息（名称、评分、营业时间、标签）
- 下部分: Check-in 信息（📔 emoji + 用户笔记 + 访问日期 + 用户评分星级）

**显示条件**: `hasCheckInData = visitDate != null || userRating != null || userNotes.isNotEmpty || userPhotos.isNotEmpty`

**数据流**:
1. `TripSpot` 从后端获取，包含 `visitDate`, `userRating`, `userNotes`, `userPhotos`
2. 转换为 `_SpotEntry` 时保留这些字段
3. `_VisitedSpotCard` 根据 `hasCheckInData` 显示下半部分

## 测试步骤

1. **测试取消收藏已 visited 地点**:
   - 进入 Visited 页面
   - 点击一个已 check-in 的地点卡片
   - 在详情页点击取消收藏（心形按钮）
   - 验证: 地点从 wishlist 移除，但 check-in 信息保留
   - 重新收藏该地点，验证 check-in 信息仍然存在

2. **测试 Visited 卡片显示**:
   - 进入 Visited 页面
   - 验证每个卡片显示:
     - 上半部分: 地点名称、Google 评分、营业时间、标签
     - 下半部分（如果有 check-in 数据）: 📔 + 用户笔记 + 访问日期 + 用户评分星级

## 相关文件

- `wanderlog_app/lib/features/trips/presentation/widgets/myland/spot_detail_modal.dart`
- `wanderlog_app/lib/features/trips/presentation/pages/myland/spots_tab.dart`
- `wanderlog_app/lib/shared/widgets/unified_spot_detail_modal.dart` (参考实现)
