import 'dart:async';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';

/// 相册地点地图页面 - 显示某个相册（城市）下的所有地点
class AlbumSpotsMapPage extends ConsumerStatefulWidget {
  const AlbumSpotsMapPage({
    required this.city,
    required this.albumTitle,
    super.key,
  });

  final String city; // 城市名称，如 "Copenhagen"
  final String albumTitle; // 相册标题，如 "3 day in copenhagen"

  @override
  ConsumerState<AlbumSpotsMapPage> createState() => _AlbumSpotsMapPageState();
}

class _AlbumSpotsMapPageState extends ConsumerState<AlbumSpotsMapPage> {
  static const double _markerChipMaxWidth = 140;
  static const double _markerChipHeight = 40;
  static const double _markerChipHorizontalAnchor = 60;
  static const double _markerChipVerticalAnchor = 20;
  static const double _markerHorizontalMargin = 16;
  static const double _markerVerticalMargin = 16;
  static const double _appBarContentHeight = 48;
  static const double _appBarVerticalPadding = 12;
  static const double _bottomCardHeight = 260;
  static const double _bottomCardBottomInset = 40;

  MapboxMap? _mapboxMap;
  final PageController _cardPageController =
      PageController(viewportFraction: 0.85);
  int _currentCardIndex = 0;
  List<Spot> _citySpots = [];
  Spot? _selectedSpot;

  // 缓存每个地点的屏幕坐标
  final Map<String, ScreenCoordinate> _spotScreenCoordinates = {};
  bool _isUpdatingMarkers = false;
  bool _markersNeedUpdate = true;
  Timer? _updateMarkersTimer;
  bool _isProgrammaticMove = false; // 标记是否为程序触发的地图移动

  @override
  void initState() {
    super.initState();
    _loadCitySpots();

    // 监听卡片滑动，同步更新地图中心
    _cardPageController.addListener(_onCardPageChanged);
  }

  @override
  void dispose() {
    _cardPageController.removeListener(_onCardPageChanged);
    _cardPageController.dispose();
    _updateMarkersTimer?.cancel();
    super.dispose();
  }

  void _onCardPageChanged() {
    if (!_cardPageController.hasClients) return;

    final page = _cardPageController.page?.round();
    if (page != null && page != _currentCardIndex && page < _citySpots.length) {
      setState(() {
        _currentCardIndex = page;
        _selectedSpot = _citySpots[page];
      });
      _markersNeedUpdate = true;

      // 检查地点是否已在安全可见区域内
      if (_selectedSpot != null) {
        _moveMapToSpotIfNeeded(_selectedSpot!);
      }
    }
  }

  void _loadCitySpots() {
    // 从 mock 数据中获取对应城市的地点（不区分大小写）
    final allSpots = _buildMockSpots();

    print('🔍 尝试加载城市: ${widget.city}');
    print('📊 可用城市列表: ${allSpots.keys.toList()}');

    // 尝试精确匹配
    _citySpots = allSpots[widget.city] ?? [];

    // 如果精确匹配失败，尝试不区分大小写匹配
    if (_citySpots.isEmpty) {
      final cityLower = widget.city.toLowerCase();
      for (final entry in allSpots.entries) {
        if (entry.key.toLowerCase() == cityLower) {
          _citySpots = entry.value;
          print('✅ 找到匹配城市: ${entry.key}，地点数量: ${_citySpots.length}');
          break;
        }
      }
    } else {
      print('✅ 精确匹配成功，地点数量: ${_citySpots.length}');
    }

    if (_citySpots.isEmpty) {
      print('❌ 未找到城市 ${widget.city} 的地点数据');
    }

    if (_citySpots.isNotEmpty) {
      _selectedSpot = _citySpots[0];
      _markersNeedUpdate = true;
    }
  }

  Position? _getCityCenter() {
    if (_citySpots.isEmpty) return null;

    // 计算所有地点的中心点
    double totalLat = 0;
    double totalLng = 0;
    for (final spot in _citySpots) {
      totalLat += spot.latitude;
      totalLng += spot.longitude;
    }

    return Position(
      totalLng / _citySpots.length,
      totalLat / _citySpots.length,
    );
  }

