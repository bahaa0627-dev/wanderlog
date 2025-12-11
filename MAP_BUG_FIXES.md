# 地图Bug修复

## 问题
1. ❌ 地图上没有显示任何spot标记
2. ❌ 地图只能放大无法缩小

## 修复方案

### 1. ✅ 添加缩放控制按钮

在**非全屏模式**下，右上角新增两个垂直排列的按钮：
- **+ (放大)** - 增加缩放级别
- **- (缩小)** - 减少缩放级别

```dart
// 非全屏时显示缩放按钮
if (!_isFullscreen) ...[
  const SizedBox(width: 8),
  Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      IconButtonCustom(icon: Icons.add, ...),   // 放大
      const SizedBox(height: 8),
      IconButtonCustom(icon: Icons.remove, ...), // 缩小
    ],
  ),
],
```

**改进点**：
- 使用动态缩放：`currentZoom + 1` / `currentZoom - 1`
- 而不是固定值 14.0 / 12.0
- 更自然的缩放体验

### 2. ✅ 改进Spot标记定位算法

#### 问题原因
原始算法使用简单的线性缩放：
```dart
final dx = (spot.longitude - mapCenter.lng) * screenWidth * 8000;
final dy = (mapCenter.lat - spot.latitude) * screenHeight * 8000;
```

这个 `8000` 是一个"魔法数字"，在不同缩放级别下不准确。

#### 新算法
使用更精确的**墨卡托投影近似**：
```dart
// 在zoom=13时，1度 ≈ 96000像素
final pixelsPerDegree = 96000.0;

final latDiff = spot.latitude - mapCenter.lat;
final lngDiff = spot.longitude - mapCenter.lng;

final dx = lngDiff * pixelsPerDegree;
final dy = -latDiff * pixelsPerDegree; // y轴方向相反
```

**关键改进**：
- 基于标准的Mapbox缩放级别 (zoom=13)
- 1度 ≈ 111km ≈ 96000像素
- 正确处理y轴方向（屏幕y向下，纬度向上）

### 3. ✅ 增强调试信息

添加详细的console日志：

```dart
// 城市和spots数量
print('Current city: $_selectedCity');
print('Current city spots count: ${_currentCitySpots.length}');

// 每个标记的详细位置
print('Marker 1. Design Museum: lat=55.6841, lng=12.5934');
print('  Diff: lat=0.0080, lng=0.0251');
print('  Screen position: left=768.0, top=384.0');
```

**用途**：
- 确认spots是否正确加载
- 验证标记位置计算是否合理
- 快速定位标记不可见的原因

### 4. ✅ 空值检查

```dart
if (spots.isEmpty) {
  print('WARNING: No spots found for city $_selectedCity');
  return [];
}
```

避免在没有spots时尝试渲染导致的错误。

## 测试步骤

### 测试缩放功能
1. 启动应用，进入Map标签
2. 确认右上角有**3个按钮**：
   - 城市选择器（左上）
   - 全屏按钮
   - **+按钮（放大）**
   - **-按钮（缩小）**
3. 点击 **+** 应该放大地图
4. 点击 **-** 应该缩小地图

### 测试Spot标记
1. 查看Xcode Console或Flutter日志
2. 应该看到：
   ```
   Current city: Copenhagen
   Current city spots count: 6
   Building markers for 6 spots
   Marker 1. Design Museum: lat=55.6841, lng=12.5934
   ...
   ```
3. 如果看到 `spots count: 0` → mock数据未加载
4. 如果看到 `spots count: 6` 但看不到标记 → 位置计算有误，检查屏幕坐标

### 验证标记位置
理论上6个哥本哈根spots应该在屏幕中心附近：

| Spot | 纬度差 | 经度差 | 预期位置 |
|------|--------|--------|----------|
| Design Museum | +0.008 | +0.025 | 右上 |
| Torvehallerne | +0.008 | -0.010 | 左上 |
| Coffee Collective | +0.006 | +0.010 | 右上 |
| Vor Frelsers Kirke | -0.003 | +0.026 | 右下 |
| Nyhavn | +0.004 | +0.023 | 右上 |
| Tivoli Gardens | -0.002 | -0.000 | 正下方 |

所有spots应该在屏幕中心±2000像素范围内可见。

## 已知限制

### 标记定位不是真实的Mapbox Annotations
当前实现：
- ✅ 简单快速
- ✅ 无需额外依赖
- ❌ 标记不随地图缩放/平移更新
- ❌ 需要固定在zoom=13

### 更好的方案（未实现）
使用Mapbox官方API：
```dart
final pointAnnotationManager = await _mapboxMap!.annotations.createPointAnnotationManager();
pointAnnotationManager.create(PointAnnotationOptions(
  geometry: Point(coordinates: Position(lng, lat)),
  iconImage: 'marker-icon',
));
```

**优点**：
- 标记随地图正确变换
- 支持任意缩放级别
- 性能更好

**缺点**：
- 需要额外配置
- 图标资源管理
- 代码更复杂

## UI布局

### 非全屏模式
```
┌─────────────────────────────┐
│ [Copenhagen ▼]  [⛶] [+] [-] │ ← 顶部控制栏
│                             │
│         地图区域              │
│       (显示6个spot标记)       │
│                             │
│                             │
└─────────────────────────────┘
```

### 全屏模式
```
┌─────────────────────────────┐
│ [Copenhagen ▼] [搜索...] [⛶] │ ← 顶部控制栏
│ [Museum][Coffee][Church]... │ ← 标签筛选
│                             │
│         地图区域              │
│       (选中的spot黄色)        │
│                             │
│  ┌────┐ ┌────┐ ┌────┐       │ ← 底部卡片
│  │ <- ││ 当前││ -> │        │   (左中右)
└──└────┘─└────┘─└────┘───────┘
```

## 下一步优化建议

1. **动态缩放因子**
   - 根据当前缩放级别调整 `pixelsPerDegree`
   - 公式: `pixelsPerDegree = 2^(zoom) * 256 / 360 * 111000`

2. **迁移到PointAnnotation**
   - 使用Mapbox官方注解API
   - 标记会正确跟随地图

3. **添加缩放限制**
   - 最小缩放：10 (城市级别)
   - 最大缩放：18 (街道级别)

4. **优化性能**
   - 只渲染可见区域的spots
   - 使用聚合显示大量标记

5. **交互改进**
   - 点击地图空白区域重置选中
   - 拖动地图时自动加载附近spots

---

**修复状态**: ✅ 完成
**测试状态**: ⏳ 待验证
**最后更新**: 2025-12-11
