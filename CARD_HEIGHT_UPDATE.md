# VAGO 地点卡片高度调整

## 修改内容

将 VAGO 页面所有地点卡片的封面图区域高度从 **180** 调整为 **160**。

## 修改的文件

### 1. SpotCard (All/MustGo/Today's Plan 页面)

**文件**: `wanderlog_app/lib/features/trips/presentation/widgets/myland/spot_card.dart`

**修改**:
```dart
// 修改前
height: 180, // Fixed card height

// 修改后
height: 160, // Fixed card height (changed from 180 to 160)
```

### 2. _VisitedSpotCard (Visited 页面)

**文件**: `wanderlog_app/lib/features/trips/presentation/pages/myland/spots_tab.dart`

**修改**:
```dart
// 修改前
// Upper section: Basic info (image + info) - fixed height 180
SizedBox(
  height: 180,
  child: Row(...)
)

// 修改后
// Upper section: Basic info (image + info) - fixed height 160
SizedBox(
  height: 160,
  child: Row(...)
)
```

## 影响范围

### 封面图区域（受影响）
- 高度：180 → 160（减少 20px）
- 宽度：110（不变）
- 封面图会按比例缩放以适应新高度

### Visit 内容区域（不受影响）
- Visited 页面的 check-in 内容区域（📔 + 笔记 + 日期 + 评分）
- 高度由内容决定，不受封面图高度影响
- 仍然显示在卡片下方，与封面图区域用分隔线分开

## 视觉效果

### 修改前
```
┌─────────────────────────┐
│  [Image]  Name          │
│   110px   Rating        │  180px
│           Tags          │
└─────────────────────────┘
```

### 修改后
```
┌─────────────────────────┐
│  [Image]  Name          │
│   110px   Rating        │  160px (减少 20px)
│           Tags          │
└─────────────────────────┘
```

### Visited 页面（有 check-in 内容）
```
┌─────────────────────────┐
│  [Image]  Name          │
│   110px   Rating        │  160px (封面图区域)
│           Tags          │
├─────────────────────────┤  分隔线
│  📔 Notes               │
│  Date + Rating          │  动态高度（Visit 内容）
└─────────────────────────┘
```

## 测试步骤

### 测试 1: All 页面卡片高度
1. 打开 VAGO → All 标签
2. 查看地点卡片
3. **预期结果**:
   - 卡片高度为 160px
   - 封面图宽度仍为 110px
   - 内容区域（名称、评分、标签）正常显示

### 测试 2: MustGo 页面卡片高度
1. 打开 VAGO → MustGo 标签
2. 查看地点卡片
3. **预期结果**:
   - 卡片高度为 160px
   - 布局正常

### 测试 3: Today's Plan 页面卡片高度
1. 打开 VAGO → Today's Plan 标签
2. 查看地点卡片
3. **预期结果**:
   - 卡片高度为 160px
   - 布局正常

### 测试 4: Visited 页面卡片高度
1. 打开 VAGO → Visited 标签
2. 查看已签到的地点卡片
3. **预期结果**:
   - 封面图区域高度为 160px
   - Visit 内容区域（📔 + 笔记 + 日期 + 评分）正常显示在下方
   - 总高度 = 160px + Visit 内容高度

### 测试 5: 不同内容长度
1. 查看有长名称的地点卡片
2. 查看有多个标签的地点卡片
3. 查看有长笔记的 Visited 卡片
4. **预期结果**:
   - 所有卡片的封面图区域高度都是 160px
   - 内容正常显示，无溢出
   - Visit 内容区域高度根据内容自适应

## 技术细节

### 封面图宽高比
- 宽度：110px（固定）
- 高度：160px（固定）
- 宽高比：110:160 ≈ 0.6875（约 11:16）

### 内容区域布局
卡片内部使用 `Row` 布局：
- 左侧：封面图（110px 宽，160px 高）
- 右侧：内容区域（`Expanded`，自动填充剩余宽度）

内容区域使用 `Column` 布局：
- `mainAxisAlignment: MainAxisAlignment.spaceBetween`
- 顶部：名称 + 评分 + 营业时间
- 底部：标签

### Visited 卡片特殊处理
使用 `Column` 包裹两个部分：
1. 封面图区域（`SizedBox(height: 160)`）
2. Visit 内容区域（高度由内容决定）

## 注意事项

1. **封面图缩放**: 封面图会按 `BoxFit.cover` 缩放，可能会裁剪部分内容
2. **内容溢出**: 如果名称太长或标签太多，可能会溢出。已有 `maxLines` 和 `overflow: TextOverflow.ellipsis` 处理
3. **一致性**: 所有页面的卡片高度现在都是 160px，保持视觉一致性
4. **响应式**: 卡片宽度由父容器决定，高度固定为 160px

## 相关文件

- `wanderlog_app/lib/features/trips/presentation/widgets/myland/spot_card.dart` - SpotCard 组件
- `wanderlog_app/lib/features/trips/presentation/pages/myland/spots_tab.dart` - _VisitedSpotCard 组件
