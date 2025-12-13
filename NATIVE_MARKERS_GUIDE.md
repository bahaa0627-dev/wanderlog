# 使用 Mapbox 原生标记避免卡顿和漂移

## 问题分析

当前实现使用 `Stack + Positioned` 在 Flutter 层覆盖标记，导致：
1. **卡顿**: Flutter 渲染层和原生地图层不同步
2. **漂移**: 快速滑动时标记位置滞后
3. **性能差**: 大量标记时 FPS 下降

## 解决方案：使用 Mapbox PointAnnotation API

### 第一步：添加 PointAnnotationManager

在 `_MapPageState` 类中添加：

```dart
class _MapPageState extends ConsumerState<MapPage> {
  MapboxMap? _mapboxMap;
  PointAnnotationManager? _pointAnnotationManager;  // 新增
  
  // ... 其他变量
}
```

### 第二步：初始化 PointAnnotationManager

在 `onMapCreated` 中：

```dart
onMapCreated: (mapboxMap) async {
  _mapboxMap = mapboxMap;
  
  // 创建 PointAnnotationManager
  _pointAnnotationManager = await mapboxMap.annotations.createPointAnnotationManager();
  
  // 延迟启用手势和添加标记
  Future.delayed(const Duration(milliseconds: 500), () {
    _enableMapGestures();
    _addNativeMarkers();  // 添加原生标记
  });
  
  final center = _currentMapCenter ?? _cityCoordinates[_selectedCity]!;
  _animateCamera(center, zoom: _currentZoom);
},
```

### 第三步：创建原生标记方法

```dart
/// 添加原生标记，使用 Mapbox 的 PointAnnotation API
Future<void> _addNativeMarkers() async {
  final manager = _pointAnnotationManager;
  if (manager == null) {
    print('❌ PointAnnotationManager 未初始化');
    return;
  }

  try {
    print('📍 开始添加原生标记...');
    
    final spots = _filteredSpots;
    final annotations = <PointAnnotationOptions>[];

    for (final spot in spots) {
      final annotation = PointAnnotationOptions(
        geometry: Point(
          coordinates: Position(spot.longitude, spot.latitude),
        ),
        // 文字标签
        textField: spot.name,
        textSize: 12.0,
        textColor: Colors.black.value,
        textHaloColor: Colors.white.value,
        textHaloWidth: 2.0,
        textOffset: [0.0, -2.0],  // 文字向上偏移
        
        // 图标（可选，使用自定义图标）
        iconSize: 1.0,
        iconImage: 'custom-marker',  // 需要先添加到地图
      );
      annotations.add(annotation);
    }

    // 批量添加所有标记（高性能）
    await manager.createMulti(annotations);
    print('✅ 已添加 ${annotations.length} 个原生标记');
    
    // 设置点击监听
    manager.addOnPointAnnotationClickListener(
      OnPointAnnotationClickListener(onPointAnnotationClick: (annotation) {
        print('👆 点击了标记: ${annotation.id}');
        _handleMarkerTap(annotation);
      }),
    );
  } catch (e) {
    print('❌ 添加原生标记失败: $e');
  }
}

/// 处理标记点击
void _handleMarkerTap(PointAnnotation annotation) {
  // 根据 annotation 的坐标找到对应的 spot
  final tappedSpot = _filteredSpots.firstWhere(
    (spot) => 
      spot.latitude == annotation.geometry.coordinates.lat &&
      spot.longitude == annotation.geometry.coordinates.lng,
    orElse: () => _filteredSpots.first,
  );
  
  _handleSpotTap(tappedSpot);
}
```

### 第四步：移除 Stack 中的旧标记

将原来的：

```dart
return Stack(
  children: [
    MapWidget(...),
    ..._buildSpotMarkers(width, height),  // ❌ 删除这行
  ],
);
```

改为：

```dart
return MapWidget(
  // ... 地图配置
);
```

### 第五步：更新标记（可选）

当筛选条件改变时，更新标记：

```dart
Future<void> _updateNativeMarkers() async {
  final manager = _pointAnnotationManager;
  if (manager == null) return;
  
  // 删除所有旧标记
  await manager.deleteAll();
  
  // 重新添加
  await _addNativeMarkers();
}
```

在需要更新的地方调用（例如切换城市、更改标签筛选）：

```dart
void _changeCity(String newCity) {
  setState(() {
    _selectedCity = newCity;
    _selectedSpot = null;
  });
  _animateCamera(_cityCoordinates[newCity]!);
  _updateNativeMarkers();  // 更新标记
}
```

## 使用自定义图标（高级）

### 1. 添加自定义图标到地图

```dart
Future<void> _addCustomMarkerImage() async {
  final map = _mapboxMap;
  if (map == null) return;
  
  // 从 Flutter 生成图标
  final ByteData bytes = await rootBundle.load('assets/icons/marker.png');
  final Uint8List imageData = bytes.buffer.asUint8List();
  
  await map.style.addStyleImage(
    'custom-marker',
    MbxImage(
      width: 48,
      height: 48,
      data: imageData,
    ),
  );
}
```

