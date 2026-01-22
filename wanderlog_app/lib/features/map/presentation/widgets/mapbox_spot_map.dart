import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/core/utils/category_emoji.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart';
import 'package:wanderlog/shared/utils/opening_hours_utils.dart';

/// 共享的 Mapbox 地图组件 - 使用原生标记渲染
enum MapboxMarkerMode {
  bubble,
  checkIn,
}
///
/// 统一了 Map tab 和 Album 地图的交互逻辑
class MapboxSpotMap extends StatefulWidget {
  const MapboxSpotMap({
    required this.spots,
    required this.initialCenter,
    required this.initialZoom,
    required this.onSpotTap,
    this.selectedSpot,
    this.onMapCreated,
    this.onCameraMove,
    this.cameraPadding,
    this.visitedSpots,
    this.markerMode = MapboxMarkerMode.bubble,
    super.key,
  });

  final List<Spot> spots;
  final Position initialCenter;
  final double initialZoom;
  final Spot? selectedSpot;
  final void Function(Spot) onSpotTap;
  final VoidCallback? onMapCreated;
  final void Function(Position center, double zoom)? onCameraMove;
  final MbxEdgeInsets? cameraPadding;
  final Map<String, bool>? visitedSpots; // spotId -> isVisited
  final MapboxMarkerMode markerMode;

  @override
  State<MapboxSpotMap> createState() => MapboxSpotMapState();
}

class MapboxSpotMapState extends State<MapboxSpotMap> {
  static const double _minZoomLevel = 3.0;
  static const double _maxZoomLevel = 19.5;
  static const double _scrollZoomSensitivity = 0.0025;

  MapboxMap? _mapboxMap;
  PointAnnotationManager? _pointAnnotationManager;
  Position? _currentCenter;
  double _currentZoom = 13.0;
  final Map<String, Uint8List> _markerBitmapCache = {};
  final Map<String, PointAnnotation> _annotationsBySpotId = {};
  final Map<String, Spot> _spotByAnnotationId = {};
  Position? _pendingJumpCenter;
  double? _pendingJumpZoom;
  double? _panZoomBaseZoom;
  String? _lastSelectedSpotId;
  bool _markerClickListenerAttached = false;
  int _markerGeneration = 0;
  bool _isMapReady = false; // 地图是否已准备好
  bool _isRefreshingMarker = false; // 是否正在刷新标记
  String? _pendingSelectedId; // 待处理的选中 ID

  Position? get currentCenter => _currentCenter;
  double get currentZoom => _currentZoom;

  @override
  void initState() {
    super.initState();
    _currentCenter = widget.initialCenter;
    _currentZoom = widget.initialZoom;
  }

  @override
  void didUpdateWidget(MapboxSpotMap oldWidget) {
    super.didUpdateWidget(oldWidget);

    // 如果地图还没准备好，跳过更新
    if (!_isMapReady) {
      print('📍 [共享地图] 地图未准备好，跳过 didUpdateWidget');
      return;
    }

    // 检查 spots 列表是否真的变化了（通过比较 id 列表）
    final oldSpotIds = oldWidget.spots.map((s) => s.id).toSet();
    final newSpotIds = widget.spots.map((s) => s.id).toSet();
    final hasNewSpots = !_setsEqual(oldSpotIds, newSpotIds);
    
    final selectionChanged =
        oldWidget.selectedSpot?.id != widget.selectedSpot?.id;

    // 仅列表真正变化时重建；选中变化时只替换前后两个标记，避免闪动
    if (hasNewSpots) {
      print('📍 [共享地图] spots 列表变化，重建所有标记');
      _addNativeMarkers();
    } else if (selectionChanged) {
      print('📍 [共享地图] 选中变化: ${oldWidget.selectedSpot?.id} -> ${widget.selectedSpot?.id}');
      _refreshSelectedMarker();
    }
  }
  
  bool _setsEqual<T>(Set<T> a, Set<T> b) {
    if (a.length != b.length) return false;
    for (final item in a) {
      if (!b.contains(item)) return false;
    }
    return true;
  }

  Future<void> _enableMapGestures() async {
    final map = _mapboxMap;
    if (map == null) {
      print('❌ [共享地图] 地图实例为空，无法启用手势');
      return;
    }

    try {
      print('🔧 [共享地图] 开始启用地图手势...');

      final settings = GesturesSettings(
        scrollEnabled: true,
        pinchToZoomEnabled: true,
        rotateEnabled: false,
        simultaneousRotateAndPinchToZoomEnabled: false,
        doubleTapToZoomInEnabled: true,
        doubleTouchToZoomOutEnabled: true,
        quickZoomEnabled: true,
      );

      await map.gestures.updateSettings(settings);
      print('✅ [共享地图] 地图手势已启用！');
      print('👆 [共享地图] scrollEnabled: ${settings.scrollEnabled}');
      print('👆 [共享地图] pinchToZoomEnabled: ${settings.pinchToZoomEnabled}');
      
      // 验证设置是否生效
      final currentSettings = await map.gestures.getSettings();
      print('🔍 [共享地图] 验证手势设置 - scrollEnabled: ${currentSettings.scrollEnabled}, pinchToZoomEnabled: ${currentSettings.pinchToZoomEnabled}');
    } catch (e) {
      print('❌ [共享地图] 启用地图手势失败: $e');
    }
  }