  double _getInitialZoom() {
    if (_citySpots.length <= 3) return 13.0;
    if (_citySpots.length <= 10) return 12.0;
    return 11.5;
  }

  void _onMarkerTapped(Spot spot) {
    final index = _citySpots.indexOf(spot);
    if (index == -1) return;

    if (index == _currentCardIndex) {
      _markersNeedUpdate = true;
      unawaited(_moveMapToSpotIfNeeded(spot));
      return;
    }

    _cardPageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeInOut,
    );
  }

  Rect _markerCenterSafeRect(ui.Size screenSize) {
    final mediaQuery = MediaQuery.of(context);
    final paddingTop = mediaQuery.padding.top;
    final paddingBottom = mediaQuery.padding.bottom;

    final double titleBarHeight = paddingTop +
        _appBarVerticalPadding +
        _appBarContentHeight +
        _appBarVerticalPadding;

    final double safeTop =
        titleBarHeight + _markerVerticalMargin + _markerChipHeight / 2;

    final double reservedBottom = (_citySpots.isNotEmpty
            ? _bottomCardHeight + _bottomCardBottomInset
            : _markerVerticalMargin) +
        paddingBottom;
    final double safeBottom = (screenSize.height - reservedBottom) -
        _markerVerticalMargin -
        _markerChipHeight / 2;

    final double safeLeft = _markerHorizontalMargin + _markerChipMaxWidth / 2;
    final double safeRight =
        screenSize.width - _markerHorizontalMargin - _markerChipMaxWidth / 2;

    if (safeRight <= safeLeft || safeBottom <= safeTop) {
      final centerX = screenSize.width / 2;
      final centerY = screenSize.height / 2;
      return Rect.fromLTRB(centerX, centerY, centerX, centerY);
    }

    return Rect.fromLTRB(safeLeft, safeTop, safeRight, safeBottom);
  }

  // 检查地点是否位于安全可见区域内
  bool _isSpotInVisibleArea(Spot spot) {
    final screenCoord = _spotScreenCoordinates[spot.id];
    if (screenCoord == null) return false;

    final ui.Size screenSize = MediaQuery.of(context).size;
    final safeRect = _markerCenterSafeRect(screenSize);
    final point = Offset(screenCoord.x, screenCoord.y);

    return safeRect.contains(point);
  }

  // 只在地点不在可见区域时才移动地图
  Future<void> _moveMapToSpotIfNeeded(Spot spot) async {
    if (_mapboxMap == null) return;

    if (_isSpotInVisibleArea(spot)) {
      return;
    }

    final map = _mapboxMap!;
    final ui.Size screenSize = MediaQuery.of(context).size;
    final safeRect = _markerCenterSafeRect(screenSize);
    final spotPoint =
        Point(coordinates: Position(spot.longitude, spot.latitude));

    ScreenCoordinate spotScreenCoord;
    try {
      spotScreenCoord = await map.pixelForCoordinate(spotPoint);
    } catch (e) {
      print('❌ 获取地点屏幕坐标失败: $e');
      return;
    }

    _spotScreenCoordinates[spot.id] = spotScreenCoord;

    final double targetX =
        spotScreenCoord.x.clamp(safeRect.left, safeRect.right).toDouble();
    final double targetY =
        spotScreenCoord.y.clamp(safeRect.top, safeRect.bottom).toDouble();

    if ((targetX - spotScreenCoord.x).abs() <= 1 &&
        (targetY - spotScreenCoord.y).abs() <= 1) {
      return;
    }

    final double deltaX = spotScreenCoord.x - targetX;
    final double deltaY = spotScreenCoord.y - targetY;

    final ScreenCoordinate offsetScreenCoord = ScreenCoordinate(
      x: (screenSize.width / 2 + deltaX)
          .clamp(0.0, screenSize.width)
          .toDouble(),
      y: (screenSize.height / 2 + deltaY)
          .clamp(0.0, screenSize.height)
          .toDouble(),
    );

    Point? newCenter;
    try {
      newCenter = await map.coordinateForPixel(offsetScreenCoord);
    } catch (e) {
      print('❌ 计算地图中心失败: $e');
      return;
    }

    _isProgrammaticMove = true;
    _markersNeedUpdate = true;
    try {
      await map.flyTo(
        CameraOptions(center: newCenter),
        MapAnimationOptions(duration: 500),
      );
    } catch (e) {
      print('❌ 调整地图位置失败: $e');
    } finally {
      _isProgrammaticMove = false;
      if (mounted) {
        _markersNeedUpdate = true;
        await _updateMarkerCoordinates();
      }
    }
  }

  void _onSpotCardTapped(Spot spot) {
    // 点击卡片时，将该地点移动到地图中心（C位）
    final spotIndex = _citySpots.indexOf(spot);
    if (spotIndex == -1) return;

    if (spotIndex != _currentCardIndex) {
      _cardPageController.animateToPage(
        spotIndex,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
      return;
    }

    if (_selectedSpot?.id != spot.id) {
      setState(() => _selectedSpot = spot);
    }

    if (!_isSpotInVisibleArea(spot)) {
      _markersNeedUpdate = true;
      unawaited(_moveMapToSpotIfNeeded(spot));
    }

    _showSpotDetail(spot);
  }

  void _showSpotDetail(Spot spot) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => SpotDetailModal(spot: spot),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cityCenter = _getCityCenter();

    return Scaffold(
      body: Stack(
        children: [
          // 全屏地图
          if (cityCenter != null)
            MapWidget(
              key: const ValueKey('album-map-widget'),
              cameraOptions: CameraOptions(
                center: Point(coordinates: cityCenter),
                zoom: _getInitialZoom(),
              ),
              onMapCreated: _onMapCreated,
              onCameraChangeListener: (_) {
                // 如果是程序触发的移动，跳过更新
                if (_isProgrammaticMove) return;

                // 使用防抖机制，避免频繁更新
                _updateMarkersTimer?.cancel();
                _markersNeedUpdate = true;
                _updateMarkersTimer =
                    Timer(const Duration(milliseconds: 150), () {
                  if (mounted) {
                    setState(() {});
                  }
                });
              },
            )
          else
            const Center(child: Text('No spots found')),

          // 地点标记层（使用 LayoutBuilder 获取屏幕尺寸）
          if (_citySpots.isNotEmpty)
            LayoutBuilder(
              builder: (context, constraints) {
                return Stack(
                  children: _buildSpotMarkers(
                    constraints.maxWidth,
                    constraints.maxHeight,
                  ),
                );
              },
            ),

          // 顶部导航栏
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: _buildAppBar(),
          ),

          // 底部地点卡片滑动列表（放在最上层）
          if (_citySpots.isNotEmpty)
            Positioned(
              bottom: 40,
              left: 0,
              right: 0,
              child: _buildBottomCards(),
            ),
        ],
      ),
    );
  }

  Widget _buildAppBar() {
    return Container(
      padding: EdgeInsets.only(
        top: MediaQuery.of(context).padding.top + 12,
        left: 16,
        right: 16,
        bottom: 12,
      ),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.white.withOpacity(0.95),
            Colors.white.withOpacity(0.0),
          ],
        ),
      ),
      child: Row(
        children: [
          IconButtonCustom(
            icon: Icons.arrow_back,
            onPressed: () => Navigator.of(context).pop(),
            backgroundColor: Colors.white,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  widget.albumTitle,
                  style: AppTheme.headlineMedium(context),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  '${_citySpots.length} spots in ${widget.city}',
                  style: AppTheme.labelMedium(context).copyWith(
                    color: AppTheme.mediumGray,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomCards() {
    return SizedBox(
      height: 260,
      child: PageView.builder(
        controller: _cardPageController,
        itemCount: _citySpots.length,
        itemBuilder: (context, index) {
          final spot = _citySpots[index];
          final isCenter = index == _currentCardIndex;

          return AnimatedScale(
            scale: isCenter ? 1.0 : 0.92,
            duration: const Duration(milliseconds: 250),
            child: _BottomSpotCard(
              spot: spot,
              onTap: () => _onSpotCardTapped(spot),
            ),
          );
        },
      ),
    );
  }

  List<Widget> _buildSpotMarkers(double width, double height) {
    if (_mapboxMap == null) return [];

    // 异步更新标记位置坐标
    if (_markersNeedUpdate && !_isUpdatingMarkers) {
      _updateMarkerCoordinates();
    }

    final markers = <Widget>[];
    final selectedMarkers = <Widget>[];

    for (final spot in _citySpots) {
      final isSelected = spot.id == _selectedSpot?.id;
      final screenCoord = _spotScreenCoordinates[spot.id];

      // 如果屏幕坐标还未计算完成，跳过该标记
      if (screenCoord == null) continue;

      final marker = AnimatedPositioned(
        key: ValueKey('album-marker-${spot.id}'),
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeInOut,
        left: screenCoord.x - _markerChipHorizontalAnchor,
        top: screenCoord.y - _markerChipVerticalAnchor,
        child: GestureDetector(
          onTap: () => _onMarkerTapped(spot),
          child: _buildMarkerChip(spot, isSelected),
        ),
      );

      // 选中的标记放到单独的列表，最后添加（显示在最上层）
      if (isSelected) {
        selectedMarkers.add(marker);
      } else {
        markers.add(marker);
      }
    }

    // 选中的标记在最后添加，确保显示在最上层
    return [...markers, ...selectedMarkers];
  }

  // 使用 Mapbox API 更新所有地点的屏幕坐标
  Future<void> _updateMarkerCoordinates() async {
    if (_mapboxMap == null || _isUpdatingMarkers) return;

    _isUpdatingMarkers = true;

    try {
      final map = _mapboxMap!;
      final updatedCoordinates = <String, ScreenCoordinate>{};

      for (final spot in _citySpots) {
        final spotPosition =
            Point(coordinates: Position(spot.longitude, spot.latitude));
        final screenCoord = await map.pixelForCoordinate(spotPosition);
        updatedCoordinates[spot.id] = screenCoord;
      }

      // 坐标更新完成后重新渲染
      if (mounted) {
        setState(() {
          _spotScreenCoordinates
            ..clear()
            ..addAll(updatedCoordinates);
          _markersNeedUpdate = false;
        });
      }
    } catch (e) {
      print('❌ 更新标记坐标失败: $e');
    } finally {
      _isUpdatingMarkers = false;
    }
  }

  Widget _buildMarkerChip(Spot spot, bool isSelected) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: isSelected ? AppTheme.primaryYellow : Colors.white,
        borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
        border: Border.all(
          color: AppTheme.black,
          width: AppTheme.borderMedium,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.2),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            _getCategoryIcon(spot.category),
            size: 16,
            color: AppTheme.black,
          ),
          const SizedBox(width: 6),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 100),
            child: Text(
              spot.name,
              style: AppTheme.labelMedium(context),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

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
      default:
        return Icons.place;
    }
  }

  void _onMapCreated(MapboxMap mapboxMap) {
    _mapboxMap = mapboxMap;
    _markersNeedUpdate = true;

    unawaited(Future<void>.delayed(const Duration(milliseconds: 300), () async {
      if (!mounted) return;

      if (_selectedSpot != null) {
        await _moveMapToSpotIfNeeded(_selectedSpot!);
      } else {
        await _updateMarkerCoordinates();
      }
    }));
  }

  // Mock 数据 - 实际项目中应从 API 或 provider 获取
  Map<String, List<Spot>> _buildMockSpots() => {
        'Copenhagen': [
          // 3 Landmarks
          Spot(
            id: 'cph-nyhavn',
            name: 'Nyhavn Harbour',
            city: 'Copenhagen',
            category: 'Landmark',
            latitude: 55.6795,
            longitude: 12.5911,
            rating: 4.6,
            ratingCount: 3124,
            coverImage:
                'https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1564221710304-0b37c8b9d729?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Architecture', 'Harbor', 'History'],
            aiSummary:
                'Colorful 17th-century waterfront with restaurants, bars, and historic wooden ships.',
          ),
          Spot(
            id: 'cph-littlemermaid',
            name: 'The Little Mermaid',
            city: 'Copenhagen',
            category: 'Landmark',
            latitude: 55.6929,
            longitude: 12.5993,
            rating: 4.3,
            ratingCount: 4562,
            coverImage:
                'https://images.unsplash.com/photo-1564221710304-0b37c8b9d729?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1564221710304-0b37c8b9d729?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Landmark', 'Culture'],
            aiSummary:
                'Iconic bronze statue inspired by Hans Christian Andersen\'s fairy tale.',
          ),
          Spot(
            id: 'cph-roundtower',
            name: 'The Round Tower',
            city: 'Copenhagen',
            category: 'Landmark',
            latitude: 55.6816,
            longitude: 12.5732,
            rating: 4.6,
            ratingCount: 1395,
            coverImage:
                'https://images.unsplash.com/photo-1528909514045-2fa4ac7a08ba?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1528909514045-2fa4ac7a08ba?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Architecture', 'History'],
            aiSummary:
                '17th-century tower with spiral walkway offering city views and observatory.',
          ),

          // 2 Museums
          Spot(
            id: 'cph-rosenborg',
            name: 'Rosenborg Castle',
            city: 'Copenhagen',
            category: 'Museum',
            latitude: 55.6859,
            longitude: 12.5771,
            rating: 4.6,
            ratingCount: 2873,
            coverImage:
                'https://images.unsplash.com/photo-1529429617124-aee1e8fa5d14?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1529429617124-aee1e8fa5d14?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Museum', 'History', 'Architecture'],
            aiSummary:
                'Renaissance castle housing royal collections, crown jewels, and manicured palace gardens.',
          ),
          Spot(
            id: 'cph-nationalmuseum',
            name: 'National Museum',
            city: 'Copenhagen',
            category: 'Museum',
            latitude: 55.6745,
            longitude: 12.5736,
            rating: 4.6,
            ratingCount: 3214,
            coverImage:
                'https://images.unsplash.com/photo-1530023367847-a683933f4177?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1530023367847-a683933f4177?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Museum', 'History', 'Culture'],
            aiSummary:
                'Danish cultural history from prehistoric times to present day.',
          ),

          // 3 Parks
          Spot(
            id: 'cph-tivoli',
            name: 'Tivoli Gardens',
            city: 'Copenhagen',
            category: 'Park',
            latitude: 55.6738,
            longitude: 12.5681,
            rating: 4.7,
            ratingCount: 5892,
            coverImage:
                'https://images.unsplash.com/photo-1576675466133-4ef49e38c716?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1576675466133-4ef49e38c716?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Park', 'Entertainment'],
            aiSummary:
                'Famous amusement park with rides, gardens, and open-air stage shows since 1843.',
          ),
          Spot(
            id: 'cph-kings-garden',
            name: "The King's Garden",
            city: 'Copenhagen',
            category: 'Park',
            latitude: 55.6857,
            longitude: 12.5764,
            rating: 4.6,
            ratingCount: 3421,
            coverImage:
                'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Park', 'Nature'],
            aiSummary:
                'Historic baroque garden surrounding Rosenborg Castle with statues and lawns.',
          ),
          Spot(
            id: 'cph-botanical-garden',
            name: 'Botanical Garden',
            city: 'Copenhagen',
            category: 'Park',
            latitude: 55.6867,
            longitude: 12.5730,
            rating: 4.6,
            ratingCount: 2743,
            coverImage:
                'https://images.unsplash.com/photo-1455906876003-298dd8c44dd9?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1455906876003-298dd8c44dd9?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Park', 'Nature'],
            aiSummary:
                'Botanical gardens with historic Palm House and diverse plant collections.',
          ),

          // 2 Restaurants
          Spot(
            id: 'cph-noma',
            name: 'Noma',
            city: 'Copenhagen',
            category: 'Restaurant',
            latitude: 55.6881,
            longitude: 12.5999,
            rating: 4.8,
            ratingCount: 1234,
            coverImage:
                'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Food', 'Fine Dining'],
            aiSummary:
                'World-renowned New Nordic cuisine restaurant with seasonal tasting menus.',
          ),
          Spot(
            id: 'cph-torvehallerne',
            name: 'Torvehallerne Market',
            city: 'Copenhagen',
            category: 'Restaurant',
            latitude: 55.6832,
            longitude: 12.5715,
            rating: 4.6,
            ratingCount: 3876,
            coverImage:
                'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Food', 'Market'],
            aiSummary:
                'Glass-covered food market with Danish specialties and international cuisine.',
          ),

          // 3 Cafes
          Spot(
            id: 'cph-coffee-collective',
            name: 'Coffee Collective',
            city: 'Copenhagen',
            category: 'Cafe',
            latitude: 55.6823,
            longitude: 12.5713,
            rating: 4.6,
            ratingCount: 2341,
            coverImage:
                'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Coffee', 'Cafe'],
            aiSummary:
                'Specialty coffee roaster with multiple locations serving quality brews.',
          ),
          Spot(
            id: 'cph-democratic-coffee',
            name: 'Democratic Coffee',
            city: 'Copenhagen',
            category: 'Cafe',
            latitude: 55.6897,
            longitude: 12.5632,
            rating: 4.5,
            ratingCount: 1876,
            coverImage:
                'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Coffee', 'Cafe'],
            aiSummary:
                'Cozy coffee bar with house-roasted beans and minimalist Scandinavian design.',
          ),
          Spot(
            id: 'cph-granola',
            name: 'Granola',
            city: 'Copenhagen',
            category: 'Cafe',
            latitude: 55.6801,
            longitude: 12.5689,
            rating: 4.4,
            ratingCount: 2987,
            coverImage:
                'https://images.unsplash.com/photo-1543342386-1bb0e29017c4?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1543342386-1bb0e29017c4?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Cafe', 'Brunch'],
            aiSummary:
                'Vintage-inspired cafe serving hearty brunches and homemade pastries.',
          ),

          // 2 Bakeries
          Spot(
            id: 'cph-hart-bageri',
            name: 'Hart Bageri',
            city: 'Copenhagen',
            category: 'Bakery',
            latitude: 55.6734,
            longitude: 12.5456,
            rating: 4.7,
            ratingCount: 2876,
            coverImage:
                'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Bakery', 'Bread'],
            aiSummary:
                'Organic bakery known for exceptional sourdough and cinnamon rolls.',
          ),
          Spot(
            id: 'cph-andersen-bakery',
            name: 'Andersen & Maillard',
            city: 'Copenhagen',
            category: 'Bakery',
            latitude: 55.6845,
            longitude: 12.5623,
            rating: 4.6,
            ratingCount: 2134,
            coverImage:
                'https://images.unsplash.com/photo-1549454180-b6fba09aa286?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1549454180-b6fba09aa286?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Bakery', 'Bread'],
            aiSummary:
                'French-inspired bakery with authentic croissants and artisan bread.',
          ),
        ],
        'Porto': [
          Spot(
            id: 'porto-ribeira',
            name: 'Ribeira District',
            city: 'Porto',
            category: 'Landmark',
            latitude: 41.1413,
            longitude: -8.6140,
            rating: 4.7,
            ratingCount: 4231,
            coverImage:
                'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Architecture', 'History', 'Waterfront'],
            aiSummary:
                'Historic riverside neighborhood with colorful buildings and lively atmosphere.',
          ),
        ],
        'Paris': [
          Spot(
            id: 'paris-eiffel',
            name: 'Eiffel Tower',
            city: 'Paris',
            category: 'Landmark',
            latitude: 48.8584,
            longitude: 2.2945,
            rating: 4.7,
            ratingCount: 15234,
            coverImage:
                'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Landmark', 'Architecture'],
            aiSummary: 'Iconic iron lattice tower and symbol of Paris.',
          ),
        ],
        'Tokyo': [
          Spot(
            id: 'tokyo-sensoji',
            name: 'Sensō-ji Temple',
            city: 'Tokyo',
            category: 'Landmark',
            latitude: 35.7147,
            longitude: 139.7966,
            rating: 4.6,
            ratingCount: 8432,
            coverImage:
                'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['History', 'Culture'],
            aiSummary:
                'Tokyo\'s oldest Buddhist temple with vibrant atmosphere.',
          ),
        ],
        'Barcelona': [
          Spot(
            id: 'bcn-sagrada',
            name: 'Sagrada Familia',
            city: 'Barcelona',
            category: 'Landmark',
            latitude: 41.4036,
            longitude: 2.1744,
            rating: 4.8,
            ratingCount: 12453,
            coverImage:
                'https://images.unsplash.com/photo-1583422409516-2895a77efded?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1583422409516-2895a77efded?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Architecture', 'Gaudi'],
            aiSummary: 'Gaudí\'s unfinished basilica masterpiece.',
          ),
        ],
        'Amsterdam': [
          Spot(
            id: 'ams-annefrank',
            name: 'Anne Frank House',
            city: 'Amsterdam',
            category: 'Museum',
            latitude: 52.3752,
            longitude: 4.8836,
            rating: 4.7,
            ratingCount: 3722,
            coverImage:
                'https://images.unsplash.com/photo-1521540216272-a50305cd4421?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1521540216272-a50305cd4421?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['History', 'Museum'],
            aiSummary:
                'House and museum preserving Anne Frank\'s wartime hiding place.',
          ),
        ],
      };
}

