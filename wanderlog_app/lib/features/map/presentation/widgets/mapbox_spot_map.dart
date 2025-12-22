import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart';

/// 共享的 Mapbox 地图组件 - 使用原生标记渲染
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

    final hasNewSpots = !identical(oldWidget.spots, widget.spots);
    final selectionChanged =
        oldWidget.selectedSpot?.id != widget.selectedSpot?.id;

    // 仅列表变化时重建；选中变化时只替换前后两个标记，避免闪动
    if (hasNewSpots) {
      _addNativeMarkers();
    } else if (selectionChanged) {
      _refreshSelectedMarker();
    }
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
      print('✅ [共享地图] 地图手势已启用！双指缩放: 已开启');
      print('👆 [共享地图] pinchToZoomEnabled: ${settings.pinchToZoomEnabled}');
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

      // 先添加未选中的标记
      for (final spot in spots.where((s) => s.id != selectedId)) {
        final annotation = await _createAnnotation(spot, isSelected: false);
        if (generation != _markerGeneration) return;
        _annotationsBySpotId[spot.id] = annotation;
        _spotByAnnotationId[annotation.id] = spot;
      }

      // 再添加选中标记，确保在最上层
      if (selectedId != null) {
        final selectedSpot =
            spots.firstWhere((s) => s.id == selectedId, orElse: () => spots[0]);
        final selectedAnnotation =
            await _createAnnotation(selectedSpot, isSelected: true);
        if (generation != _markerGeneration) return;
        _annotationsBySpotId[selectedSpot.id] = selectedAnnotation;
        _spotByAnnotationId[selectedAnnotation.id] = selectedSpot;
      }

      print('✅ [共享地图] 已添加 ${spots.length} 个原生标记');

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
      // 略微放大以增大可点击区域
      iconSize: isSelected ? 2.4 : 2.1,
    );

    return manager.create(annotation);
  }

  Future<void> _refreshSelectedMarker() async {
    final manager = _pointAnnotationManager;
    if (manager == null) return;
    final newSelectedId = widget.selectedSpot?.id;

    if (newSelectedId == null) return;
    if (_annotationsBySpotId.isEmpty) {
      await _addNativeMarkers();
      return;
    }

    // 还原旧的选中标记
    if (_lastSelectedSpotId != null &&
        _annotationsBySpotId.containsKey(_lastSelectedSpotId)) {
      final previousSpot = widget.spots.firstWhere(
        (s) => s.id == _lastSelectedSpotId,
        orElse: () => widget.spots.first,
      );
      final oldAnnotation = _annotationsBySpotId[_lastSelectedSpotId]!;
      await manager.delete(oldAnnotation);
      final restored =
          await _createAnnotation(previousSpot, isSelected: false);
      _annotationsBySpotId[_lastSelectedSpotId!] = restored;
      _spotByAnnotationId.remove(oldAnnotation.id);
      _spotByAnnotationId[restored.id] = previousSpot;
    }

    // 提升新的选中标记
    final newSpot = widget.spots
        .firstWhere((s) => s.id == newSelectedId, orElse: () => widget.spots[0]);
    final existing = _annotationsBySpotId[newSelectedId];
    if (existing != null) {
      await manager.delete(existing);
      _spotByAnnotationId.remove(existing.id);
    }
    final selectedAnnotation =
        await _createAnnotation(newSpot, isSelected: true);
    _annotationsBySpotId[newSelectedId] = selectedAnnotation;
    _spotByAnnotationId[selectedAnnotation.id] = newSpot;

    _lastSelectedSpotId = newSelectedId;
  }

  Future<Uint8List> _getMarkerBitmap(
    Spot spot, {
    required bool isSelected,
  }) async {
    final isVisited = widget.visitedSpots?[spot.id] ?? false;
    final cacheKey = '${spot.id}_${isSelected ? 'selected' : 'default'}_${isVisited ? 'visited' : 'normal'}';
    final cached = _markerBitmapCache[cacheKey];
    if (cached != null) {
      return cached;
    }

    // Spec:
    // - visited/check-in marker background: #CCCCCC
    // - visited/check-in border + text: #8D8D8D
    // - selected non-visited highlight: yellow
    final Color markerColor = isVisited
        ? AppTheme.markerGray
        : (isSelected ? AppTheme.primaryYellow : Colors.white);
    final Color labelColor = isVisited ? AppTheme.markerLabelGray : AppTheme.black;
    final bitmap = await _createCustomMarkerBitmap(
      spot.name,
      spot.category,
      markerColor,
      isSelected,
      isVisited: isVisited,
      labelColor: labelColor,
    );
    _markerBitmapCache[cacheKey] = bitmap;
    return bitmap;
  }

  /// 使用 Canvas 绘制自定义标记图标
  Future<Uint8List> _createCustomMarkerBitmap(
    String title,
    String category,
    Color backgroundColor,
    bool isSelected, {
    bool isVisited = false,
    Color labelColor = AppTheme.black,
  }) async {
    final ui.PictureRecorder pictureRecorder = ui.PictureRecorder();
    final Canvas canvas = Canvas(pictureRecorder);

    const int size = 220;
    const double markerWidth = 180.0;
    const double markerHeight = 50.0;
    const double iconSize = 22.0;
    const double iconPadding = 12.0;
    const double offsetX = 20.0; // 左边距，确保标记居中

    // 绘制标记背景
    final bgPaint = Paint()
      ..color = backgroundColor
      ..style = PaintingStyle.fill;

    final borderPaint = Paint()
      ..color = isVisited ? AppTheme.markerLabelGray : AppTheme.black
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5;

    // 绘制阴影
    final shadowPaint = Paint()
      ..color = Colors.black.withOpacity(0.2)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4);

    final rrect = RRect.fromRectAndRadius(
      const Rect.fromLTWH(offsetX + 5, 5, markerWidth, markerHeight),
      const Radius.circular(AppTheme.radiusLarge),
    );

    // 画阴影和背景
    canvas.drawRRect(rrect, shadowPaint);
    canvas.drawRRect(rrect, bgPaint);
    canvas.drawRRect(rrect, borderPaint);

    // 获取图标 Emoji - 已访问显示打勾，否则显示分类 emoji
    final iconEmoji = isVisited ? '✓' : _getCategoryEmoji(category);

    // 绘制 Emoji 图标
    final iconPainter = TextPainter(
      text: TextSpan(
        text: iconEmoji,
        style: TextStyle(
          // Spec: visited/check-in border + text: #8D8D8D
          color: labelColor,
          fontSize: iconSize,
          fontFamily: 'ReemKufi',
        ),
      ),
      textDirection: TextDirection.ltr,
    );
    iconPainter.layout();
    iconPainter.paint(
      canvas,
      const Offset(
        offsetX + 10 + iconPadding,
        (markerHeight - iconSize) / 2 + 5,
      ),
    );

    // 绘制文字（留出图标空间）
    final textPainter = TextPainter(
      text: TextSpan(
        text: title.length > 10 ? '${title.substring(0, 10)}...' : title,
        style: TextStyle(
          color: labelColor,
          fontSize: 17,
          fontWeight: FontWeight.bold,
          fontFamily: 'ReemKufi',
        ),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
    );

    textPainter.layout(maxWidth: markerWidth - 50);
    textPainter.paint(
      canvas,
      Offset(
        offsetX + 10 + iconPadding + iconSize + 8,
        (markerHeight - textPainter.height) / 2 + 5,
      ),
    );

    // 画底部的小三角形（指向坐标点）
    final trianglePath = Path();
    const centerX = offsetX + markerWidth / 2;
    trianglePath.moveTo(centerX, markerHeight + 5);
    trianglePath.lineTo(centerX - 10, markerHeight + 5);
    trianglePath.lineTo(centerX, markerHeight + 15);
    trianglePath.lineTo(centerX + 10, markerHeight + 5);
    trianglePath.close();
    canvas.drawPath(trianglePath, bgPaint);
    canvas.drawPath(trianglePath, borderPaint);

    // 转换为图片
    final picture = pictureRecorder.endRecording();
    final image = await picture.toImage(size, size);
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);

    return byteData!.buffer.asUint8List();
  }

  /// 获取分类 Emoji
  String _getCategoryEmoji(String category) {
    switch (category.toLowerCase()) {
      case 'restaurant':
        return '🍽️';
      case 'museum':
        return '🏛️';
      case 'park':
        return '🌳';
      case 'landmark':
        return '📍';
      case 'cafe':
      case 'coffee':
        return '☕️';
      case 'bakery':
        return '🥐';
      case 'shopping':
        return '🛍️';
      case 'church':
        return '⛪️';
      case 'theater':
        return '🎭';
      case 'waterfront':
        return '🌊';
      case 'library':
      case 'bookstore':
        return '📚';
      case 'architecture':
        return '🏛️';
      case 'neighborhood':
        return '📌';
      case 'bar':
        return '🍸';
      case 'zoo':
      case 'aquarium':
        return '🐾';
      case 'market':
        return '🛒';
      case 'temple':
        return '🛕';
      default:
        return '📍';
    }
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

            await _enableMapGestures();
            await _addNativeMarkers();
            await _applyPendingCamera();

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