  /// 添加原生标记
  Future<void> _addNativeMarkers() async {
    final int generation = ++_markerGeneration;

    final manager = _pointAnnotationManager;
    if (manager == null) {
      print('❌ [共享地图] PointAnnotationManager 未初始化');
      return;
    }

    try {
      print('📍 [共享地图] 开始添加原生标记...');

      // 清除旧标记
      await manager.deleteAll();
      _annotationsBySpotId.clear();
      _spotByAnnotationId.clear();

      if (generation != _markerGeneration) {
        // 有新的任务开始，放弃本次
        return;
      }

      final spots = widget.spots;
      if (spots.isEmpty) {
        print('⚠️ [共享地图] 没有地点需要标记');
        return;
      }

      final selectedId = widget.selectedSpot?.id;
      
      // 限制一次添加的标记数量，避免卡顿
      final spotsToAdd = spots.length > 50 ? spots.take(50).toList() : spots;
      print('📍 [共享地图] 将添加 ${spotsToAdd.length} 个标记（总共 ${spots.length} 个），模式: ${widget.markerMode}');

      // 先添加未选中的标记
      for (final spot in spotsToAdd.where((s) => s.id != selectedId)) {
        if (generation != _markerGeneration) return;
        try {
          print('📍 [共享地图] 添加标记: ${spot.name} at (${spot.latitude}, ${spot.longitude}), 模式: ${widget.markerMode}');
          final annotation = await _createAnnotation(spot, isSelected: false);
          _annotationsBySpotId[spot.id] = annotation;
          _spotByAnnotationId[annotation.id] = spot;
          print('✅ [共享地图] 标记添加成功: ${spot.name}, annotationId: ${annotation.id}');
        } catch (e, stack) {
          print('⚠️ [共享地图] 添加标记失败: ${spot.name} - $e');
          print('⚠️ [共享地图] Stack: $stack');
        }
      }

      // 再添加选中标记，确保在最上层
      if (selectedId != null) {
        // 只有当选中的 spot 在列表中时才添加选中标记
        final selectedSpotIndex = spotsToAdd.indexWhere((s) => s.id == selectedId);
        if (selectedSpotIndex != -1) {
          final selectedSpot = spotsToAdd[selectedSpotIndex];
          try {
            final selectedAnnotation = await _createAnnotation(selectedSpot, isSelected: true);
            if (generation != _markerGeneration) return;
            _annotationsBySpotId[selectedSpot.id] = selectedAnnotation;
            _spotByAnnotationId[selectedAnnotation.id] = selectedSpot;
          } catch (e) {
            print('⚠️ [共享地图] 添加选中标记失败: $e');
          }
        } else {
          print('⚠️ [共享地图] 选中的 spot 不在当前列表中: $selectedId');
        }
      }

      print('✅ [共享地图] 已添加 ${_annotationsBySpotId.length} 个原生标记');

      // 设置点击监听
      if (!_markerClickListenerAttached) {
        manager.addOnPointAnnotationClickListener(
          _MarkerClickListener(
            onMarkerTap: widget.onSpotTap,
            annotationSpotResolver: (annotationId) =>
                _spotByAnnotationId[annotationId],
          ),
        );
        _markerClickListenerAttached = true;
      }

      _lastSelectedSpotId = selectedId;
    } catch (e) {
      print('❌ [共享地图] 添加原生标记失败: $e');
    }
  }

  Future<PointAnnotation> _createAnnotation(
    Spot spot, {
    required bool isSelected,
  }) async {
    final manager = _pointAnnotationManager!;
    final markerImage = await _getMarkerBitmap(
      spot,
      isSelected: isSelected,
    );

    final annotation = PointAnnotationOptions(
      geometry: Point(
        coordinates: Position(spot.longitude, spot.latitude),
      ),
      image: markerImage,
      iconAnchor: IconAnchor.BOTTOM,
      // 2x 分辨率图片，缩放比例减半
      iconSize: widget.markerMode == MapboxMarkerMode.checkIn
          ? 1.0  // checkIn 模式使用 1.0，因为图片是 2x 分辨率 (60*2*1.0 = 120px)
          : (isSelected ? 1.2 : 1.0),
      // 选中的 marker 使用更高的 sortKey，确保在最上层
      // sortKey 越大越在上面
      symbolSortKey: widget.markerMode == MapboxMarkerMode.checkIn
          ? 1000.0  // checkIn 模式所有标记都在最上层
          : (isSelected ? 1000.0 : 0.0),
    );
    
    if (widget.markerMode == MapboxMarkerMode.checkIn) {
      print('📍 [共享地图] 创建 checkIn 标记: ${spot.name}, iconSize: 1.0, symbolSortKey: 1000.0, 位置: (${spot.latitude}, ${spot.longitude})');
    }

    return manager.create(annotation);
  }

