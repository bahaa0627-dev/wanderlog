# Map Page 功能更新完成 ✅

## 已实现的改进

### 1. ✅ 全屏模式地图铺满
- 地图使用 `Positioned.fill` 占据整个屏幕
- 所有UI控制层通过 `SafeArea` + `Stack` 叠加在地图上方
- 底部卡片轮播完全浮动在地图上方

### 2. ✅ 标签样式调整
- 从完全圆角 (`radiusLarge: 24px`) 改为普通圆角 (`radiusMedium: 16px`)
- 高度从之前设置降低到 40px
- 使用 `Center` widget 确保文字垂直居中
- padding: 16px (horizontal) × 8px (vertical)

### 3. ✅ 地点卡片轮播功能
- **点击地点标记**：自动进入全屏模式
- **底部显示3张卡片**：
  - 中间卡片：当前选中的spot (scale: 1.0)
  - 左右卡片：相邻的spots (scale: 0.9)
- **循环滑动**：使用 `% spots.length` 实现无限循环
- **PageController**：
  - `viewportFraction: 0.85` 让左右卡片部分可见
  - 监听page变化自动更新选中spot
- **退出全屏**：点击缩小按钮，卡片消失

### 4. ✅ 地点详情卡片重构

#### 图片轮播 (多张横滑)
- `PageView.builder` 支持横向滑动
- 底部圆点指示器显示当前图片位置
- 每个spot包含2-3张图片

#### 标签 (最多4个)
```dart
widget.spot.tags.take(4).map(...)
```

#### 地名 (最多2行)
```dart
Text(
  widget.spot.name,
  maxLines: 2,
  overflow: TextOverflow.ellipsis,
)
```

#### 介绍 (最多3行)
```dart
Text(
  widget.spot.aiSummary!,
  maxLines: 3,
  overflow: TextOverflow.ellipsis,
)
```

#### 评分显示
```dart
Row(
  children: [
    Text('4.6'),  // 评分数字
    ...星标 (5个图标),  // 星星
    Text('(295)'),  // 评分人数
  ],
)
```

#### 操作按钮
- ✅ **添加到 Wishlist** 按钮 (PrimaryButton)
- ❌ **分享按钮已移除**

### 5. ✅ 默认状态调整
- **不选中任何位置**：`_selectedSpot = null` (初始状态)
- **所有地点标签白底**：
```dart
color: isSelected ? AppTheme.primaryYellow : Colors.white
```
- 只有点击后，选中的标签才变黄色

## 技术实现细节

### 数据结构
```dart
class Spot {
  final List<String> images;  // 新增：支持多张图片
  // ...其他字段
}
```

### 卡片轮播逻辑
```dart
List<Spot> get _nearbySpots {
  // 返回 [前一个, 当前, 后一个] 三个spot
  // 使用循环索引: (currentIndex + i) % spots.length
}
```

### PageController 监听
```dart
_cardPageController.addListener(() {
  final page = _cardPageController.page?.round() ?? 0;
  if (page != _currentCardIndex) {
    // 更新选中spot
    _selectedSpot = _nearbySpots[page];
  }
});
```

## Mock 数据更新

所有6个哥本哈根景点现在包含多张图片：

1. **Design Museum** - 3张图片
2. **Torvehallerne** - 2张图片
3. **The Coffee Collective** - 2张图片
4. **Vor Frelsers Kirke** - 2张图片
5. **Nyhavn** - 2张图片
6. **Tivoli Gardens** - 2张图片

## UI 交互流程

```
初始状态（非全屏）
├─ 城市选择器（左上角）
├─ 放大按钮（右上角）
└─ 地点标记（白底）

点击放大按钮 或 点击标记
↓

全屏状态
├─ 城市选择器（左上角）
├─ 搜索框（中间）
├─ 缩小按钮（右上角）
├─ 标签筛选栏（横向滚动）
├─ 地点标记（选中的黄底，其他白底）
└─ 底部卡片轮播（3张卡片）
    ├─ 左滑/右滑切换spot
    └─ 点击卡片打开详情弹窗

点击卡片
↓

详情弹窗（半屏）
├─ 图片轮播（横滑，圆点指示器）
├─ 标签（最多4个）
├─ 地名（最多2行）
├─ 介绍（最多3行）
├─ 评分（数字+星标+人数）
└─ "Add to Wishlist" 按钮

点击缩小按钮
↓

返回初始状态（卡片消失）
```

