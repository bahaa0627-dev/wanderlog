import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/ai_recognition/data/models/search_v2_result.dart';

/// 推荐结果地图组件
/// 
/// Requirements: 10.3, 10.4, 10.5
/// - 显示所有推荐地点标记
/// - 支持缩放
/// - 不支持搜索
class RecommendationMapView extends StatefulWidget {
  const RecommendationMapView({
    required this.places,
    this.height = 250,
    this.onPlaceTap,
    this.selectedPlace,
    super.key,
  });

  /// 推荐地点列表
  final List<PlaceResult> places;

  /// 地图高度
  final double height;

  /// 地点点击回调
  final void Function(PlaceResult place)? onPlaceTap;

  /// 当前选中的地点
  final PlaceResult? selectedPlace;

  @override
  State<RecommendationMapView> createState() => _RecommendationMapViewState();
}

class _RecommendationMapViewState extends State<RecommendationMapView> {
  MapboxMap? _mapboxMap;
  PointAnnotationManager? _pointAnnotationManager;
  final Map<String, Uint8List> _markerBitmapCache = {};
  final Map<String, PointAnnotation> _annotationsByPlaceId = {};
  final Map<String, PlaceResult> _placeByAnnotationId = {};
  bool _isMapReady = false;

  @override
  void didUpdateWidget(RecommendationMapView oldWidget) {
    super.didUpdateWidget(oldWidget);
    
    if (!_isMapReady) return;

    // 检查地点列表是否变化
    final oldPlaceIds = oldWidget.places.map((p) => p.id ?? p.name).toSet();
    final newPlaceIds = widget.places.map((p) => p.id ?? p.name).toSet();
    
    if (!_setsEqual(oldPlaceIds, newPlaceIds)) {
      _addMarkers();
    } else if (oldWidget.selectedPlace?.id != widget.selectedPlace?.id) {
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

  /// 计算地图中心点和缩放级别
  (Position, double) _calculateCameraPosition() {
    if (widget.places.isEmpty) {
      // 默认位置（北京）
      return (Position(116.4074, 39.9042), 10.0);
    }

    if (widget.places.length == 1) {
      final place = widget.places.first;
      return (Position(place.longitude, place.latitude), 14.0);
    }

    // 计算边界
    double minLat = double.infinity;
    double maxLat = double.negativeInfinity;
    double minLng = double.infinity;
    double maxLng = double.negativeInfinity;

    for (final place in widget.places) {
      if (place.latitude < minLat) minLat = place.latitude;
      if (place.latitude > maxLat) maxLat = place.latitude;
      if (place.longitude < minLng) minLng = place.longitude;
      if (place.longitude > maxLng) maxLng = place.longitude;
    }

    // 计算中心点
    final centerLat = (minLat + maxLat) / 2;
    final centerLng = (minLng + maxLng) / 2;

    // 计算缩放级别（基于边界范围）
    final latDiff = maxLat - minLat;
    final lngDiff = maxLng - minLng;
    final maxDiff = latDiff > lngDiff ? latDiff : lngDiff;

    double zoom;
    if (maxDiff < 0.01) {
      zoom = 15.0;
    } else if (maxDiff < 0.05) {
      zoom = 13.0;
    } else if (maxDiff < 0.1) {
      zoom = 12.0;
    } else if (maxDiff < 0.5) {
      zoom = 10.0;
    } else if (maxDiff < 1.0) {
      zoom = 9.0;
    } else if (maxDiff < 5.0) {
      zoom = 7.0;
    } else {
      zoom = 5.0;
    }

    return (Position(centerLng, centerLat), zoom);
  }

  /// 添加地图标记
  Future<void> _addMarkers() async {
    final manager = _pointAnnotationManager;
    if (manager == null) return;

    try {
      // 清除旧标记
      await manager.deleteAll();
      _annotationsByPlaceId.clear();
      _placeByAnnotationId.clear();

      if (widget.places.isEmpty) return;

      final selectedId = widget.selectedPlace?.id ?? widget.selectedPlace?.name;

      // 先添加未选中的标记
      for (final place in widget.places) {
        final placeId = place.id ?? place.name;
        if (placeId == selectedId) continue;

        try {
          final annotation = await _createAnnotation(place, isSelected: false);
          _annotationsByPlaceId[placeId] = annotation;
          _placeByAnnotationId[annotation.id] = place;
        } catch (e) {
          print('⚠️ [RecommendationMap] 添加标记失败: ${place.name} - $e');
        }
      }

      // 再添加选中标记（确保在最上层）
      if (selectedId != null) {
        final selectedPlace = widget.places.firstWhere(
          (p) => (p.id ?? p.name) == selectedId,
          orElse: () => widget.places.first,
        );
        try {
          final annotation = await _createAnnotation(selectedPlace, isSelected: true);
          _annotationsByPlaceId[selectedId] = annotation;
          _placeByAnnotationId[annotation.id] = selectedPlace;
        } catch (e) {
          print('⚠️ [RecommendationMap] 添加选中标记失败: $e');
        }
      }

      print('✅ [RecommendationMap] 已添加 ${_annotationsByPlaceId.length} 个标记');
    } catch (e) {
      print('❌ [RecommendationMap] 添加标记失败: $e');
    }
  }

  /// 创建标记注解
  Future<PointAnnotation> _createAnnotation(
    PlaceResult place, {
    required bool isSelected,
  }) async {
    final manager = _pointAnnotationManager!;
    final markerImage = await _getMarkerBitmap(place, isSelected: isSelected);

    final annotation = PointAnnotationOptions(
      geometry: Point(
        coordinates: Position(place.longitude, place.latitude),
      ),
      image: markerImage,
      iconAnchor: IconAnchor.BOTTOM,
      iconSize: isSelected ? 2.2 : 1.8,
      symbolSortKey: isSelected ? 1000.0 : 0.0,
    );

    return manager.create(annotation);
  }

  /// 获取标记位图
  Future<Uint8List> _getMarkerBitmap(
    PlaceResult place, {
    required bool isSelected,
  }) async {
    final truncatedName = place.name.length > 10 
        ? '${place.name.substring(0, 10)}...' 
        : place.name;
    final cacheKey = '${truncatedName}_${isSelected ? 'selected' : 'default'}_${place.isVerified ? 'verified' : 'ai'}';
    
    final cached = _markerBitmapCache[cacheKey];
    if (cached != null) return cached;

    final Color markerColor = isSelected ? AppTheme.primaryYellow : Colors.white;
    final bitmap = await _createMarkerBitmap(
      place.name,
      markerColor,
      isSelected,
      isAI: !place.isVerified,
    );
    _markerBitmapCache[cacheKey] = bitmap;
    return bitmap;
  }

  /// 创建自定义标记位图
  Future<Uint8List> _createMarkerBitmap(
    String title,
    Color backgroundColor,
    bool isSelected, {
    bool isAI = false,
  }) async {
    final ui.PictureRecorder pictureRecorder = ui.PictureRecorder();
    final Canvas canvas = Canvas(pictureRecorder);

    const int size = 220;
    const double markerWidth = 180.0;
    const double markerHeight = 50.0;
    const double iconSize = 22.0;
    const double iconPadding = 12.0;
    const double offsetX = 20.0;

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

    canvas.drawRRect(rrect, shadowPaint);
    canvas.drawRRect(rrect, bgPaint);
    canvas.drawRRect(rrect, borderPaint);

    // 获取图标 Emoji
    final iconEmoji = isAI ? '✨' : '📍';

    // 绘制 Emoji 图标
    final iconPainter = TextPainter(
      text: TextSpan(
        text: iconEmoji,
        style: const TextStyle(
          color: AppTheme.black,
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

    // 绘制文字
    final textPainter = TextPainter(
      text: TextSpan(
        text: title.length > 10 ? '${title.substring(0, 10)}...' : title,
        style: const TextStyle(
          color: AppTheme.black,
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

    // 画底部的小三角形
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

  /// 刷新选中标记
  Future<void> _refreshSelectedMarker() async {
    final manager = _pointAnnotationManager;
    if (manager == null || _annotationsByPlaceId.isEmpty) return;

    // 简单重建所有标记
    await _addMarkers();
  }

  /// 启用地图手势
  Future<void> _enableMapGestures() async {
    final map = _mapboxMap;
    if (map == null) return;

    try {
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
    } catch (e) {
      print('❌ [RecommendationMap] 启用手势失败: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final (center, zoom) = _calculateCameraPosition();

    return Container(
      height: widget.height,
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
        border: Border.all(color: AppTheme.black, width: AppTheme.borderMedium),
        boxShadow: AppTheme.cardShadow,
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppTheme.radiusMedium - 2),
        child: Stack(
          children: [
            // 地图
            MapWidget(
              key: const ValueKey('recommendation-map'),
              cameraOptions: CameraOptions(
                center: Point(coordinates: center),
                zoom: zoom,
              ),
              onMapCreated: (mapboxMap) async {
                _mapboxMap = mapboxMap;
                _pointAnnotationManager = await mapboxMap.annotations.createPointAnnotationManager();
                
                await _enableMapGestures();
                await _addMarkers();
                
                // 设置点击监听
                _pointAnnotationManager?.addOnPointAnnotationClickListener(
                  _MarkerClickListener(
                    onMarkerTap: (place) => widget.onPlaceTap?.call(place),
                    annotationPlaceResolver: (annotationId) => _placeByAnnotationId[annotationId],
                  ),
                );

                _isMapReady = true;
              },
            ),
            // 地图标题
            Positioned(
              top: 12,
              left: 12,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.95),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppTheme.black, width: 1),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.map, size: 16, color: AppTheme.black),
                    const SizedBox(width: 6),
                    Text(
                      '${widget.places.length} places',
                      style: AppTheme.bodySmall(context).copyWith(
                        fontWeight: FontWeight.w600,
                        color: AppTheme.black,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 标记点击监听器
class _MarkerClickListener extends OnPointAnnotationClickListener {
  _MarkerClickListener({
    required this.onMarkerTap,
    required this.annotationPlaceResolver,
  });

  final void Function(PlaceResult) onMarkerTap;
  final PlaceResult? Function(String annotationId) annotationPlaceResolver;

  @override
  void onPointAnnotationClick(PointAnnotation annotation) {
    final place = annotationPlaceResolver(annotation.id);
    if (place != null) {
      onMarkerTap(place);
    }
  }
}