  /// 直接更新选中的 spot，不触发 widget 重建
  Future<void> updateSelectedSpot(Spot? spot) async {
    if (spot?.id == _lastSelectedSpotId) return;
    
    final newSelectedId = spot?.id;
    if (newSelectedId == null) return;
    
    // 直接调用内部方法更新 marker 样式
    if (_annotationsBySpotId.isNotEmpty) {
      await _refreshSelectedMarkerById(newSelectedId);
    }
  }

  Future<void> _refreshSelectedMarker() async {
    final manager = _pointAnnotationManager;
    if (manager == null) {
      print('⚠️ [共享地图] manager 为空，无法刷新选中标记');
      return;
    }
    final newSelectedId = widget.selectedSpot?.id;

    print('📍 [共享地图] 刷新选中标记: lastSelected=$_lastSelectedSpotId, newSelected=$newSelectedId');

    if (newSelectedId == null) {
      print('⚠️ [共享地图] 新选中 ID 为空');
      return;
    }
    
    await _refreshSelectedMarkerById(newSelectedId);
  }

  Future<void> _refreshSelectedMarkerById(String newSelectedId) async {
    final manager = _pointAnnotationManager;
    if (manager == null) return;
    
    if (_annotationsBySpotId.isEmpty) {
      print('📍 [共享地图] annotations 为空，重新添加所有标记');
      await _addNativeMarkers();
      return;
    }
    
    // 如果选中的是同一个，不需要刷新
    if (_lastSelectedSpotId == newSelectedId) {
      print('📍 [共享地图] 选中的是同一个，跳过刷新');
      return;
    }

    // 并发控制：如果正在刷新，记录待处理的选中 ID，等当前刷新完成后处理
    if (_isRefreshingMarker) {
      print('📍 [共享地图] 正在刷新中，记录待处理: $newSelectedId');
      _pendingSelectedId = newSelectedId;
      return;
    }

    _isRefreshingMarker = true;
    _pendingSelectedId = null;

    try {
      await _doRefreshSelectedMarker(newSelectedId);
    } finally {
      _isRefreshingMarker = false;
      
      // 检查是否有待处理的选中请求
      final pending = _pendingSelectedId;
      if (pending != null && pending != _lastSelectedSpotId) {
        print('📍 [共享地图] 处理待处理的选中: $pending');
        _pendingSelectedId = null;
        // 使用 Future.microtask 避免递归调用栈过深
        Future.microtask(() => _refreshSelectedMarkerById(pending));
      }
    }
  }

  /// 实际执行标记刷新的内部方法
  Future<void> _doRefreshSelectedMarker(String newSelectedId) async {
    final manager = _pointAnnotationManager;
    if (manager == null) return;

    try {
      final oldSelectedId = _lastSelectedSpotId;
      
      // 先更新状态，防止重复处理
      _lastSelectedSpotId = newSelectedId;

      // 还原旧的选中标记（删除并重建为普通样式）
      if (oldSelectedId != null &&
          oldSelectedId != newSelectedId &&
          _annotationsBySpotId.containsKey(oldSelectedId)) {
        // 只有当旧的 spot 还在当前列表中时才还原
        final previousSpotIndex = widget.spots.indexWhere((s) => s.id == oldSelectedId);
        if (previousSpotIndex != -1) {
          final previousSpot = widget.spots[previousSpotIndex];
          final oldAnnotation = _annotationsBySpotId[oldSelectedId];
          
          if (oldAnnotation != null) {
            print('📍 [共享地图] 还原旧标记: ${previousSpot.name}');
            
            // 删除旧标记并重建为普通样式
            await manager.delete(oldAnnotation);
            _spotByAnnotationId.remove(oldAnnotation.id);
            
            final restored = await _createAnnotation(previousSpot, isSelected: false);
            _annotationsBySpotId[oldSelectedId] = restored;
            _spotByAnnotationId[restored.id] = previousSpot;
          }
        } else {
          // 旧的 spot 不在当前列表中，只需删除其标记
          final oldAnnotation = _annotationsBySpotId[oldSelectedId];
          if (oldAnnotation != null) {
            print('📍 [共享地图] 删除不在列表中的旧标记: $oldSelectedId');
            await manager.delete(oldAnnotation);
            _spotByAnnotationId.remove(oldAnnotation.id);
            _annotationsBySpotId.remove(oldSelectedId);
          }
        }
      }

      // 更新新选中标记的样式并提升到最上层
      final newSpotIndex = widget.spots.indexWhere((s) => s.id == newSelectedId);
      if (newSpotIndex == -1) {
        print('⚠️ [共享地图] 新选中的 spot 不在列表中: $newSelectedId');
        return;
      }
      
      final newSpot = widget.spots[newSpotIndex];
      final existing = _annotationsBySpotId[newSelectedId];
      
      print('📍 [共享地图] 选中新标记: ${newSpot.name}');
      
      if (existing != null) {
        // 删除并重新创建以确保在最上层
        await manager.delete(existing);
        _spotByAnnotationId.remove(existing.id);
      }
      
      final selectedAnnotation = await _createAnnotation(newSpot, isSelected: true);
      _annotationsBySpotId[newSelectedId] = selectedAnnotation;
      _spotByAnnotationId[selectedAnnotation.id] = newSpot;

      print('✅ [共享地图] 选中标记刷新完成: $newSelectedId');
    } catch (e) {
      print('⚠️ [共享地图] 刷新选中标记失败: $e');
    }
  }

