# 相册地点地图页面功能实现

## 功能概述

实现了点击首页相册（Album）卡片后进入对应城市的地点列表地图页面。

## 实现的功能

### 1. 全屏地图展示 ✅
- 使用 Mapbox 地图铺满整个页面
- 支持地图放大缩小操作
- 自动计算并展示城市中心点
- 根据地点数量自动调整初始缩放级别

### 2. 地点标记显示 ✅
- 在地图上显示该城市所有地点的标记
- 标记样式：带黑边的白色/黄色气泡，包含图标和地点名称
- 选中的地点标记显示为黄色背景，其他为白色
- 点击标记可切换到对应的地点卡片

### 3. 底部地点卡片滑动 ✅
- 横向可滑动的地点卡片列表
- 卡片样式与 map 页面保持一致：
  - 封面图片
  - 标签（最多显示 2 个）
  - 地点名称（最多 2 行）
  - 星级评分和评论数
- 支持循环按顺序滑动所有地点
- 卡片滑动时地图自动移动到对应地点

### 4. 交互联动 ✅
- 滑动卡片时，地图中心移动到选中的地点
- 点击地图标记时，卡片列表自动切换到对应地点
- 点击卡片显示地点详情弹窗（使用现有的 SpotDetailModal）

### 5. 顶部导航栏 ✅
- 返回按钮
- 显示相册标题
- 显示城市名称和地点数量

## 文件结构

```
wanderlog_app/lib/features/map/presentation/pages/
├── album_spots_map_page.dart  # 新增：相册地点地图页面
├── map_page_new.dart          # 现有：主地图页面（引用 Spot 和 SpotDetailModal）
```

## 使用方式

### 从首页跳转

```dart
// 在 home_page.dart 中
Navigator.of(context).push(
  MaterialPageRoute(
    builder: (context) => AlbumSpotsMapPage(
      city: 'Copenhagen',           // 城市名称
      albumTitle: '3 day in copenhagen',  // 相册标题
    ),
  ),
);
```

### 页面参数

- `city`: 城市名称（如 "Copenhagen", "Porto", "Paris" 等）
- `albumTitle`: 相册标题（显示在顶部导航栏）

## 技术实现细节

### 1. 地图组件
```dart
MapWidget(
  cameraOptions: CameraOptions(
    center: Point(coordinates: cityCenter),
    zoom: initialZoom,
  ),
  onMapCreated: _onMapCreated,
)
```

### 2. 卡片滑动监听
```dart
_cardPageController.addListener(() {
  final page = _cardPageController.page?.round();
  if (page != null && page != _currentCardIndex) {
    setState(() {
      _currentCardIndex = page;
      _selectedSpot = _citySpots[page];
    });
    _animateCamera(selectedSpotPosition);
  }
});
```

### 3. 地图与卡片联动
- 卡片滑动 → 更新 `_selectedSpot` → 地图移动到新位置
- 点击地图标记 → 调用 `_cardPageController.animateToPage(index)` → 卡片切换

### 4. 标记渲染
使用 `Stack` + `Positioned` 在地图上叠加标记组件：
```dart
LayoutBuilder(
  builder: (context, constraints) {
    return Stack(
      children: _buildSpotMarkers(
        constraints.maxWidth,
        constraints.maxHeight,
      ),
    );
  },
)
```

## 数据来源

当前使用 mock 数据（在 `_buildMockSpots()` 方法中）。支持以下城市：
- Copenhagen（5 个地点）
- Porto（1 个地点）
- Paris（1 个地点）
- Tokyo（1 个地点）
- Barcelona（1 个地点）
- Amsterdam（1 个地点）

### 未来优化

可以通过以下方式替换为真实数据：
1. 从 API 获取：通过 `spotProvider` 根据城市筛选
2. 从现有 map_page_new.dart 的 mock 数据中提取

## 已知限制

1. **坐标转换**：当前地点标记使用简化的线性映射计算屏幕坐标，实际应使用 Mapbox 的 `pointForCoordinate` API
2. **数据来源**：使用 mock 数据，需要连接真实 API
3. **地图样式**：使用默认 Mapbox 样式，可以自定义地图主题

## 样式规范

### 卡片尺寸
- 高度：260px
- 图片高度：135px
- ViewportFraction：0.85（卡片间距效果）

### 标记样式
- 背景色：选中为 `AppTheme.primaryYellow`，未选中为白色
- 边框：黑色 2px
- 圆角：`AppTheme.radiusLarge`
- 阴影：黑色 0.2 透明度，8px 模糊

### 顶部导航栏
- 背景：白色渐变（从 95% 透明到完全透明）
- 高度：自适应（包含安全区域）

## 测试建议

1. 测试不同城市的地点展示
2. 测试地图缩放功能
3. 测试卡片滑动与地图联动
4. 测试点击地图标记切换卡片
5. 测试点击卡片显示详情弹窗
6. 测试返回按钮导航

## 下一步优化

1. **集成真实数据**
   - 连接 spots provider
   - 根据城市筛选地点
   
2. **坐标转换优化**
   - 使用 Mapbox 的坐标转换 API
   - 支持地图移动时动态更新标记位置

3. **性能优化**
   - 大量地点时使用聚合标记
   - 图片懒加载
   - 卡片预加载

4. **功能增强**
   - 添加地点搜索功能
   - 支持标签筛选
   - 支持路线规划
   - 添加收藏功能

5. **动画优化**
   - 地图移动动画更平滑
   - 标记切换动画
   - 卡片切换动画
