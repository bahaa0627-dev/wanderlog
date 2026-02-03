import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/foundation.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/core/utils/category_emoji.dart';
import 'package:wanderlog/features/ai_recognition/data/models/search_v2_result.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart'
    as map_page show Spot, SpotSource;
import 'package:wanderlog/features/map/presentation/widgets/mapbox_spot_map.dart';
import 'package:wanderlog/shared/utils/number_format_utils.dart';
import 'package:wanderlog/shared/widgets/vago_placeholder.dart';

/// 推荐结果地图组件
///
/// Requirements: 10.3, 10.4, 10.5
/// - 显示所有推荐地点标记
/// - 支持缩放和滑动
/// - 右上角放大按钮支持全屏
class RecommendationMapView extends StatefulWidget {
  const RecommendationMapView({
    required this.places,
    this.height = 250,
    this.onPlaceTap,
    this.selectedPlace,
    this.onExpandTap,
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

  /// 放大按钮点击回调
  final VoidCallback? onExpandTap;

  @override
  State<RecommendationMapView> createState() => _RecommendationMapViewState();
}

map_page.Spot _placeToMapSpot(PlaceResult place) {
  final spotId = place.id ?? place.name;
  final tags = place.displayTagsEn ?? place.tags ?? const <String>[];
  final source = place.source == PlaceSource.ai
      ? map_page.SpotSource.ai
      : (place.source == PlaceSource.google
          ? map_page.SpotSource.google
          : map_page.SpotSource.cache);

  return map_page.Spot(
    id: spotId,
    name: place.name,
    city: place.city ?? '',
    country: place.country,
    category: tags.isNotEmpty ? tags.first : 'poi',
    latitude: place.latitude,
    longitude: place.longitude,
    rating: place.rating ?? 0.0,
    ratingCount: place.ratingCount ?? 0,
    coverImage: place.coverImage,
    images: place.images.isNotEmpty
        ? place.images
        : (place.coverImage.isNotEmpty ? [place.coverImage] : const []),
    tags: tags,
    displayTagsEn: place.displayTagsEn ?? const [],
    description: null,
    aiSummary: place.summary,
    isFromAI: place.source == PlaceSource.ai,
    isVerified: place.isVerified,
    recommendationPhrase: place.recommendationPhrase,
    source: source,
    address: place.address,
    phoneNumber: place.phoneNumber,
    website: place.website,
    openingHours: null,
    customFields: null,
  );
}

PlaceResult? _findPlaceBySpot(List<PlaceResult> places, map_page.Spot spot) {
  for (final place in places) {
    if ((place.id ?? place.name) == spot.id) {
      return place;
    }
  }
  return null;
}

class _RecommendationMapViewState extends State<RecommendationMapView> {
  final GlobalKey<MapboxSpotMapState> _mapKey = GlobalKey<MapboxSpotMapState>();
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
    debugPrint(
        '🗺️ [_calculateCameraPosition] Total places: ${widget.places.length}');
    for (final p in widget.places) {
      debugPrint(
          '🗺️ [_calculateCameraPosition] "${p.name}": lat=${p.latitude}, lng=${p.longitude}');
    }

    // 过滤掉无效坐标的地点（0, 0 是无效坐标）
    final validPlaces = widget.places
        .where((p) =>
            p.latitude != 0 &&
            p.longitude != 0 &&
            p.latitude.abs() > 0.0001 &&
            p.longitude.abs() > 0.0001)
        .toList();

    debugPrint(
        '🗺️ [_calculateCameraPosition] Valid places: ${validPlaces.length}');

    if (validPlaces.isEmpty) {
      // 如果没有有效坐标的地点，聚焦到第一个地点的城市（如果有）
      // 默认位置（北京）作为最终回退
      debugPrint(
          '🗺️ [_calculateCameraPosition] No valid places, using default (Beijing)');
      return (Position(116.4074, 39.9042), 10.0);
    }

    // 始终聚焦到第一个有效地点，避免多地点跨度大导致地图显示"外太空"
    // 用户可以手动平移/缩放查看其他地点
    final firstPlace = validPlaces.first;
    debugPrint(
        '🗺️ [_calculateCameraPosition] Focus on first place: ${firstPlace.name} at (${firstPlace.latitude}, ${firstPlace.longitude})');
    return (Position(firstPlace.longitude, firstPlace.latitude), 14.0);
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
          final annotation =
              await _createAnnotation(selectedPlace, isSelected: true);
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
    final cacheKey =
        '${truncatedName}_${isSelected ? 'selected' : 'default'}_${place.isVerified ? 'verified' : 'ai'}';

    final cached = _markerBitmapCache[cacheKey];
    if (cached != null) return cached;

    final Color markerColor =
        isSelected ? AppTheme.primaryYellow : Colors.white;
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
  // ignore: unused_element
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
        pitchEnabled: false, // 禁用倾斜
      );

      await map.gestures.updateSettings(settings);
    } catch (e) {
      print('❌ [RecommendationMap] 启用手势失败: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final (center, zoom) = _calculateCameraPosition();
    final spots = widget.places.map(_placeToMapSpot).toList();
    final selectedId = widget.selectedPlace?.id ?? widget.selectedPlace?.name;
    map_page.Spot? selectedSpot;
    if (selectedId != null) {
      for (final spot in spots) {
        if (spot.id == selectedId) {
          selectedSpot = spot;
          break;
        }
      }
    }

    return Container(
      height: widget.height,
      // 不设置 margin，让外层控制边距（和地点卡片保持一致）
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
            MapboxSpotMap(
              key: _mapKey,
              spots: spots,
              initialCenter: center,
              initialZoom: zoom,
              selectedSpot: selectedSpot,
              onSpotTap: (spot) {
                final place = _findPlaceBySpot(widget.places, spot);
                if (place != null) {
                  widget.onPlaceTap?.call(place);
                }
              },
              gestureRecognizers: <Factory<OneSequenceGestureRecognizer>>{
                Factory<OneSequenceGestureRecognizer>(
                    () => EagerGestureRecognizer()),
              },
            ),
            // 地图标题
            Positioned(
              top: 12,
              left: 12,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
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
            // 右上角放大按钮
            Positioned(
              top: 12,
              right: 12,
              child: GestureDetector(
                onTap: widget.onExpandTap ?? () => _openFullscreenMap(context),
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.95),
                    shape: BoxShape.circle,
                    border: Border.all(color: AppTheme.black, width: 1),
                  ),
                  child: const Icon(
                    Icons.fullscreen,
                    size: 20,
                    color: AppTheme.black,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// 打开全屏地图
  void _openFullscreenMap(BuildContext context) {
    Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (context) => _FullscreenRecommendationMap(
          places: widget.places,
          onPlaceTap: widget.onPlaceTap,
          selectedPlace: widget.selectedPlace,
        ),
      ),
    );
  }
}

/// 全屏推荐地图页面
class _FullscreenRecommendationMap extends StatefulWidget {
  const _FullscreenRecommendationMap({
    required this.places,
    this.onPlaceTap,
    this.selectedPlace,
  });

  final List<PlaceResult> places;
  final void Function(PlaceResult place)? onPlaceTap;
  final PlaceResult? selectedPlace;

  @override
  State<_FullscreenRecommendationMap> createState() =>
      _FullscreenRecommendationMapState();
}

class _FullscreenRecommendationMapState
    extends State<_FullscreenRecommendationMap> {
  final GlobalKey<MapboxSpotMapState> _mapKey = GlobalKey<MapboxSpotMapState>();
  MapboxMap? _mapboxMap;
  PointAnnotationManager? _pointAnnotationManager;
  final Map<String, Uint8List> _markerBitmapCache = {};
  final Map<String, PointAnnotation> _annotationsByPlaceId = {};
  final Map<String, PlaceResult> _placeByAnnotationId = {};
  PlaceResult? _selectedPlace;
  final PageController _cardPageController =
      PageController(viewportFraction: 0.55);
  bool _isExiting = false;

  /// 排序后的地点列表（数据库地点在前，AI 地点在后）
  late List<PlaceResult> _sortedPlaces;

  @override
  void initState() {
    super.initState();
    _sortedPlaces = _sortPlaces(widget.places);
    _selectedPlace = widget.selectedPlace;
    // 如果有初始选中的地点，找到它的索引
    if (_selectedPlace != null) {
      final index = _sortedPlaces.indexWhere(
        (p) => (p.id ?? p.name) == (_selectedPlace!.id ?? _selectedPlace!.name),
      );
      if (index >= 0) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (_cardPageController.hasClients) {
            _cardPageController.jumpToPage(index);
          }
        });
      }
    }
  }