  /// 检查地点是否关门
  bool _isSpotClosed(Spot spot) {
    final raw = spot.openingHours;
    if (raw == null) return false;
    
    final eval = OpeningHoursUtils.evaluate(
      raw,
      country: spot.country,
      longitude: spot.longitude,
    );
    if (eval == null) return false;
    
    return !eval.isOpen;
  }

  Future<Uint8List> _getMarkerBitmap(
    Spot spot, {
    required bool isSelected,
  }) async {
    if (widget.markerMode == MapboxMarkerMode.checkIn) {
      const cacheKey = 'checkin_marker';
      final cached = _markerBitmapCache[cacheKey];
      if (cached != null) {
        print('📍 [共享地图] 使用缓存的 checkIn 标记图片，大小: ${cached.length} bytes');
        return cached;
      }
      print('📍 [共享地图] 创建新的 checkIn 标记图片...');
      final bitmap = await _createCheckInMarkerBitmap();
      print('📍 [共享地图] checkIn 标记图片创建完成，大小: ${bitmap.length} bytes');
      _markerBitmapCache[cacheKey] = bitmap;
      return bitmap;
    }

    final isVisited = widget.visitedSpots?[spot.id] ?? false;
    final isClosed = _isSpotClosed(spot);
    // 使用名称和类别作为缓存 key，因为相同内容的 marker 可以共享 bitmap
    final truncatedName = spot.name.length > 10 ? '${spot.name.substring(0, 10)}...' : spot.name;
    final cacheKey = '${truncatedName}_${spot.category}_${isSelected ? 'selected' : 'default'}_${isVisited ? 'visited' : 'normal'}_${isClosed ? 'closed' : 'open'}';
    final cached = _markerBitmapCache[cacheKey];
    if (cached != null) {
      return cached;
    }

    // Spec:
    // - visited/check-in marker background: #CCCCCC
    // - visited/check-in border + text: #8D8D8D
    // - selected non-visited highlight: yellow
    // - closed marker: gray background and text
    // - visited marker: same gray style as closed (浅灰背景)
    final Color markerColor;
    final Color labelColor;
    
    if (isClosed) {
      // 关门状态：浅灰色背景和深灰文字
      markerColor = AppTheme.markerGray;  // #CCCCCC
      labelColor = AppTheme.markerLabelGray;  // #8D8D8D
    } else if (isVisited) {
      // 已访问状态：与关门状态使用相同的灰色样式
      markerColor = AppTheme.markerGray;  // #CCCCCC
      labelColor = AppTheme.markerLabelGray;  // #8D8D8D
    } else {
      markerColor = isSelected ? AppTheme.primaryYellow : Colors.white;
      labelColor = AppTheme.black;
    }
    
    final bitmap = await _createCustomMarkerBitmap(
      spot.name,
      spot.category,
      markerColor,
      isSelected,
      isVisited: isVisited,
      isClosed: isClosed,
      labelColor: labelColor,
    );
    _markerBitmapCache[cacheKey] = bitmap;
    return bitmap;
  }