### 2. 动态生成标记图标（带文字）

```dart
Future<Uint8List> _createMarkerImageWithText(String text, bool isSelected) async {
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  const size = 120.0;
  
  // 绘制背景
  final bgPaint = Paint()
    ..color = isSelected ? AppTheme.primaryYellow : Colors.white
    ..style = PaintingStyle.fill;
  
  final borderPaint = Paint()
    ..color = AppTheme.black
    ..style = PaintingStyle.stroke
    ..strokeWidth = 2.0;
  
  // 绘制圆角矩形
  final rrect = RRect.fromRectAndRadius(
    Rect.fromLTWH(0, 0, size, 40),
    const Radius.circular(20),
  );
  
  canvas.drawRRect(rrect, bgPaint);
  canvas.drawRRect(rrect, borderPaint);
  
  // 绘制文字
  final textPainter = TextPainter(
    text: TextSpan(
      text: text,
      style: const TextStyle(
        color: Colors.black,
        fontSize: 14,
        fontWeight: FontWeight.bold,
      ),
    ),
    textDirection: TextDirection.ltr,
  );
  
  textPainter.layout();
  textPainter.paint(
    canvas,
    Offset((size - textPainter.width) / 2, (40 - textPainter.height) / 2),
  );
  
  // 转换为图片
  final picture = recorder.endRecording();
  final image = await picture.toImage(size.toInt(), 40);
  final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
  
  return byteData!.buffer.asUint8List();
}
```

## 性能优化建议

### 1. 聚合标记（Clustering）

当标记超过 100 个时，使用聚合：

```dart
// 创建 CircleAnnotationManager 用于聚合
final circleManager = await mapboxMap.annotations.createCircleAnnotationManager();

// 根据 zoom 级别决定是否显示聚合
if (_currentZoom < 12) {
  _showClusteredMarkers(circleManager);
} else {
  _showIndividualMarkers(_pointAnnotationManager);
}
```

### 2. 视口剪裁

只显示当前视野内的标记：

```dart
Future<void> _addVisibleMarkers() async {
  final bounds = await _mapboxMap?.visibleCoordinateBounds;
  if (bounds == null) return;
  
  final visibleSpots = _filteredSpots.where((spot) {
    return spot.latitude >= bounds.southwest.coordinates.lat &&
           spot.latitude <= bounds.northeast.coordinates.lat &&
           spot.longitude >= bounds.southwest.coordinates.lng &&
           spot.longitude <= bounds.northeast.coordinates.lng;
  }).toList();
  
  // 只为可见的 spots 创建标记
  // ...
}
```

### 3. 缓存图标

```dart
final Map<String, MbxImage> _iconCache = {};

Future<MbxImage> _getOrCreateIcon(String key, Function() generate) async {
  if (_iconCache.containsKey(key)) {
    return _iconCache[key]!;
  }
  
  final icon = await generate();
  _iconCache[key] = icon;
  return icon;
}
```

## 完整对比

### ❌ 旧方案（Flutter Widget）

```dart
List<Widget> _buildSpotMarkers(double width, double height) {
  // 手动计算屏幕坐标
  final dx = (spot.longitude - mapCenter.lng) * pixelsPerDegree;
  final dy = -(spot.latitude - mapCenter.lat) * pixelsPerDegree;
  
  return [
    Positioned(  // ❌ 会漂移
      left: left - 60,
      top: top - 28,
      child: GestureDetector(...),
    ),
  ];
}
```

**问题**：
- 需要手动计算坐标转换
- 渲染层分离导致不同步
- 地图移动/缩放时需要重新计算和渲染

### ✅ 新方案（原生 Annotation）

```dart
Future<void> _addNativeMarkers() async {
  final annotations = spots.map((spot) => 
    PointAnnotationOptions(
      geometry: Point(
        coordinates: Position(spot.longitude, spot.latitude),
      ),
      textField: spot.name,
    )
  ).toList();
  
  await _pointAnnotationManager?.createMulti(annotations);
}
```

**优势**：
- ✅ 原生渲染，丝般顺滑
- ✅ 自动跟随地图缩放/移动
- ✅ 无需手动计算坐标
- ✅ 支持大量标记（1000+）

## 下一步

1. 在 `map_page_new.dart` 中实现上述方案
2. 在 `album_spots_map_page.dart` 中应用相同的改造
3. 测试双指缩放和快速滑动，确认标记不再漂移
4. 根据需要添加自定义图标和样式

## 参考文档

- Mapbox Annotations API: https://docs.mapbox.com/android/maps/guides/annotations/
- Flutter Mapbox GL: https://pub.dev/packages/mapbox_maps_flutter
