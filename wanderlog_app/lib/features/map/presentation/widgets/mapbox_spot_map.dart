import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

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
    super.key,
  });

  final List<Spot> spots;
  final Position initialCenter;
  final double initialZoom;
  final Spot? selectedSpot;
  final void Function(Spot) onSpotTap;
  final VoidCallback? onMapCreated;
  final void Function(Position center, double zoom)? onCameraMove;

  @override
  State<MapboxSpotMap> createState() => MapboxSpotMapState();
}

class MapboxSpotMapState extends State<MapboxSpotMap> {
  MapboxMap? _mapboxMap;
  PointAnnotationManager? _pointAnnotationManager;
  Position? _currentCenter;
  double _currentZoom = 13.0;

  @override
  void initState() {
    super.initState();
    _currentCenter = widget.initialCenter;
    _currentZoom = widget.initialZoom;
  }

  @override
  void didUpdateWidget(MapboxSpotMap oldWidget) {
    super.didUpdateWidget(oldWidget);

    // 如果 spots 或 selectedSpot 变化，更新标记
    if (oldWidget.spots != widget.spots ||
        oldWidget.selectedSpot?.id != widget.selectedSpot?.id) {
      _addNativeMarkers();
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
    final manager = _pointAnnotationManager;
    if (manager == null) {
      print('❌ [共享地图] PointAnnotationManager 未初始化');
      return;
    }

    try {
      print('📍 [共享地图] 开始添加原生标记...');

      // 清除旧标记
      await manager.deleteAll();

      final spots = widget.spots;
      if (spots.isEmpty) {
        print('⚠️ [共享地图] 没有地点需要标记');
        return;
      }

      for (final spot in spots) {
        // 为每个地点创建自定义图标
        final Uint8List markerImage = await _createCustomMarkerBitmap(
          spot.name,
          spot.category,
          widget.selectedSpot?.id == spot.id
              ? AppTheme.primaryYellow
              : Colors.white,
          widget.selectedSpot?.id == spot.id,
        );

        // 创建标记配置
        final annotation = PointAnnotationOptions(
          geometry: Point(
            coordinates: Position(spot.longitude, spot.latitude),
          ),
          image: markerImage,
          iconAnchor: IconAnchor.BOTTOM,
          iconSize: 2.0, // 设置图标缩放比例，1.0 为原始大小
        );

        await manager.create(annotation);
      }

      print('✅ [共享地图] 已添加 ${spots.length} 个原生标记');

      // 设置点击监听
      manager.addOnPointAnnotationClickListener(
        _MarkerClickListener(
          spots: spots,
          onMarkerTap: widget.onSpotTap,
        ),
      );
    } catch (e) {
      print('❌ [共享地图] 添加原生标记失败: $e');
    }
  }

  /// 使用 Canvas 绘制自定义标记图标
  Future<Uint8List> _createCustomMarkerBitmap(
    String title,
    String category,
    Color backgroundColor,
    bool isSelected,
  ) async {
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
      ..color = AppTheme.black
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

    // 获取分类图标
    final categoryIcon = _getCategoryIcon(category);

    // 绘制图标
    final iconPainter = TextPainter(
      text: TextSpan(
        text: String.fromCharCode(categoryIcon.codePoint),
        style: TextStyle(
          color: AppTheme.black,
          fontSize: iconSize,
          fontFamily: categoryIcon.fontFamily,
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
        style: const TextStyle(
          color: AppTheme.black,
          fontSize: 17,
          fontWeight: FontWeight.bold,
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

  /// 获取分类图标
  IconData _getCategoryIcon(String category) {
    switch (category.toLowerCase()) {
      case 'restaurant':
        return Icons.restaurant;
      case 'museum':
        return Icons.museum;
      case 'park':
        return Icons.park;
      case 'landmark':
        return Icons.location_city;
      case 'cafe':
        return Icons.local_cafe;
      case 'bakery':
        return Icons.bakery_dining;
      case 'shopping':
        return Icons.shopping_bag;
      case 'church':
        return Icons.church;
      case 'theater':
        return Icons.theater_comedy;
      case 'waterfront':
        return Icons.water;
      case 'library':
        return Icons.local_library;
      case 'architecture':
        return Icons.apartment;
      case 'neighborhood':
        return Icons.location_on;
      case 'bar':
        return Icons.local_bar;
      case 'zoo':
        return Icons.pets;
      case 'aquarium':
        return Icons.water;
      case 'bookstore':
        return Icons.book;
      case 'market':
        return Icons.storefront;
      case 'temple':
        return Icons.temple_buddhist;
      case 'coffee':
        return Icons.local_cafe;
      default:
        return Icons.place;
    }
  }

  /// 移动相机到指定位置
  Future<void> animateCamera(Position center, {double? zoom}) async {
    final map = _mapboxMap;
    if (map == null) return;

    await map.flyTo(
      CameraOptions(
        center: Point(coordinates: center),
        zoom: zoom ?? _currentZoom,
      ),
      MapAnimationOptions(duration: 500),
    );

    setState(() {
      _currentCenter = center;
      if (zoom != null) _currentZoom = zoom;
    });
  }

  Future<void> jumpToPosition(Position center, {double? zoom}) async {
    final map = _mapboxMap;
    if (map == null) return;

    await map.setCamera(
      CameraOptions(
        center: Point(coordinates: center),
        zoom: zoom ?? _currentZoom,
      ),
    );

    setState(() {
      _currentCenter = center;
      if (zoom != null) {
        _currentZoom = zoom;
      }
    });
  }

  @override
  Widget build(BuildContext context) => MapWidget(
      key: const ValueKey('shared-mapbox-widget'),
      cameraOptions: CameraOptions(
        center: Point(coordinates: _currentCenter ?? widget.initialCenter),
        zoom: _currentZoom,
      ),
      onMapCreated: (mapboxMap) async {
        _mapboxMap = mapboxMap;

        // 初始化 PointAnnotationManager
        _pointAnnotationManager =
            await mapboxMap.annotations.createPointAnnotationManager();

        // 延迟启用手势，确保地图完全初始化
        Future.delayed(const Duration(milliseconds: 500), () {
          _enableMapGestures();
          // 添加原生标记
          _addNativeMarkers();
        });

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
    );
}

/// 标记点击监听器
class _MarkerClickListener extends OnPointAnnotationClickListener {

  _MarkerClickListener({
    required this.spots,
    required this.onMarkerTap,
  });
  final List<Spot> spots;
  final void Function(Spot) onMarkerTap;

  @override
  void onPointAnnotationClick(PointAnnotation annotation) {
    // 通过坐标找到对应的 spot
    final clickedCoords = annotation.geometry.coordinates;

    for (final spot in spots) {
      if ((spot.longitude - clickedCoords.lng).abs() < 0.0001 &&
          (spot.latitude - clickedCoords.lat).abs() < 0.0001) {
        onMarkerTap(spot);
        break;
      }
    }
  }
}