  Future<Uint8List> _createCheckInMarkerBitmap() async {
    const double scale = 2.0;
    const double markerWidth = 60.0;
    const double markerHeight = 50.0;
    const double triangleHeight = 12.0;
    const double totalHeight = markerHeight + triangleHeight;
    const double cornerRadius = 25.0;
    const double triangleWidth = 16.0;

    final ui.PictureRecorder pictureRecorder = ui.PictureRecorder();
    final Canvas canvas = Canvas(pictureRecorder);
    canvas.scale(scale);

    final bgPaint = Paint()
      ..color = const Color(0xFFFFD93D)
      ..style = PaintingStyle.fill;

    final borderPaint = Paint()
      ..color = AppTheme.black
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;

    final shadowPaint = Paint()
      ..color = Colors.black.withOpacity(0.2)
      ..style = PaintingStyle.fill;

    const left = 0.0;
    const top = 0.0;
    const right = markerWidth;
    const bottom = markerHeight;
    const centerX = markerWidth / 2;
    const tipY = totalHeight;

    final path = Path()
      ..moveTo(left + cornerRadius, top)
      ..lineTo(right - cornerRadius, top)
      ..arcToPoint(
        const Offset(right, top + cornerRadius),
        radius: const Radius.circular(cornerRadius),
      )
      ..lineTo(right, bottom - cornerRadius)
      ..arcToPoint(
        const Offset(right - cornerRadius, bottom),
        radius: const Radius.circular(cornerRadius),
      )
      ..lineTo(centerX + triangleWidth / 2, bottom)
      ..lineTo(centerX, tipY)
      ..lineTo(centerX - triangleWidth / 2, bottom)
      ..lineTo(left + cornerRadius, bottom)
      ..arcToPoint(
        const Offset(left, bottom - cornerRadius),
        radius: const Radius.circular(cornerRadius),
      )
      ..lineTo(left, top + cornerRadius)
      ..arcToPoint(
        const Offset(left + cornerRadius, top),
        radius: const Radius.circular(cornerRadius),
      )
      ..close();

    canvas.save();
    canvas.translate(1.5, 2);
    canvas.drawPath(path, shadowPaint);
    canvas.restore();

    canvas.drawPath(path, bgPaint);
    canvas.drawPath(path, borderPaint);

    final textPainter = TextPainter(
      text: const TextSpan(
        text: '✓',
        style: TextStyle(
          color: Colors.white,
          fontSize: 24,
          fontWeight: FontWeight.bold,
        ),
      ),
      textDirection: TextDirection.ltr,
    );
    textPainter.layout();
    final textX = (markerWidth - textPainter.width) / 2;
    final textY = (markerHeight - textPainter.height) / 2;
    textPainter.paint(canvas, Offset(textX, textY));

    final picture = pictureRecorder.endRecording();
    final image = await picture.toImage(
      (markerWidth * scale).toInt(),
      (totalHeight * scale).toInt(),
    );
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    final result = byteData!.buffer.asUint8List();
    print('📍 [共享地图] checkIn 标记图片生成完成: ${(markerWidth * scale).toInt()}x${(totalHeight * scale).toInt()}, ${result.length} bytes');
    return result;
  }

