# 封面图圆角修复

## 问题描述

之前的修改将所有地点卡片的封面图左下角都改为了直角，但实际需求是：
- **Visited 页面**：封面图左下角是直角
- **All/MustGo/Today's Plan 页面**：封面图左下角保持圆角

## 解决方案

### 恢复 SpotCard 的圆角

**修改文件**: `wanderlog_app/lib/features/trips/presentation/widgets/myland/spot_card.dart`

**修改内容**:
```dart
// 恢复为圆角
ClipRRect(
  borderRadius: const BorderRadius.horizontal(
    left: Radius.circular(AppTheme.radiusMedium - 2),
  ),
  child: SizedBox(
    width: 110,
    child: spot.images.isNotEmpty
        ? _buildImageWidget(spot.images.first)
        : _buildPlaceholder(),
  ),
)
```

### 保持 _VisitedSpotCard 的直角

**文件**: `wanderlog_app/lib/features/trips/presentation/pages/myland/spots_tab.dart`

**保持不变**:
```dart
// Visited 页面的封面图左下角是直角
ClipRRect(
  borderRadius: const BorderRadius.only(
    topLeft: Radius.circular(AppTheme.radiusMedium - 2),
    bottomLeft: Radius.zero, // Sharp corner at bottom-left
  ),
  child: SizedBox(
    width: 110,
    child: entry.spot.images.isNotEmpty
        ? _buildImageWidget(entry.spot.images.first)
        : _buildPlaceholder(),
  ),
)
```

## 视觉效果

### All / MustGo / Today's Plan 页面
```
┌─────────────┐
│   Image     │  ← 左上角圆角
│             │
│             │
└─────────────┘  ← 左下角圆角
```

### Visited 页面
```
┌─────────────┐
│   Image     │  ← 左上角圆角
│             │
│             │
└─────────────   ← 左下角直角（90度）
```

## 设计理由

### Visited 页面使用直角的原因
- Visited 卡片有两个部分：上半部分（基本信息）和下半部分（check-in 内容）
- 两部分之间有分隔线
- 封面图左下角直角可以与分隔线对齐，视觉上更整洁

### All 页面使用圆角的原因
- All 页面的卡片只有一个部分（基本信息）
- 没有分隔线
- 圆角更柔和，符合 Neo-brutalism 风格

## 相关文件

- `wanderlog_app/lib/features/trips/presentation/widgets/myland/spot_card.dart` - All/MustGo/Today's Plan 页面使用的卡片
- `wanderlog_app/lib/features/trips/presentation/pages/myland/spots_tab.dart` - Visited 页面使用的卡片（`_VisitedSpotCard`）

## 测试步骤

### 测试 1: All 页面封面图圆角
1. 打开 VAGO → All 标签
2. 查看地点卡片的封面图
3. **预期结果**:
   - 左上角是圆角
   - 左下角是圆角

### 测试 2: MustGo 页面封面图圆角
1. 打开 VAGO → MustGo 标签
2. 查看地点卡片的封面图
3. **预期结果**:
   - 左上角是圆角
   - 左下角是圆角

### 测试 3: Today's Plan 页面封面图圆角
1. 打开 VAGO → Today's Plan 标签
2. 查看地点卡片的封面图
3. **预期结果**:
   - 左上角是圆角
   - 左下角是圆角

### 测试 4: Visited 页面封面图直角
1. 打开 VAGO → Visited 标签
2. 查看地点卡片的封面图
3. **预期结果**:
   - 左上角是圆角
   - 左下角是直角（90度）
   - 与分隔线对齐

## 技术细节

### BorderRadius 配置

**圆角（All/MustGo/Today's Plan）**:
```dart
BorderRadius.horizontal(
  left: Radius.circular(AppTheme.radiusMedium - 2),
)
```
等价于：
```dart
BorderRadius.only(
  topLeft: Radius.circular(AppTheme.radiusMedium - 2),
  bottomLeft: Radius.circular(AppTheme.radiusMedium - 2),
)
```

**直角（Visited）**:
```dart
BorderRadius.only(
  topLeft: Radius.circular(AppTheme.radiusMedium - 2),
  bottomLeft: Radius.zero,
)
```

### 为什么是 `radiusMedium - 2`？

- 卡片的 `borderRadius` 是 `AppTheme.radiusMedium`（通常是 12）
- 卡片有边框（`borderWidth: AppTheme.borderMedium`，通常是 2）
- 封面图的圆角需要比卡片小一点，以适应边框
- 所以使用 `radiusMedium - 2 = 10`

## 注意事项

1. **一致性**: 确保所有使用 `SpotCard` 的地方都是圆角
2. **特殊性**: 只有 Visited 页面的 `_VisitedSpotCard` 使用直角
3. **维护性**: 如果未来需要修改圆角，只需要修改 `AppTheme.radiusMedium` 的值
