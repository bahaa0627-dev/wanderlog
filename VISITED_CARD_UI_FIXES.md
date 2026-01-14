# Visited 卡片 UI 修复

## 修改内容

### 1. Visited 页面去掉图片

**修改文件**: `wanderlog_app/lib/features/trips/presentation/pages/myland/spots_tab.dart`

**修改位置**: `_VisitedSpotCard` 的 `build` 方法

**修改内容**:
- 移除了 check-in 区域右侧的图片显示
- 现在只显示：📔 emoji + 笔记 + 日期 + 评分星星
- 图片数据仍然保存在后端，只是不在卡片上显示

**修改前**:
```dart
// Right: 4:3 vertical image placeholder
const SizedBox(width: 8),
SizedBox(
  width: 60,
  height: 80,
  child: entry.userPhotos.isNotEmpty ? ... : ...,
),
```

**修改后**:
```dart
// 完全移除了图片显示部分
```

### 2. 封面图左下角改为直角

**修改文件**: 
- `wanderlog_app/lib/features/trips/presentation/widgets/myland/spot_card.dart`
- `wanderlog_app/lib/features/trips/presentation/pages/myland/spots_tab.dart`

**修改内容**:
- 将封面图的 `borderRadius` 从 `BorderRadius.horizontal(left: ...)` 改为 `BorderRadius.only(...)`
- 左上角保持圆角：`topLeft: Radius.circular(AppTheme.radiusMedium - 2)`
- 左下角改为直角：`bottomLeft: Radius.zero`

**修改前**:
```dart
ClipRRect(
  borderRadius: const BorderRadius.horizontal(
    left: Radius.circular(AppTheme.radiusMedium - 2),
  ),
  child: ...
)
```

**修改后**:
```dart
ClipRRect(
  borderRadius: const BorderRadius.only(
    topLeft: Radius.circular(AppTheme.radiusMedium - 2),
    bottomLeft: Radius.zero, // Sharp corner at bottom-left
  ),
  child: ...
)
```

### 3. 标签限制为最多 2 个

**修改文件**: `wanderlog_app/lib/features/trips/presentation/pages/myland/spots_tab.dart`

**修改位置**: `_VisitedSpotCard` 的 `_buildFittingTags` 方法

**修改内容**:
- 将标签数量限制从 3 个改为 2 个
- 标签超出宽度时会自动隐藏，不会 overflow

**修改前**:
```dart
// Measure and add tags that fit
for (int i = 0; i < tags.length && fittingTags.length < 3; i++) {
```

**修改后**:
```dart
// Measure and add tags that fit (max 2)
for (int i = 0; i < tags.length && fittingTags.length < 2; i++) {
```

**注意**: `SpotCard` 组件已经是 2 个标签的限制，无需修改。

## 视觉效果

### 修改前
- ✗ Visited 卡片右侧显示用户上传的照片
- ✗ 封面图左下角是圆角
- ✗ 标签可能显示 3 个，导致 overflow

### 修改后
- ✓ Visited 卡片只显示文字信息（笔记、日期、评分）
- ✓ 封面图左下角是直角，与卡片底部对齐
- ✓ 标签最多显示 2 个，超出宽度自动隐藏

## 技术细节

### 标签显示逻辑

标签显示使用 `LayoutBuilder` 动态计算可用宽度：

1. 遍历标签列表
2. 使用 `TextPainter` 测量每个标签的宽度
3. 累加宽度，如果超出可用宽度则停止添加
4. 最多显示 2 个标签

```dart
Widget _buildFittingTags(BuildContext context, List<String> tags, double maxWidth) {
  final List<Widget> fittingTags = [];
  double usedWidth = 0;
  const double spacing = 6;
  const double horizontalPadding = 8 * 2;
  const double borderWidth = 2;
  
  for (int i = 0; i < tags.length && fittingTags.length < 2; i++) {
    final tag = tags[i];
    final textPainter = TextPainter(
      text: TextSpan(text: tag, style: ...),
      maxLines: 1,
      textDirection: TextDirection.ltr,
    )..layout();
    
    final tagWidth = textPainter.width + horizontalPadding + borderWidth;
    final neededWidth = usedWidth + tagWidth + (fittingTags.isNotEmpty ? spacing : 0);
    
    if (neededWidth <= maxWidth) {
      fittingTags.add(...);
      usedWidth = neededWidth;
    }
  }
  
  return Row(children: fittingTags);
}
```

### 圆角处理

使用 `BorderRadius.only` 可以精确控制每个角的圆角：

```dart
BorderRadius.only(
  topLeft: Radius.circular(12),    // 左上角圆角
  topRight: Radius.zero,           // 右上角直角
  bottomLeft: Radius.zero,         // 左下角直角
  bottomRight: Radius.circular(12), // 右下角圆角
)
```

在我们的场景中：
- 左上角：圆角（与卡片顶部对齐）
- 左下角：直角（与卡片底部对齐）
- 右侧：不需要设置（被内容覆盖）

## 测试建议

### 测试 1: Visited 卡片不显示图片

1. 打开 VAGO 页面
2. 切换到 "Visited" 标签
3. 查看已签到的地点卡片
4. **预期结果**: 
   - 卡片下方只显示 📔 emoji + 笔记 + 日期 + 评分
   - 不显示用户上传的照片

### 测试 2: 封面图左下角是直角

1. 查看任意地点卡片
2. 观察封面图的左下角
3. **预期结果**:
   - 左上角是圆角
   - 左下角是直角（90度）
   - 与卡片底部边缘对齐

### 测试 3: 标签最多显示 2 个

1. 查看有多个标签的地点卡片
2. 观察标签显示
3. **预期结果**:
   - 最多显示 2 个标签
   - 标签不会 overflow
   - 如果宽度不够，第 2 个标签会被隐藏

### 测试 4: 不同屏幕尺寸

1. 在不同设备上测试（iPhone SE, iPhone 14 Pro Max, iPad）
2. 观察标签显示
3. **预期结果**:
   - 小屏幕：可能只显示 1 个标签
   - 大屏幕：显示 2 个标签
   - 不会出现 overflow 错误

## 相关文件

- `wanderlog_app/lib/features/trips/presentation/pages/myland/spots_tab.dart` - Visited 卡片实现
- `wanderlog_app/lib/features/trips/presentation/widgets/myland/spot_card.dart` - 普通地点卡片实现
- `wanderlog_app/lib/core/theme/app_theme.dart` - 主题配置（圆角、边框等）

## 注意事项

1. **图片数据保留**: 虽然 Visited 卡片不显示图片，但图片数据仍然保存在后端，可以在详情页查看
2. **标签优先级**: 使用 `displayTagsEn` 字段（后端计算好的展示标签），回退到 `category + tags`
3. **性能优化**: 使用 `TextPainter` 测量标签宽度，避免 overflow 错误
4. **一致性**: 所有卡片（SpotCard, _VisitedSpotCard）都使用相同的圆角和标签逻辑