  /// 使用 Canvas 绘制自定义标记图标
  Future<Uint8List> _createCustomMarkerBitmap(
    String title,
    String category,
    Color backgroundColor,
    bool isSelected, {
    bool isVisited = false,
    bool isClosed = false,
    Color labelColor = AppTheme.black,
  }) async {
    // 使用 2x 分辨率让图像更清晰
    const double scale = 2.0;
    
    final ui.PictureRecorder pictureRecorder = ui.PictureRecorder();
    final Canvas canvas = Canvas(pictureRecorder);
    
    // 应用缩放
    canvas.scale(scale);

    const double maxMarkerWidth = 220.0;
    const double minMarkerWidth = 80.0;
    const double markerHeight = 50.0;
    const double iconSize = 20.0;
    const double fontSize = 16.0;
    const double triangleHeight = 12.0;
    const double triangleWidth = 16.0;
    const double cornerRadius = 25.0;
    const double horizontalPadding = 14.0;
    const double iconTextGap = 6.0;
    const double offsetX = 30.0;
    // 如果关门，增加顶部偏移给 Closed 气泡留空间
    final double extraTopOffset = isClosed ? 12.0 : 0.0;
    final double offsetY = 5.0 + extraTopOffset;

    // 获取图标 Emoji
    final iconEmoji = isVisited ? '✓' : getCategoryEmoji(category);

    // 先测量 emoji 宽度
    final iconPainter = TextPainter(
      text: TextSpan(
        text: iconEmoji,
        style: TextStyle(
          color: labelColor,
          fontSize: iconSize,
          fontFamily: 'ReemKufi',
        ),
      ),
      textDirection: TextDirection.ltr,
    );
    iconPainter.layout();

    // 测量 "..." 的宽度（预估值）
    const double ellipsisWidth = 24.0;

    // 测量文字宽度（不截断）
    final fullTextPainter = TextPainter(
      text: TextSpan(
        text: title,
        style: TextStyle(
          color: labelColor,
          fontSize: fontSize,
          fontWeight: FontWeight.normal,
          fontFamily: 'ReemKufi',
        ),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
    );
    fullTextPainter.layout();

    // 计算需要的宽度
    final contentWidth = horizontalPadding + iconPainter.width + iconTextGap + fullTextPainter.width + horizontalPadding;
    final markerWidth = contentWidth.clamp(minMarkerWidth, maxMarkerWidth);
    
    // 计算可用的文字宽度
    final availableTextWidth = markerWidth - horizontalPadding - iconPainter.width - iconTextGap - horizontalPadding;
    
    // 判断是否需要截断
    String displayText;
    if (fullTextPainter.width > availableTextWidth) {
      // 需要截断，留出 "..." 的空间
      final maxTextWidth = availableTextWidth - ellipsisWidth;
      // 逐字符测量找到合适的截断点
      var truncatedText = '';
      for (var i = 0; i < title.length; i++) {
        final testText = title.substring(0, i + 1);
        final testPainter = TextPainter(
          text: TextSpan(
            text: testText,
            style: TextStyle(
              color: labelColor,
              fontSize: fontSize,
              fontWeight: FontWeight.normal,
              fontFamily: 'ReemKufi',
            ),
          ),
          textDirection: TextDirection.ltr,
        );
        testPainter.layout();
        if (testPainter.width > maxTextWidth) {
          break;
        }
        truncatedText = testText;
      }
      displayText = '$truncatedText...';
    } else {
      displayText = title;
    }

    // 绘制标记背景
    final bgPaint = Paint()
      ..color = backgroundColor
      ..style = PaintingStyle.fill;

    final borderPaint = Paint()
      ..color = (isClosed || isVisited) ? AppTheme.markerLabelGray : AppTheme.black
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5; // 稍微加粗边框让它更清晰

    // 清晰的阴影
    final shadowPaint = Paint()
      ..color = Colors.black.withOpacity(0.2)
      ..style = PaintingStyle.fill;

    // 创建气泡形状路径
    final left = offsetX;
    final top = offsetY;
    final right = offsetX + markerWidth;
    final bottom = offsetY + markerHeight;
    final centerX = offsetX + markerWidth / 2;
    final tipY = bottom + triangleHeight;

    Path createBubblePath() {
      final path = Path();
      path.moveTo(left + cornerRadius, top);
      path.lineTo(right - cornerRadius, top);
      path.arcToPoint(
        Offset(right, top + cornerRadius),
        radius: const Radius.circular(cornerRadius),
      );
      path.lineTo(right, bottom - cornerRadius);
      path.arcToPoint(
        Offset(right - cornerRadius, bottom),
        radius: const Radius.circular(cornerRadius),
      );
      path.lineTo(centerX + triangleWidth / 2, bottom);
      path.lineTo(centerX, tipY);
      path.lineTo(centerX - triangleWidth / 2, bottom);
      path.lineTo(left + cornerRadius, bottom);
      path.arcToPoint(
        Offset(left, bottom - cornerRadius),
        radius: const Radius.circular(cornerRadius),
      );
      path.lineTo(left, top + cornerRadius);
      path.arcToPoint(
        Offset(left + cornerRadius, top),
        radius: const Radius.circular(cornerRadius),
      );
      path.close();
      return path;
    }

    final bubblePath = createBubblePath();

    // 画阴影
    canvas.save();
    canvas.translate(1.5, 2);
    canvas.drawPath(bubblePath, shadowPaint);
    canvas.restore();

    // 画背景和边框
    canvas.drawPath(bubblePath, bgPaint);
    canvas.drawPath(bubblePath, borderPaint);

    // 计算垂直居中位置
    final contentAreaTop = offsetY;
    final contentAreaHeight = markerHeight;
    final iconY = contentAreaTop + (contentAreaHeight - iconPainter.height) / 2;

    // 绘制 emoji
    iconPainter.paint(
      canvas,
      Offset(offsetX + horizontalPadding, iconY),
    );

    // 绘制文字
    final textPainter = TextPainter(
      text: TextSpan(
        text: displayText,
        style: TextStyle(
          color: labelColor,
          fontSize: fontSize,
          fontWeight: FontWeight.normal,
          fontFamily: 'ReemKufi',
        ),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
    );
    textPainter.layout();
    final textY = contentAreaTop + (contentAreaHeight - textPainter.height) / 2;
    textPainter.paint(
      canvas,
      Offset(offsetX + horizontalPadding + iconPainter.width + iconTextGap, textY),
    );

    // 如果关门，绘制右上角的 "Closed" 红色气泡
    double extraRightWidth = 0.0;
    if (isClosed) {
      const closedText = 'Closed';
      const closedFontSize = 11.0;
      const closedPaddingH = 6.0;
      const closedPaddingV = 3.0;
      const closedRadius = 8.0;
      
      final closedPainter = TextPainter(
        text: TextSpan(
          text: closedText,
          style: TextStyle(
            color: Colors.white,
            fontSize: closedFontSize,
            fontWeight: FontWeight.w600,
            fontFamily: 'ReemKufi',
          ),
        ),
        textDirection: TextDirection.ltr,
      );
      closedPainter.layout();
      
      final closedBubbleWidth = closedPainter.width + closedPaddingH * 2;
      final closedBubbleHeight = closedPainter.height + closedPaddingV * 2;
      
      // 位置：主气泡右上角偏移
      final closedLeft = right - closedBubbleWidth / 2 + 5;
      final closedTop = top - closedBubbleHeight / 2 - 2;
      
      // 计算气泡超出右边界的宽度
      final closedRight = closedLeft + closedBubbleWidth;
      if (closedRight > right + offsetX) {
        extraRightWidth = closedRight - (right + offsetX) + 5; // 额外留 5px 边距
      }
      
      final closedRect = RRect.fromRectAndRadius(
        Rect.fromLTWH(closedLeft, closedTop, closedBubbleWidth, closedBubbleHeight),
        const Radius.circular(closedRadius),
      );
      
      // 红色背景
      final closedBgPaint = Paint()
        ..color = const Color(0xFFE53935) // 红色
        ..style = PaintingStyle.fill;
      
      canvas.drawRRect(closedRect, closedBgPaint);
      
      // 绘制文字
      closedPainter.paint(
        canvas,
        Offset(closedLeft + closedPaddingH, closedTop + closedPaddingV),
      );
    }

    // 转换为图片（使用 2x 分辨率）
    final picture = pictureRecorder.endRecording();
    // 如果有 Closed 气泡，需要增加图片尺寸（extraTopOffset 已经包含在 offsetY 中）
    final imageWidth = ((markerWidth + offsetX * 2 + extraRightWidth) * scale).toInt();
    final imageHeight = ((markerHeight + triangleHeight + offsetY + 5.0 + extraTopOffset) * scale).toInt();
    final image = await picture.toImage(imageWidth, imageHeight);
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);

    return byteData!.buffer.asUint8List();
  }

  /// 移动相机到指定位置
  Future<void> animateCamera(Position center, {double? zoom}) async {
    final map = _mapboxMap;
    if (map == null) {
      _pendingJumpCenter = center;
      _pendingJumpZoom = zoom ?? _currentZoom;
      return;
    }

    await map.easeTo(
      CameraOptions(
        center: Point(coordinates: center),
        zoom: zoom ?? _currentZoom,
        padding: widget.cameraPadding,
      ),
      MapAnimationOptions(duration: 100),
    );

    setState(() {
      _currentCenter = center;
      if (zoom != null) _currentZoom = zoom;
    });
  }

  /// Returns true if the given [position] projects into the vertical "safe band"
  /// between [topPaddingPx] and [bottomPaddingPx] (plus a small margin).
  ///
  /// This is used to avoid forcing recenter on marker taps when the marker is
  /// already visible between the top chrome and bottom cards.
  Future<bool> isPositionWithinVerticalSafeArea(
    Position position, {
    required double topPaddingPx,
    required double bottomPaddingPx,
    double marginPx = 24,
  }) async {
    final map = _mapboxMap;
    final size = context.size;
    if (map == null || size == null) {
      return true;
    }

    try {
      final projected = await map.pixelForCoordinate(
        Point(coordinates: position),
      );

      final safeTop = topPaddingPx + marginPx;
      final safeBottom = size.height - bottomPaddingPx - marginPx;

      return projected.y >= safeTop && projected.y <= safeBottom;
    } catch (e) {
      // If projection fails, don't force a recenter.
      return true;
    }
  }

  Future<void> jumpToPosition(Position center, {double? zoom}) async {
    final map = _mapboxMap;
    if (map == null) {
      _pendingJumpCenter = center;
      _pendingJumpZoom = zoom ?? _currentZoom;
      return;
    }

    await map.setCamera(
      CameraOptions(
        center: Point(coordinates: center),
        zoom: zoom ?? _currentZoom,
        padding: widget.cameraPadding,
      ),
    );

    setState(() {
      _currentCenter = center;
      if (zoom != null) {
        _currentZoom = zoom;
      }
    });
  }

  Future<void> _applyPendingCamera() async {
    final center = _pendingJumpCenter;
    if (center == null) {
      return;
    }
    final zoom = _pendingJumpZoom;
    _pendingJumpCenter = null;
    _pendingJumpZoom = null;
    await jumpToPosition(center, zoom: zoom);
  }

  bool _isMouseLikeDevice(ui.PointerDeviceKind kind) =>
      kind == ui.PointerDeviceKind.mouse ||
      kind == ui.PointerDeviceKind.trackpad;

  ScreenCoordinate? _anchorFromOffset(Offset? offset) => offset == null
      ? null
      : ScreenCoordinate(x: offset.dx, y: offset.dy);

  void _setZoom(double zoom, {Offset? anchor}) {
    final map = _mapboxMap;
    if (map == null) {
      return;
    }

    final clampedZoom = zoom.clamp(_minZoomLevel, _maxZoomLevel);
    map.easeTo(
      CameraOptions(
        zoom: clampedZoom,
        anchor: _anchorFromOffset(anchor),
      ),
      MapAnimationOptions(duration: 0),
    );

    setState(() {
      _currentZoom = clampedZoom;
    });
  }

  void _zoomBy(double delta, {Offset? anchor}) {
    if (delta == 0) {
      return;
    }
    final targetZoom = (_currentZoom + delta).clamp(
      _minZoomLevel,
      _maxZoomLevel,
    );
    if ((targetZoom - _currentZoom).abs() < 0.001) {
      return;
    }
    _setZoom(targetZoom, anchor: anchor);
  }

  void _handlePointerSignal(PointerSignalEvent event) {
    if (!_isMouseLikeDevice(event.kind)) {
      return;
    }

    if (event is PointerScrollEvent) {
      final dy = event.scrollDelta.dy;
      final dx = event.scrollDelta.dx;
      final dominantDelta = dy.abs() >= dx.abs() ? dy : dx;
      if (dominantDelta == 0) {
        return;
      }
      final zoomDelta = -dominantDelta * _scrollZoomSensitivity;
      _zoomBy(zoomDelta, anchor: event.localPosition);
    } else if (event is PointerScaleEvent) {
      if (event.scale == 0) {
        return;
      }
      final zoomDelta = math.log(event.scale) / math.ln2;
      if (zoomDelta.abs() < 0.001) {
        return;
      }
      _zoomBy(zoomDelta, anchor: event.localPosition);
    }
  }

  void _handlePointerPanZoomStart(PointerPanZoomStartEvent event) {
    if (!_isMouseLikeDevice(event.kind)) {
      _panZoomBaseZoom = null;
      return;
    }
    _panZoomBaseZoom = _currentZoom;
  }

  void _handlePointerPanZoomUpdate(PointerPanZoomUpdateEvent event) {
    final baseZoom = _panZoomBaseZoom;
    if (baseZoom == null || !_isMouseLikeDevice(event.kind)) {
      return;
    }
    final scale = event.scale;
    if (scale <= 0) {
      return;
    }
    final delta = math.log(scale) / math.ln2;
    final targetZoom = (baseZoom + delta).clamp(
      _minZoomLevel,
      _maxZoomLevel,
    );
    _setZoom(targetZoom, anchor: event.localPosition);
  }

  void _handlePointerPanZoomEnd(PointerPanZoomEndEvent _) {
    _panZoomBaseZoom = null;
  }

  @override
  Widget build(BuildContext context) => Listener(
        behavior: HitTestBehavior.translucent,
        onPointerSignal: _handlePointerSignal,
        onPointerPanZoomStart: _handlePointerPanZoomStart,
        onPointerPanZoomUpdate: _handlePointerPanZoomUpdate,
        onPointerPanZoomEnd: _handlePointerPanZoomEnd,
        child: MapWidget(
          key: const ValueKey('shared-mapbox-widget'),
          cameraOptions: CameraOptions(
            center: Point(coordinates: _currentCenter ?? widget.initialCenter),
            zoom: _currentZoom,
            padding: widget.cameraPadding,
          ),
          onMapCreated: (mapboxMap) async {
            _mapboxMap = mapboxMap;

            // 初始化 PointAnnotationManager
            _pointAnnotationManager =
                await mapboxMap.annotations.createPointAnnotationManager();

            print('🗺️ [共享地图] 地图创建完成，初始中心: (${widget.initialCenter.lng}, ${widget.initialCenter.lat}), 缩放: ${widget.initialZoom}');
            
            await _enableMapGestures();
            await _addNativeMarkers();
            await _applyPendingCamera();
            
            // 确保地图显示正确的位置
            final cameraState = await mapboxMap.getCameraState();
            print('🗺️ [共享地图] 地图当前相机: (${cameraState.center.coordinates.lng}, ${cameraState.center.coordinates.lat}), 缩放: ${cameraState.zoom}');

            _isMapReady = true; // 标记地图已准备好
            widget.onMapCreated?.call();
          },
          onCameraChangeListener: (cameraChangedEventData) async {
            // 实时更新地图中心和缩放级别
            final map = _mapboxMap;
            if (map == null) return;

            try {
              final cameraState = await map.getCameraState();
              final newCenter = cameraState.center;
              final newZoom = cameraState.zoom;

              if (newCenter.coordinates.lng != _currentCenter?.lng ||
                  newCenter.coordinates.lat != _currentCenter?.lat ||
                  newZoom != _currentZoom) {
                setState(() {
                  _currentCenter = newCenter.coordinates;
                  _currentZoom = newZoom;
                });

                widget.onCameraMove?.call(newCenter.coordinates, newZoom);
              }
            } catch (e) {
              // 忽略错误
            }
          },
        ),
      );
}

/// 标记点击监听器
class _MarkerClickListener extends OnPointAnnotationClickListener {

  _MarkerClickListener({
    required this.onMarkerTap,
    required this.annotationSpotResolver,
  });
  final void Function(Spot) onMarkerTap;
  final Spot? Function(String annotationId) annotationSpotResolver;

  @override
  void onPointAnnotationClick(PointAnnotation annotation) {
    final spot = annotationSpotResolver(annotation.id);
    if (spot != null) {
      onMarkerTap(spot);
    }
  }
}
