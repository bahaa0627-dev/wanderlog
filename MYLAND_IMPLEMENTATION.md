# MyLand 页面实现文档

## 📋 概述

MyLand 是 Wanderlog 应用的核心功能页面之一，用于管理用户收藏的地点和合集。

## 🏗️ 页面结构

### 1. 主页面 (`my_land_screen.dart`)
- 位置：`lib/features/trips/presentation/pages/my_land_screen.dart`
- 功能：包含两个顶部 Tab
  - **Spots**: 我收藏的地点
  - **Collections**: 我收藏的合集（与 trip 的城市相关）

### 2. Spots Tab (`myland/spots_tab.dart`)
- 位置：`lib/features/trips/presentation/pages/myland/spots_tab.dart`
- 功能：展示用户收藏的地点，分为四个子分类
  - **All**: 全部地点
  - **MustGo**: 必去地点（必须收藏才能标记）
  - **Today's Plan**: 今日计划（必须收藏才能添加）
  - **Visited**: 已访问地点（打卡后自动添加）
- 特点：
  - All 和 Visited 默认列表视图
  - MustGo 和 Today's Plan 默认地图视图
  - 支持视图切换（列表 ⇄ 地图）
  - 如果 Today's Plan 有数据，默认进入该 tab

### 3. Collections Tab (`myland/collections_tab.dart`)
- 位置：`lib/features/trips/presentation/pages/myland/collections_tab.dart`
- 功能：展示用户收藏的合集（类似相册）
- 展示内容：城市、地点数量、封面图、标签

## 🎨 UI 组件

### 1. SpotCard (`widgets/myland/spot_card.dart`)
地点卡片组件，包含以下信息：
- 📷 封面图
- ⭐ 星标按钮（右上角）
- 📍 地名
- ⭐ 评分和评分人数
- 🕐 今日营业时间状态（Open now / Closed）
- 🎫 门票价格（如需门票）
- 🏷️ 标签（最多显示 3 个）
- ✅ Check-in 按钮

### 2. CheckInDialog (`widgets/myland/check_in_dialog.dart`)
打卡对话框组件，支持以下功能：
- 📅 选择访问日期
- ⏰ 选择访问时间
- ⭐ 星级评分（1-5 星，必填）
- 💭 心情笔记（可选）
- 📸 上传照片（Premium 功能）

**必填字段**：
- 访问日期和时间
- 星级评分

**交互逻辑**：
- 点击 Check-in 后，自动跳转到 Visited tab
- 评分标签：1⭐=Not good, 2⭐=Ok, 3⭐=Good, 4⭐=Great, 5⭐=Amazing!

## 🛣️ 路由配置

路由已在 `core/utils/app_router.dart` 中配置：
```dart
GoRoute(
  path: '/myland',
  name: 'myland',
  pageBuilder: (context, state) => _slideFromRight(const MyLandScreen()),
),
```

底部导航已更新：
- Home → `/home`
- **MyLand** → `/myland` ✨ (新)
- Profile → (待实现)

## 📝 待实现功能

### 高优先级
1. **数据集成**
   - [ ] 连接后端 API 获取用户收藏的地点
   - [ ] 实现 TripSpot 模型的 MustGo, Today's Plan, Visited 状态管理
   - [ ] 实现 Check-in 数据保存到后端

2. **地图视图**
   - [ ] 实现 Spots Tab 的地图视图展示
   - [ ] 集成 Mapbox 显示地点标记
   - [ ] 支持地图上点击地点查看详情

3. **状态管理**
   - [ ] 星标功能（收藏/取消收藏）
   - [ ] MustGo 标记切换
   - [ ] Today's Plan 添加/移除
   - [ ] Visited 状态管理

### 中优先级
4. **营业时间**
   - [ ] 根据实际 opening hours 数据计算营业状态
   - [ ] 显示营业时间段（如 "9:00 AM - 5:00 PM"）

5. **门票价格**
   - [ ] 从 Google Places API 获取实际门票价格
   - [ ] 显示成人票价格

6. **照片上传**
   - [ ] 实现 Check-in 时的照片上传功能
   - [ ] 图片存储和管理

### 低优先级
7. **UI 优化**
   - [ ] 添加加载状态动画
   - [ ] 优化空状态展示
   - [ ] 添加下拉刷新

8. **搜索和筛选**
   - [ ] 在 All tab 中添加搜索功能
   - [ ] 按城市、分类筛选

## 🎯 设计特点

### Neo-Brutalism 风格
- ⚫ 粗黑边框 (`AppTheme.borderMedium`)
- 🟨 黄色主色调 (`AppTheme.primaryYellow`)
- ▭ 圆角设计 (`AppTheme.radiusMedium`)
- ⬛ 阴影效果 (`AppTheme.cardShadow`)

### 用户体验
- 🎯 默认视图根据内容智能选择（列表 vs 地图）
- 📊 显示数量统计，让用户了解内容概况
- ✨ 打卡后自动跳转，减少操作步骤
- 📝 表单验证，确保必填信息完整

## 📂 文件结构

```
lib/features/trips/presentation/
├── pages/
│   ├── my_land_screen.dart           # 主页面
│   └── myland/
│       ├── spots_tab.dart            # Spots Tab
│       └── collections_tab.dart      # Collections Tab
└── widgets/
    └── myland/
        ├── spot_card.dart            # 地点卡片组件
        └── check_in_dialog.dart      # 打卡对话框组件
```

## 🔄 数据流

```
User Action → UI Component → Provider/Controller → API Service → Backend
                ↓
            Local State Update
                ↓
            UI Re-render
```

## 📱 测试建议

1. **UI 测试**
   - 测试不同数量的地点展示（0, 1, 多个）
   - 测试视图切换（列表 ⇄ 地图）
   - 测试 Tab 切换

2. **功能测试**
   - 测试 Check-in 流程
   - 测试日期时间选择器
   - 测试星级评分

3. **边界测试**
   - 长地名显示
   - 多标签显示
   - 网络错误处理

## 🚀 快速开始

1. 启动应用后，点击底部导航的 "MyLand"
2. 当前显示空状态（因为还未连接数据源）
3. 可以通过修改 `spots_tab.dart` 中的 `_mockSpots` 添加测试数据

## 📌 注意事项

⚠️ **当前限制**：
- 所有数据都是 mock 数据
- 地图视图尚未实现
- Check-in 数据未保存到后端
- Spot 模型的扩展属性（isMustGo, isTodaysPlan, isVisited）需要通过 TripSpot 来管理

## 🎨 原型图参考

参考 Figma 原型图中的 MyLand 页面设计：
- No data 状态
- Have data: All 视图
- MustGo 地图视图
- Today's plan 地图视图
- Visited 列表视图
- Collection Tab
- Check-in 弹窗
- Spot Bottomsheet (收藏更多操作)

---

**创建日期**: 2025-12-15
**状态**: ✅ 基础框架已完成，待数据集成