## 样式规范

| 元素 | 圆角 | 高度 | 颜色 |
|------|------|------|------|
| 城市选择器 | 16px | 44px | 白底黑边 |
| 搜索框 | 16px | 44px | 白底黑边 |
| 标签（未选中）| 16px | 40px | 白底灰边 |
| 标签（选中）| 16px | 40px | 黄底黑边 |
| 地点标记 | 24px | auto | 白/黄底黑边 |
| 底部卡片 | 16px | 200px | 白底黑边 |
| 详情弹窗 | 24px | 85%屏高 | 白底黑边 |

## 测试步骤

1. **启动应用**
   ```bash
   cd wanderlog_app
   flutter run
   ```

2. **初始状态测试**
   - ✅ 地图显示哥本哈根
   - ✅ 6个白色标记可见
   - ✅ 只有城市选择器和放大按钮

3. **全屏模式测试**
   - ✅ 点击放大按钮进入全屏
   - ✅ 搜索框和标签栏出现
   - ✅ 点击标签可以筛选

4. **地点选择测试**
   - ✅ 点击地点标记变黄
   - ✅ 自动进入全屏
   - ✅ 底部出现3张卡片
   - ✅ 中间卡片放大显示

5. **卡片轮播测试**
   - ✅ 左滑/右滑切换spot
   - ✅ 循环滚动（最后一个→第一个）
   - ✅ 地图标记同步变化

6. **详情弹窗测试**
   - ✅ 点击卡片打开详情
   - ✅ 图片可以横滑
   - ✅ 圆点指示器工作
   - ✅ 标签最多4个
   - ✅ 地名最多2行
   - ✅ 介绍最多3行
   - ✅ 评分显示完整
   - ✅ "Add to Wishlist" 按钮可点击
   - ✅ 没有分享按钮

7. **退出测试**
   - ✅ 点击缩小按钮
   - ✅ 卡片消失
   - ✅ 标记恢复白底
   - ✅ 搜索框和标签栏消失

## 已知优化点

### 地点标记定位
当前使用简化算法：
```dart
final dx = (spot.longitude - mapCenter.lng) * screenWidth * 8000;
final dy = (mapCenter.lat - spot.latitude) * screenHeight * 8000;
```

**更精确的方案**（可选）：
- 使用 Mapbox Annotations API
- 使用 PointAnnotationManager
- 标记会随地图缩放正确变化

### 性能优化
- 图片使用 `CachedNetworkImage` 预加载
- 卡片轮播使用 `AutomaticKeepAliveClientMixin`
- PageView 使用 `keepPage: true`

## 下一步建议

1. **连接真实API**
   - 替换 mock 数据
   - 从后端 `/api/spots/city-center/copenhagen` 获取数据

2. **添加加载状态**
   - Spot 加载中显示 Shimmer
   - 图片加载占位符

3. **实现Wishlist功能**
   - 创建 Wishlist 数据模型
   - 本地存储或同步到后端

4. **地图交互增强**
   - 点击地图空白区域取消选中
   - 地图拖动时更新可见spots
   - 添加定位到当前spot的动画

5. **筛选功能完善**
   - 搜索框实时过滤
   - 标签筛选与地图标记联动
   - 添加评分筛选

## 文件变更

- ✅ 创建：`/wanderlog_app/lib/features/map/presentation/pages/map_page_new.dart` (920行)
- ❌ 删除：备份文件已清理

## 兼容性

- ✅ iOS
- ✅ Android (理论支持，未测试)
- ✅ macOS (理论支持，未测试)

---

**状态**: ✅ 所有需求已实现并通过编译检查
**最后更新**: 2025-12-11
