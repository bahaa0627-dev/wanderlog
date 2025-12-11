# Map Page 更新说明

## ✅ 已修复的问题

### 1. 地图交互优化
- **默认状态（非全屏）**：
  * 左上角：城市选择器
  * 右上角：放大按钮（全屏图标）
  * 点击地图或放大按钮：进入全屏模式

- **全屏状态**：
  * 左上角：城市选择器
  * 中间：搜索框（100%圆角）
  * 右上角：退出全屏按钮
  * 下方：标签筛选条（100%圆角）

### 2. Spot 标记显示
- 在地图上显示黄色气泡标记
- 气泡包含：分类图标 + 地点名称
- 点击标记：
  * 自动进入全屏模式
  * 底部显示 Spot 卡片（3:4 竖向）

### 3. UI 改进
- 搜索框和标签在全屏时使用完全圆角（radiusLarge）
- 标记使用黄色主题色 + 黑色边框
- 添加阴影效果让标记更突出

## 📍 Mock 数据

已添加 6 个哥本哈根景点：
1. Design Museum - 博物馆
2. Nyhavn - 景点
3. Torvehallerne - 市场
4. The Coffee Collective - 咖啡馆
5. Church of Our Saviour - 教堂
6. Tivoli Gardens - 公园

所有景点都会在地图上显示黄色标记。

## 🗺️ Mapbox 配置

如果地图显示空白，可能需要配置 Mapbox token：

### iOS 配置
在 `ios/Runner/Info.plist` 中添加：
```xml
<key>MBXAccessToken</key>
<string>YOUR_MAPBOX_PUBLIC_TOKEN</string>
```

### Android 配置
在 `android/app/src/main/res/values/strings.xml` 中添加：
```xml
<string name="mapbox_access_token">YOUR_MAPBOX_PUBLIC_TOKEN</string>
```

### 获取 Mapbox Token
1. 访问 https://account.mapbox.com/
2. 创建免费账户
3. 复制 public token
4. 粘贴到上述配置文件中

**注意**：Mapbox 有免费额度，对开发测试完全够用。

## 🎨 设计细节

### 标记样式
- 背景：亮黄色 (#FFF200)
- 边框：1px 黑色
- 圆角：24px
- 阴影：8px 模糊，黑色 20% 透明度
- 内容：图标 + 地点名称

### 搜索框（全屏时）
- 背景：白色
- 边框：1px 黑色
- 圆角：100%（完全圆角）
- 图标：搜索图标（左侧）

### 标签（全屏时）
- 选中：黄色背景 + 黑色边框
- 未选中：白色背景 + 灰色边框
- 圆角：100%（完全圆角）

## 🔧 下一步优化

如果需要更精确的地图标记位置：
1. 使用 Mapbox Annotations API
2. 或使用 CustomPaint 绘制覆盖层
3. 或集成 PointAnnotationManager

当前实现使用简单的定位计算，足够展示概念，但可能在不同缩放级别不够精确。

## 测试步骤

1. 运行应用：`flutter run`
2. 点击首页的 "Map" 标签
3. 默认显示哥本哈根地图
4. 点击地图或右上角放大按钮 → 进入全屏
5. 在全屏模式下：
   - 可以看到搜索框和标签筛选
   - 地图上有 6 个黄色标记
   - 点击标记查看详情卡片
6. 点击退出全屏按钮返回

## 💡 提示

如果在 iOS 模拟器上地图显示空白：
1. 确保配置了 Mapbox token
2. 检查网络连接
3. 查看 Console 日志是否有错误
4. 重新运行应用

标记可能需要调整位置，这取决于地图的缩放级别和视口大小。如果标记位置不准确，可以调整 `_buildSpotMarkers` 方法中的放大倍数。