  void _handleExit() {
    if (_isExiting) return;
    setState(() => _isExiting = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && Navigator.canPop(context)) {
        Navigator.of(context).pop();
      }
    });
  }

  @override
  void dispose() {
    _cardPageController.dispose();
    super.dispose();
  }

  /// 排序地点列表：优先有图的数据库地点，再有图的AI地点，最后无图的AI卡片（白底）
  List<PlaceResult> _sortPlaces(List<PlaceResult> places) {
    final dbPlacesWithImage = <PlaceResult>[];
    final dbPlacesNoImage = <PlaceResult>[];
    final aiPlacesWithImage = <PlaceResult>[];
    final aiPlacesNoImage = <PlaceResult>[];

    for (final place in places) {
      final hasImage = place.hasValidCoverImage;
      if (place.source == PlaceSource.ai) {
        if (hasImage) {
          aiPlacesWithImage.add(place);
        } else {
          aiPlacesNoImage.add(place);
        }
      } else {
        // cache 和 google 都归为数据库地点
        if (hasImage) {
          dbPlacesWithImage.add(place);
        } else {
          dbPlacesNoImage.add(place);
        }
      }
    }

    // 排序：有图数据库 > 有图AI > 无图数据库 > 无图AI（白底卡片）
    return [
      ...dbPlacesWithImage,
      ...aiPlacesWithImage,
      ...dbPlacesNoImage,
      ...aiPlacesNoImage,
    ];
  }

  /// 计算地图中心点和缩放级别
  (Position, double) _calculateCameraPosition() {
    // 过滤掉无效坐标的地点（0, 0 是无效坐标）
    // 使用排序后的列表，确保聚焦到第一个数据库地点
    final validPlaces = _sortedPlaces
        .where((p) =>
            p.latitude != 0 &&
            p.longitude != 0 &&
            p.latitude.abs() > 0.0001 &&
            p.longitude.abs() > 0.0001)
        .toList();

    if (validPlaces.isEmpty) {
      return (Position(116.4074, 39.9042), 10.0);
    }

    // 始终聚焦到第一个有效地点，避免多地点跨度大导致地图显示"外太空"
    // 用户可以手动平移/缩放查看其他地点
    final firstPlace = validPlaces.first;
    return (Position(firstPlace.longitude, firstPlace.latitude), 14.0);
  }

  // ignore: unused_element
  Future<void> _addMarkers() async {
    final manager = _pointAnnotationManager;
    if (manager == null) return;

    try {
      await manager.deleteAll();
      _annotationsByPlaceId.clear();
      _placeByAnnotationId.clear();

      if (_sortedPlaces.isEmpty) return;

      final selectedId = _selectedPlace?.id ?? _selectedPlace?.name;

      for (final place in _sortedPlaces) {
        final placeId = place.id ?? place.name;
        if (placeId == selectedId) continue;

        try {
          final annotation = await _createAnnotation(place, isSelected: false);
          _annotationsByPlaceId[placeId] = annotation;
          _placeByAnnotationId[annotation.id] = place;
        } catch (e) {
          print('⚠️ [FullscreenMap] 添加标记失败: ${place.name} - $e');
        }
      }

      if (selectedId != null) {
        final selectedPlace = _sortedPlaces.firstWhere(
          (p) => (p.id ?? p.name) == selectedId,
          orElse: () => _sortedPlaces.first,
        );
        try {
          final annotation =
              await _createAnnotation(selectedPlace, isSelected: true);
          _annotationsByPlaceId[selectedId] = annotation;
          _placeByAnnotationId[annotation.id] = selectedPlace;
        } catch (e) {
          print('⚠️ [FullscreenMap] 添加选中标记失败: $e');
        }
      }
    } catch (e) {
      print('❌ [FullscreenMap] 添加标记失败: $e');
    }
  }

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

  Future<Uint8List> _getMarkerBitmap(
    PlaceResult place, {
    required bool isSelected,
  }) async {
    final truncatedName = place.name.length > 10
        ? '${place.name.substring(0, 10)}...'
        : place.name;
    final cacheKey =
        '${truncatedName}_${isSelected ? 'selected' : 'default'}_${place.isVerified ? 'verified' : 'ai'}';

    final cached = _markerBitmapCache[cacheKey];
    if (cached != null) return cached;

    final Color markerColor =
        isSelected ? AppTheme.primaryYellow : Colors.white;
    final bitmap = await _createMarkerBitmap(
      place.name,
      markerColor,
      isSelected,
      isAI: !place.isVerified,
    );
    _markerBitmapCache[cacheKey] = bitmap;
    return bitmap;
  }

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

    final bgPaint = Paint()
      ..color = backgroundColor
      ..style = PaintingStyle.fill;

    final borderPaint = Paint()
      ..color = AppTheme.black
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5;

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

    final iconEmoji = isAI ? '✨' : '📍';

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

    final trianglePath = Path();
    const centerX = offsetX + markerWidth / 2;
    trianglePath.moveTo(centerX, markerHeight + 5);
    trianglePath.lineTo(centerX - 10, markerHeight + 5);
    trianglePath.lineTo(centerX, markerHeight + 15);
    trianglePath.lineTo(centerX + 10, markerHeight + 5);
    trianglePath.close();
    canvas.drawPath(trianglePath, bgPaint);
    canvas.drawPath(trianglePath, borderPaint);

    final picture = pictureRecorder.endRecording();
    final image = await picture.toImage(size, size);
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);

    return byteData!.buffer.asUint8List();
  }

  // ignore: unused_element
  Future<void> _enableMapGestures() async {
    final map = _mapboxMap;
    if (map == null) return;

    try {
      final settings = GesturesSettings(
        scrollEnabled: true,
        pinchToZoomEnabled: true,
        rotateEnabled: true,
        simultaneousRotateAndPinchToZoomEnabled: true,
        doubleTapToZoomInEnabled: true,
        doubleTouchToZoomOutEnabled: true,
        quickZoomEnabled: true,
      );

      await map.gestures.updateSettings(settings);
    } catch (e) {
      print('❌ [FullscreenMap] 启用手势失败: $e');
    }
  }

  void _handleMarkerTap(PlaceResult place) {
    final index = _sortedPlaces
        .indexWhere((p) => (p.id ?? p.name) == (place.id ?? place.name));
    if (index >= 0) {
      setState(() {
        _selectedPlace = place;
      });
      // 滚动到对应的卡片
      if (_cardPageController.hasClients) {
        _cardPageController.animateToPage(
          index,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeInOut,
        );
      }
      final target = Position(place.longitude, place.latitude);
      _mapKey.currentState?.jumpToPosition(target, zoom: 14.0);
    }
  }

  /// 卡片滑动时更新选中状态
  void _onCardPageChanged(int index) {
    if (index >= 0 && index < _sortedPlaces.length) {
      final place = _sortedPlaces[index];
      setState(() {
        _selectedPlace = place;
      });
      _mapKey.currentState?.jumpToPosition(
        Position(place.longitude, place.latitude),
        zoom: 14.0,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final (center, zoom) = _calculateCameraPosition();
    final topPadding = MediaQuery.of(context).padding.top;
    final spots = _sortedPlaces.map(_placeToMapSpot).toList();
    final selectedId = _selectedPlace?.id ?? _selectedPlace?.name;
    map_page.Spot? selectedSpot;
    if (selectedId != null) {
      for (final spot in spots) {
        if (spot.id == selectedId) {
          selectedSpot = spot;
          break;
        }
      }
    }

    // 检查是否所有地点都没有封面图
    final allWithoutCoverImage = _sortedPlaces.every(
      (p) => p.coverImage.isEmpty,
    );

    // 卡片尺寸 - 使用最大高度作为容器高度
    // 数据库地点（大图）: 280
    // AI 地点（白底）: 140
    // 无封面图: 140
    const cardWidth = 210.0;
    const maxCardHeight = 280.0; // 容器使用最大高度
    const aiCardHeight = 140.0; // AI 卡片高度

    return WillPopScope(
      onWillPop: () async {
        _handleExit();
        return false;
      },
      child: Scaffold(
        backgroundColor: Colors.white,
        body: Stack(
          clipBehavior: Clip.none,
          children: [
            // 全屏地图
            MapboxSpotMap(
              key: _mapKey,
              spots: spots,
              initialCenter: center,
              initialZoom: zoom,
              selectedSpot: selectedSpot,
              onSpotTap: (spot) {
                final place = _findPlaceBySpot(_sortedPlaces, spot);
                if (place != null) {
                  _handleMarkerTap(place);
                }
              },
              gestureRecognizers: <Factory<OneSequenceGestureRecognizer>>{
                Factory<OneSequenceGestureRecognizer>(
                    () => EagerGestureRecognizer()),
              },
            ),
            // 顶部返回按钮
            Positioned(
              top: topPadding + 12,
              left: 16,
              child: GestureDetector(
                onTap: _handleExit,
                child: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                    border: Border.all(color: AppTheme.black, width: 1.5),
                    boxShadow: AppTheme.cardShadow,
                  ),
                  child: const Icon(
                    Icons.arrow_back_ios_new,
                    size: 18,
                    color: AppTheme.black,
                  ),
                ),
              ),
            ),
            // 地点数量标签
            Positioned(
              top: topPadding + 12,
              right: 16,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppTheme.black, width: 1.5),
                  boxShadow: AppTheme.cardShadow,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.place, size: 16, color: AppTheme.black),
                    const SizedBox(width: 6),
                    Text(
                      '${_sortedPlaces.length} places',
                      style: AppTheme.bodySmall(context).copyWith(
                        fontWeight: FontWeight.w600,
                        color: AppTheme.black,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            // 底部横滑卡片列表 - 和其他地图页保持一致
            if (_sortedPlaces.isNotEmpty && !_isExiting)
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                height: maxCardHeight + 16,
                child: SafeArea(
                  top: false,
                  left: false,
                  right: false,
                  child: PageView.builder(
                    controller: _cardPageController,
                    clipBehavior: Clip.none,
                    onPageChanged: _onCardPageChanged,
                    itemCount: _sortedPlaces.length,
                    itemBuilder: (context, index) {
                      final place = _sortedPlaces[index];
                      final isSelected = (place.id ?? place.name) ==
                          (_selectedPlace?.id ?? _selectedPlace?.name);
                      // 根据来源和是否有图决定卡片高度
                      final isAIPlace = place.source == PlaceSource.ai;
                      // AI 地点有图时也使用大卡片高度
                      final useFullCard =
                          !isAIPlace || place.hasValidCoverImage;
                      final thisCardHeight =
                          (allWithoutCoverImage || !useFullCard)
                              ? aiCardHeight
                              : maxCardHeight;
                      return AnimatedScale(
                        scale: isSelected ? 1.0 : 0.92,
                        duration: const Duration(milliseconds: 250),
                        child: Align(
                          alignment: Alignment.bottomCenter,
                          child: SizedBox(
                            width: cardWidth,
                            height: thisCardHeight,
                            child: _BottomPlaceCard(
                              place: place,
                              onTap: () => widget.onPlaceTap?.call(place),
                              index: index,
                              isCompact: allWithoutCoverImage,
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// 底部地点卡片组件 - 全图+渐变覆盖样式（和其他地图页保持一致）
/// 支持紧凑模式（无封面图时）
class _BottomPlaceCard extends StatefulWidget {
  const _BottomPlaceCard({
    required this.place,
    required this.onTap,
    this.index,
    this.isCompact = false,
  });

  final PlaceResult place;
  final VoidCallback onTap;
  final int? index;
  final bool isCompact;

  @override
  State<_BottomPlaceCard> createState() => _BottomPlaceCardState();
}

class _BottomPlaceCardState extends State<_BottomPlaceCard> {
  Widget _buildCover() {
    const placeholder = VagoPlaceholderSmall();

    if (widget.place.coverImage.isEmpty) return placeholder;

    if (widget.place.coverImage.startsWith('data:')) {
      try {
        final base64Data = widget.place.coverImage.split(',').last;
        final bytes = base64Decode(base64Data);
        return Image.memory(
          Uint8List.fromList(bytes),
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => placeholder,
        );
      } catch (e) {
        return placeholder;
      }
    }
    return Image.network(
      widget.place.coverImage,
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => placeholder,
    );
  }

  /// 获取分类 emoji
  String _getCategoryEmoji() {
    final tags = widget.place.tags;
    if (tags != null && tags.isNotEmpty) {
      return getCategoryEmoji(tags.first);
    }
    return '📍';
  }

  @override
  Widget build(BuildContext context) {
    // 紧凑模式：无封面图时使用
    if (widget.isCompact) {
      return _buildCompactCard(context);
    }
    // AI 地点：有封面图时使用大图卡片，无封面图时使用白底紧凑卡片
    if (widget.place.source == PlaceSource.ai) {
      if (widget.place.hasValidCoverImage) {
        // AI 地点有图时，使用大图渐变样式（和数据库地点一致）
        return _buildFullCard(context);
      }
      // AI 地点无图时，使用白底紧凑卡片样式
      return _buildAIPlaceCard(context);
    }
    // 数据库地点使用大图渐变样式
    return _buildFullCard(context);
  }

  /// AI 地点卡片（白底+编号+评分样式）
  Widget _buildAIPlaceCard(BuildContext context) {
    final emoji = _getCategoryEmoji();
    final indexText = widget.index != null ? 'No.${widget.index! + 1}' : '';

    return GestureDetector(
      onTap: widget.onTap,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 6),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
          border:
              Border.all(color: AppTheme.black, width: AppTheme.borderMedium),
          boxShadow: AppTheme.cardShadow,
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // 分类 emoji + 编号
              Row(
                children: [
                  Text(emoji, style: const TextStyle(fontSize: 20)),
                  if (indexText.isNotEmpty) ...[
                    const SizedBox(width: 6),
                    Text(
                      indexText,
                      style: AppTheme.bodyMedium(context).copyWith(
                        color: AppTheme.black.withOpacity(0.7),
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 6),
              // 名称
              Text(
                widget.place.name,
                style: AppTheme.headlineMedium(context).copyWith(
                  color: AppTheme.black,
                  fontWeight: FontWeight.bold,
                  height: 1.2,
                  fontSize: 18,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 8),
              // 评分或推荐语
              if (widget.place.hasRating)
                Row(
                  children: [
                    const Icon(
                      Icons.star,
                      size: 16,
                      color: AppTheme.primaryYellow,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      widget.place.rating!.toStringAsFixed(1),
                      style: AppTheme.bodyMedium(context).copyWith(
                        color: AppTheme.black,
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                    if (widget.place.ratingCount != null) ...[
                      const SizedBox(width: 4),
                      Text(
                        formatRatingCount(widget.place.ratingCount),
                        style: AppTheme.bodySmall(context).copyWith(
                          color: AppTheme.black.withOpacity(0.7),
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ],
                )
              else if (widget.place.recommendationPhrase != null &&
                  widget.place.recommendationPhrase!.isNotEmpty)
                Row(
                  children: [
                    const Icon(
                      Icons.auto_awesome,
                      size: 14,
                      color: AppTheme.primaryYellow,
                    ),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        widget.place.recommendationPhrase!,
                        style: AppTheme.bodySmall(context).copyWith(
                          color: AppTheme.black.withOpacity(0.8),
                          fontWeight: FontWeight.w500,
                          fontSize: 12,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }

  /// 紧凑卡片（无封面图时）
  Widget _buildCompactCard(BuildContext context) {
    final emoji = _getCategoryEmoji();
    final indexText = widget.index != null ? 'No.${widget.index! + 1}' : '';

    return GestureDetector(
      onTap: widget.onTap,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 6),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
          border:
              Border.all(color: AppTheme.black, width: AppTheme.borderMedium),
          boxShadow: AppTheme.cardShadow,
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // 分类 emoji + 编号
              Row(
                children: [
                  Text(emoji, style: const TextStyle(fontSize: 20)),
                  if (indexText.isNotEmpty) ...[
                    const SizedBox(width: 6),
                    Text(
                      indexText,
                      style: AppTheme.bodyMedium(context).copyWith(
                        color: AppTheme.black.withOpacity(0.7),
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 6),
              // 名称
              Flexible(
                child: Text(
                  widget.place.name,
                  style: AppTheme.headlineMedium(context).copyWith(
                    color: AppTheme.black,
                    fontWeight: FontWeight.bold,
                    height: 1.2,
                    fontSize: 18,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(height: 6),
              // 评分或推荐语
              if (widget.place.hasRating)
                Row(
                  children: [
                    const Icon(
                      Icons.star,
                      size: 16,
                      color: AppTheme.primaryYellow,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      widget.place.rating!.toStringAsFixed(1),
                      style: AppTheme.bodyMedium(context).copyWith(
                        color: AppTheme.black,
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                    if (widget.place.ratingCount != null) ...[
                      const SizedBox(width: 4),
                      Text(
                        formatRatingCount(widget.place.ratingCount),
                        style: AppTheme.bodySmall(context).copyWith(
                          color: AppTheme.black.withOpacity(0.7),
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ],
                )
              else if (widget.place.recommendationPhrase != null &&
                  widget.place.recommendationPhrase!.isNotEmpty)
                Row(
                  children: [
                    const Icon(
                      Icons.auto_awesome,
                      size: 14,
                      color: AppTheme.primaryYellow,
                    ),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        widget.place.recommendationPhrase!,
                        style: AppTheme.bodySmall(context).copyWith(
                          color: AppTheme.black.withOpacity(0.8),
                          fontWeight: FontWeight.w500,
                          fontSize: 12,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }

  /// 完整卡片（数据库地点 - 大图+渐变覆盖样式）
  Widget _buildFullCard(BuildContext context) => GestureDetector(
        onTap: widget.onTap,
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 6),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
            border:
                Border.all(color: AppTheme.black, width: AppTheme.borderMedium),
            boxShadow: AppTheme.cardShadow,
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppTheme.radiusMedium - 1),
            child: Stack(
              fit: StackFit.expand,
              children: [
                _buildCover(),
                // 底部渐变蒙层
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: Container(
                    height: 140,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          Colors.black.withOpacity(0.3),
                          Colors.black.withOpacity(0.6),
                          Colors.black.withOpacity(0.85),
                        ],
                        stops: const [0.0, 0.3, 0.6, 1.0],
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.end,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          widget.place.name,
                          style: AppTheme.bodyLarge(context).copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            height: 1.2,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 6),
                        // 评分
                        if (widget.place.hasRating)
                          Row(
                            children: [
                              const Icon(
                                Icons.star,
                                size: 14,
                                color: AppTheme.primaryYellow,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                widget.place.rating!.toStringAsFixed(1),
                                style: AppTheme.bodySmall(context).copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              if (widget.place.ratingCount != null) ...[
                                const SizedBox(width: 4),
                                Text(
                                  formatRatingCount(widget.place.ratingCount),
                                  style: AppTheme.bodySmall(context).copyWith(
                                    color: Colors.white.withOpacity(0.8),
                                    fontSize: 11,
                                  ),
                                ),
                              ],
                            ],
                          )
                        else if (widget.place.recommendationPhrase != null)
                          Row(
                            children: [
                              const Icon(
                                Icons.auto_awesome,
                                size: 14,
                                color: AppTheme.primaryYellow,
                              ),
                              const SizedBox(width: 4),
                              Expanded(
                                child: Text(
                                  widget.place.recommendationPhrase!,
                                  style: AppTheme.bodySmall(context).copyWith(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w600,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
}

/// 标记点击监听器
// ignore: unused_element
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