/// 底部地点卡片组件
class _BottomSpotCard extends StatelessWidget {
  const _BottomSpotCard({
    required this.spot,
    required this.onTap,
  });

  final Spot spot;
  final VoidCallback onTap;

  IconData _getCategoryIconForSpot(String category) {
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
      default:
        return Icons.place;
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 8),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
          border:
              Border.all(color: AppTheme.black, width: AppTheme.borderMedium),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.1),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 封面图
            ClipRRect(
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(AppTheme.radiusMedium - 1),
              ),
              child: Image.network(
                spot.coverImage,
                height: 135,
                width: double.infinity,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                  height: 135,
                  color: AppTheme.lightGray,
                  child: const Icon(Icons.place,
                      size: 50, color: AppTheme.mediumGray),
                ),
              ),
            ),
            // 内容区
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // 标签
                    Wrap(
                      spacing: 6,
                      children: spot.tags.take(2).map((tag) {
                        return Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppTheme.primaryYellow.withOpacity(0.3),
                            borderRadius:
                                BorderRadius.circular(AppTheme.radiusSmall),
                            border:
                                Border.all(color: AppTheme.black, width: 0.5),
                          ),
                          child: Text(tag, style: AppTheme.labelSmall(context)),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 8),
                    // 地点名称（带分类图标）
                    Row(
                      children: [
                        Icon(
                          _getCategoryIconForSpot(spot.category),
                          size: 20,
                          color: AppTheme.black,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            spot.name,
                            style: AppTheme.bodyLarge(context).copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    // 评分
                    Row(
                      children: [
                        const Icon(Icons.star,
                            color: AppTheme.primaryYellow, size: 16),
                        const SizedBox(width: 4),
                        Text(
                          '${spot.rating}',
                          style: AppTheme.bodyMedium(context).copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(width: 4),
                        Text(
                          '(${spot.ratingCount})',
                          style: AppTheme.bodySmall(context).copyWith(
                            color: AppTheme.mediumGray,
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
    );
  }
}
