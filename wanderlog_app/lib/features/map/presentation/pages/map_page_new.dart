import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';

// Mock spot data model
class Spot {
  final String id;
  final String name;
  final String city;
  final String category;
  final double latitude;
  final double longitude;
  final double rating;
  final int ratingCount;
  final String coverImage;
  final List<String> images;
  final List<String> tags;
  final String? aiSummary;

  Spot({
    required this.id,
    required this.name,
    required this.city,
    required this.category,
    required this.latitude,
    required this.longitude,
    required this.rating,
    required this.ratingCount,
    required this.coverImage,
    required this.images,
    required this.tags,
    this.aiSummary,
  });
}

class MapPage extends ConsumerStatefulWidget {
  const MapPage({super.key});

  @override
  ConsumerState<MapPage> createState() => _MapPageState();
}

class _MapPageState extends ConsumerState<MapPage> {
  MapboxMap? _mapboxMap;
  String _selectedCity = 'Copenhagen';
  Spot? _selectedSpot;
  bool _isFullscreen = false;
  final TextEditingController _searchController = TextEditingController();
  final PageController _cardPageController =
      PageController(viewportFraction: 0.85);
  int _currentCardIndex = 0;

  final List<String> _cities = [
    'Copenhagen',
    'Berlin',
    'Porto',
    'Paris',
    'Tokyo',
    'Barcelona',
    'Amsterdam'
  ];

  final Map<String, Position> _cityCoordinates = {
    'Copenhagen': Position(12.5683, 55.6761),
    'Berlin': Position(13.4050, 52.5200),
    'Porto': Position(-8.6291, 41.1579),
    'Paris': Position(2.3522, 48.8566),
    'Tokyo': Position(139.6503, 35.6762),
    'Barcelona': Position(2.1686, 41.3874),
    'Amsterdam': Position(4.9041, 52.3676),
  };

  List<Spot> get _spots => [
        Spot(
          id: '1',
          name: 'Design Museum',
          city: 'Copenhagen',
          category: 'Museum',
          latitude: 55.6841,
          longitude: 12.5934,
          rating: 4.6,
          ratingCount: 295,
          coverImage:
              'https://images.unsplash.com/photo-1565967511849-76a60a516170?w=800',
          images: [
            'https://images.unsplash.com/photo-1565967511849-76a60a516170?w=800',
            'https://images.unsplash.com/photo-1580974852861-c381510bc98a?w=800',
            'https://images.unsplash.com/photo-1513519245088-0e3ad0b04d77?w=800',
          ],
          tags: ['Museum', 'Art', 'Architecture', 'Design'],
          aiSummary:
              'Visitors love the modern design, exhibitions, and atmosphere. A must-visit for design enthusiasts with rotating exhibits.',
        ),
        Spot(
          id: '2',
          name: 'Torvehallerne',
          city: 'Copenhagen',
          category: 'Food',
          latitude: 55.6839,
          longitude: 12.5702,
          rating: 4.5,
          ratingCount: 412,
          coverImage:
              'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800',
          images: [
            'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800',
            'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=800',
          ],
          tags: ['Food', 'Shopping', 'Market'],
          aiSummary:
              'Visitors love the fresh food, variety, and local atmosphere. Perfect spot for sampling Danish cuisine and local products.',
        ),
        Spot(
          id: '3',
          name: 'The Coffee Collective',
          city: 'Copenhagen',
          category: 'Coffee',
          latitude: 55.6819,
          longitude: 12.5778,
          rating: 4.7,
          ratingCount: 189,
          coverImage:
              'https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=800',
          images: [
            'https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=800',
            'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800',
          ],
          tags: ['Coffee', 'Cafe'],
          aiSummary:
              'Visitors love the quality coffee, friendly staff, and cozy vibe. One of the best specialty coffee spots in Copenhagen.',
        ),
        Spot(
          id: '4',
          name: 'Vor Frelsers Kirke',
          city: 'Copenhagen',
          category: 'Church',
          latitude: 55.6728,
          longitude: 12.5941,
          rating: 4.8,
          ratingCount: 521,
          coverImage:
              'https://images.unsplash.com/photo-1605106715994-18d3fecffb98?w=800',
          images: [
            'https://images.unsplash.com/photo-1605106715994-18d3fecffb98?w=800',
            'https://images.unsplash.com/photo-1519217812444-a8002ce4e296?w=800',
          ],
          tags: ['Church', 'Architecture', 'Historic'],
          aiSummary:
              'Visitors love the tower climb, views, and baroque architecture. The spiral staircase offers breathtaking views of Copenhagen.',
        ),
        Spot(
          id: '5',
          name: 'Nyhavn',
          city: 'Copenhagen',
          category: 'Attraction',
          latitude: 55.6798,
          longitude: 12.5912,
          rating: 4.7,
          ratingCount: 1250,
          coverImage:
              'https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?w=800',
          images: [
            'https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?w=800',
            'https://images.unsplash.com/photo-1564629876375-607ed50d0f6b?w=800',
          ],
          tags: ['Waterfront', 'Historic', 'Dining'],
          aiSummary:
              'Visitors love the colorful buildings, canal views, and vibrant atmosphere. Perfect for a stroll and dining by the water.',
        ),
        Spot(
          id: '6',
          name: 'Tivoli Gardens',
          city: 'Copenhagen',
          category: 'Park',
          latitude: 55.6738,
          longitude: 12.5681,
          rating: 4.6,
          ratingCount: 2843,
          coverImage:
              'https://images.unsplash.com/photo-1551269901-5c5e14c25df7?w=800',
          images: [
            'https://images.unsplash.com/photo-1551269901-5c5e14c25df7?w=800',
            'https://images.unsplash.com/photo-1594618547556-114f3c32d31c?w=800',
          ],
          tags: ['Park', 'Entertainment', 'Family'],
          aiSummary:
              'Visitors love the rides, gardens, and magical atmosphere. One of the oldest amusement parks in the world with beautiful gardens.',
        ),
        // Berlin spots
        Spot(
          id: '7',
          name: 'Brandenburg Gate',
          city: 'Berlin',
          category: 'Attraction',
          latitude: 52.5163,
          longitude: 13.3777,
          rating: 4.7,
          ratingCount: 3542,
          coverImage:
              'https://images.unsplash.com/photo-1560969184-10fe8719e047?w=800',
          images: [
            'https://images.unsplash.com/photo-1560969184-10fe8719e047?w=800',
            'https://images.unsplash.com/photo-1599946347371-68eb71b16afc?w=800',
          ],
          tags: ['Historic', 'Architecture', 'Landmark'],
          aiSummary:
              'Iconic 18th-century neoclassical monument and symbol of Berlin. A must-visit historical landmark.',
        ),
        Spot(
          id: '8',
          name: 'Museum Island',
          city: 'Berlin',
          category: 'Museum',
          latitude: 52.5210,
          longitude: 13.3983,
          rating: 4.8,
          ratingCount: 2156,
          coverImage:
              'https://images.unsplash.com/photo-1566463384861-0ebb800f4c0c?w=800',
          images: [
            'https://images.unsplash.com/photo-1566463384861-0ebb800f4c0c?w=800',
            'https://images.unsplash.com/photo-1584554226349-0e2e83d00605?w=800',
          ],
          tags: ['Museum', 'Art', 'Culture', 'Historic'],
          aiSummary:
              'UNESCO World Heritage site with five world-renowned museums. Art and culture lovers paradise.',
        ),
        Spot(
          id: '9',
          name: 'Tiergarten',
          city: 'Berlin',
          category: 'Park',
          latitude: 52.5144,
          longitude: 13.3501,
          rating: 4.6,
          ratingCount: 1823,
          coverImage:
              'https://images.unsplash.com/photo-1591269373071-e6cf8eda67b1?w=800',
          images: [
            'https://images.unsplash.com/photo-1591269373071-e6cf8eda67b1?w=800',
            'https://images.unsplash.com/photo-1513407030348-c983a97b98d8?w=800',
          ],
          tags: ['Park', 'Nature', 'Outdoor'],
          aiSummary:
              'Berlin\'s most popular inner-city park. Perfect for walking, cycling, and relaxing in nature.',
        ),
        Spot(
          id: '10',
          name: 'Kaffeebar',
          city: 'Berlin',
          category: 'Coffee',
          latitude: 52.5234,
          longitude: 13.4114,
          rating: 4.5,
          ratingCount: 412,
          coverImage:
              'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800',
          images: [
            'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800',
          ],
          tags: ['Coffee', 'Cafe'],
          aiSummary:
              'Cozy coffee shop with excellent espresso and friendly atmosphere. Local favorite.',
        ),
        Spot(
          id: '11',
          name: 'Berlin Cathedral',
          city: 'Berlin',
          category: 'Church',
          latitude: 52.5192,
          longitude: 13.4013,
          rating: 4.7,
          ratingCount: 1834,
          coverImage:
              'https://images.unsplash.com/photo-1599946347371-68eb71b16afc?w=800',
          images: [
            'https://images.unsplash.com/photo-1599946347371-68eb71b16afc?w=800',
          ],
          tags: ['Church', 'Architecture', 'Historic'],
          aiSummary:
              'Stunning baroque cathedral with dome access offering panoramic city views. Beautiful interior.',
        ),
      ];

  List<Spot> get _currentCitySpots {
    final filtered = _spots.where((s) => s.city == _selectedCity).toList();
    print(
        '_currentCitySpots: city=$_selectedCity, found ${filtered.length} spots');
    for (var spot in filtered) {
      print('  - ${spot.name} (${spot.city})');
    }
    return filtered;
  }

  List<Spot> get _nearbySpots {
    if (_selectedSpot == null) return [];

    final spots = _currentCitySpots;
    final currentIndex = spots.indexWhere((s) => s.id == _selectedSpot!.id);

    if (currentIndex == -1) return [];

    List<Spot> nearby = [];
    for (int i = -1; i <= 1; i++) {
      int index = (currentIndex + i) % spots.length;
      if (index < 0) index += spots.length;
      nearby.add(spots[index]);
    }

    return nearby;
  }

  @override
  void initState() {
    super.initState();
    _cardPageController.addListener(() {
      final page = _cardPageController.page?.round() ?? 0;
      if (page != _currentCardIndex) {
        setState(() {
          _currentCardIndex = page;
          if (_nearbySpots.isNotEmpty && page < _nearbySpots.length) {
            _selectedSpot = _nearbySpots[page];
          }
        });
      }
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    _cardPageController.dispose();
    super.dispose();
  }

  void _updateCamera() {
    if (_mapboxMap != null) {
      _mapboxMap!.flyTo(
        CameraOptions(
          center: Point(coordinates: _cityCoordinates[_selectedCity]!),
          zoom: 13.0,
        ),
        MapAnimationOptions(duration: 1000),
      );
    }
  }

  void _onSpotTapped(Spot spot) {
    setState(() {
      _selectedSpot = spot;
      _isFullscreen = true;
      _currentCardIndex = 1;
      Future.delayed(const Duration(milliseconds: 100), () {
        _cardPageController.jumpToPage(1);
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    // 调试信息
    print('Current city: $_selectedCity');
    print('Current city spots count: ${_currentCitySpots.length}');

    // 全屏模式下，地图完全覆盖，不使用 SafeArea
    if (_isFullscreen) {
      return Scaffold(
        backgroundColor: Colors.white,
        body: Stack(
          children: [
            // 地图层 - 铺满整个屏幕
            Positioned.fill(
              child: MapWidget(
                key: const ValueKey('mapWidget'),
                cameraOptions: CameraOptions(
                  center: Point(coordinates: _cityCoordinates[_selectedCity]!),
                  zoom: 13.0,
                ),
                onMapCreated: (MapboxMap mapboxMap) {
                  _mapboxMap = mapboxMap;
                },
              ),
            ),

            // Spot 标记层
            ..._buildSpotMarkers(),

            // 顶部工具栏
            Positioned(
              top: 50,
              left: 16,
              child: _CitySelector(
                selectedCity: _selectedCity,
                cities: _cities,
                onCityChanged: (city) {
                  setState(() {
                    _selectedCity = city;
                    _selectedSpot = null;
                  });
                  _updateCamera();
                },
              ),
            ),

            // 搜索框和相机按钮
            Positioned(
              top: 50,
              left: 140,
              right: 80,
              child: Container(
                height: 44,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                  border: Border.all(
                    color: AppTheme.black,
                    width: AppTheme.borderMedium,
                  ),
                ),
                child: Row(
                  children: [
                    const SizedBox(width: 12),
                    const Icon(
                      Icons.search,
                      size: 20,
                      color: AppTheme.mediumGray,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: _searchController,
                        style: AppTheme.bodyMedium(context),
                        decoration: InputDecoration(
                          hintText: 'Find your interest',
                          hintStyle: AppTheme.bodySmall(context).copyWith(
                            color: AppTheme.mediumGray,
                          ),
                          border: InputBorder.none,
                          contentPadding: const EdgeInsets.symmetric(
                            vertical: 12,
                          ),
                        ),
                      ),
                    ),
                    const Icon(
                      Icons.photo_camera,
                      size: 20,
                      color: AppTheme.mediumGray,
                    ),
                    const SizedBox(width: 12),
                  ],
                ),
              ),
            ),

            // 全屏退出按钮
            Positioned(
              top: 50,
              right: 16,
              child: IconButtonCustom(
                icon: Icons.fullscreen_exit,
                onPressed: () {
                  setState(() {
                    _isFullscreen = false;
                    _selectedSpot = null;
                  });
                },
                backgroundColor: Colors.white,
              ),
            ),

            // 标签筛选栏
            Positioned(
              top: 110,
              left: 0,
              right: 0,
              child: Container(
                height: 40,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount:
                      ['Museum', 'Coffee', 'Church', 'Architecture'].length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (context, index) {
                    final tags = ['Museum', 'Coffee', 'Church', 'Architecture'];
                    final tag = tags[index];
                    final icon = index == 0
                        ? '🎨'
                        : index == 1
                            ? '☕'
                            : index == 2
                                ? '⛪'
                                : '🏛️';
                    return Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius:
                            BorderRadius.circular(AppTheme.radiusMedium),
                        border: Border.all(
                          color: AppTheme.black,
                          width: AppTheme.borderMedium,
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(icon, style: const TextStyle(fontSize: 16)),
                          const SizedBox(width: 6),
                          Text(
                            tag,
                            style: AppTheme.labelMedium(context),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ),

            // 底部地点卡片轮播
            if (_selectedSpot != null && _nearbySpots.isNotEmpty)
              Positioned(
                bottom: 80,
                left: 0,
                right: 0,
                child: SizedBox(
                  height: 200,
                  child: PageView.builder(
                    controller: _cardPageController,
                    itemCount: _nearbySpots.length,
                    itemBuilder: (context, index) {
                      final spot = _nearbySpots[index];
                      final isCenter = index == 1;
                      return AnimatedScale(
                        scale: isCenter ? 1.0 : 0.9,
                        duration: const Duration(milliseconds: 300),
                        child: _BottomSpotCard(
                          spot: spot,
                          onTap: () => _showSpotDetail(spot),
                        ),
                      );
                    },
                  ),
                ),
              ),
          ],
        ),
      );
    }

    // 非全屏模式
    return Scaffold(
      backgroundColor: Colors.white,
      body: Stack(
        children: [
          // 地图层 - 铺满整个屏幕
          Positioned.fill(
            child: MapWidget(
              key: const ValueKey('mapWidget'),
              cameraOptions: CameraOptions(
                center: Point(coordinates: _cityCoordinates[_selectedCity]!),
                zoom: 13.0,
              ),
              onMapCreated: (MapboxMap mapboxMap) {
                _mapboxMap = mapboxMap;
              },
            ),
          ),

          // Spot 标记层
          ..._buildSpotMarkers(),

          // UI 控制层
          SafeArea(
            child: Column(
              children: [
                // 顶部控制栏
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      _CitySelector(
                        selectedCity: _selectedCity,
                        cities: _cities,
                        onCityChanged: (city) {
                          setState(() {
                            _selectedCity = city;
                            _selectedSpot = null;
                          });
                          _updateCamera();
                        },
                      ),
                      const Spacer(),
                      IconButtonCustom(
                        icon: Icons.fullscreen,
                        onPressed: () {
                          setState(() {
                            _isFullscreen = true;
                          });
                        },
                        backgroundColor: Colors.white,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildSpotMarkers() {
    final mapCenter = _cityCoordinates[_selectedCity]!;
    final screenWidth = MediaQuery.of(context).size.width;
    final screenHeight = MediaQuery.of(context).size.height;

    final spots = _currentCitySpots;
    print('Building markers for ${spots.length} spots');

    // 如果没有spots，显示调试信息
    if (spots.isEmpty) {
      print('WARNING: No spots found for city $_selectedCity');
      return [];
    }

    return spots.asMap().entries.map((entry) {
      final index = entry.key;
      final spot = entry.value;

      // 使用更精确的墨卡托投影近似
      final latDiff = spot.latitude - mapCenter.lat;
      final lngDiff = spot.longitude - mapCenter.lng;

      // 在zoom=13时，调整像素转换比例
      // 修正后的比例让标记显示在可见范围内
      final pixelsPerDegree = 8000.0;

      final dx = lngDiff * pixelsPerDegree;
      final dy = -latDiff * pixelsPerDegree; // 注意y轴方向相反

      final left = screenWidth / 2 + dx;
      final top = screenHeight / 2 + dy;

      print(
          'Marker ${index + 1}. ${spot.name}: lat=${spot.latitude}, lng=${spot.longitude}');
      print('  Diff: lat=$latDiff, lng=$lngDiff');
      print(
          '  Screen position: left=${left.toStringAsFixed(1)}, top=${top.toStringAsFixed(1)}');

      final isSelected = _selectedSpot?.id == spot.id;

      return Positioned(
        left: left - 60,
        top: top - 20,
        child: GestureDetector(
          onTap: () => _onSpotTapped(spot),
          child: Container(
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
                Text(
                  spot.name,
                  style: AppTheme.labelMedium(context),
                ),
              ],
            ),
          ),
        ),
      );
    }).toList();
  }

  IconData _getCategoryIcon(String category) {
    switch (category.toLowerCase()) {
      case 'museum':
        return Icons.museum;
      case 'coffee':
      case 'cafe':
        return Icons.coffee;
      case 'food':
      case 'restaurant':
        return Icons.restaurant;
      case 'church':
        return Icons.church;
      case 'park':
        return Icons.park;
      case 'attraction':
        return Icons.place;
      default:
        return Icons.location_on;
    }
  }

  void _showSpotDetail(Spot spot) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => SpotDetailModal(spot: spot),
    );
  }
}

class _CitySelector extends StatelessWidget {
  const _CitySelector({
    required this.selectedCity,
    required this.cities,
    required this.onCityChanged,
  });

  final String selectedCity;
  final List<String> cities;
  final ValueChanged<String> onCityChanged;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => _showCityPicker(context),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
          border:
              Border.all(color: AppTheme.black, width: AppTheme.borderMedium),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              selectedCity,
              style: AppTheme.labelLarge(context),
            ),
            const SizedBox(width: 4),
            const Icon(Icons.keyboard_arrow_down, size: 20),
          ],
        ),
      ),
    );
  }

  void _showCityPicker(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) => Container(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Select City', style: AppTheme.headlineMedium(context)),
            const SizedBox(height: 16),
            ...cities.map((city) => ListTile(
                  title: Text(city, style: AppTheme.bodyLarge(context)),
                  trailing: city == selectedCity
                      ? const Icon(Icons.check, color: AppTheme.primaryYellow)
                      : null,
                  onTap: () {
                    onCityChanged(city);
                    Navigator.pop(context);
                  },
                )),
          ],
        ),
      ),
    );
  }
}

class _BottomSpotCard extends StatelessWidget {
  const _BottomSpotCard({
    required this.spot,
    required this.onTap,
  });

  final Spot spot;
  final VoidCallback onTap;

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
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.horizontal(
                left: Radius.circular(AppTheme.radiusMedium - 1),
              ),
              child: Image.network(
                spot.coverImage,
                width: 120,
                height: 200,
                fit: BoxFit.cover,
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
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
                            border: Border.all(
                              color: AppTheme.black,
                              width: 0.5,
                            ),
                          ),
                          child: Text(
                            tag,
                            style: AppTheme.labelSmall(context),
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      spot.name,
                      style: AppTheme.bodyLarge(context).copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 8),
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

class SpotDetailModal extends StatefulWidget {
  const SpotDetailModal({super.key, required this.spot});

  final Spot spot;

  @override
  State<SpotDetailModal> createState() => _SpotDetailModalState();
}

class _SpotDetailModalState extends State<SpotDetailModal> {
  final PageController _imagePageController = PageController();
  int _currentImageIndex = 0;

  @override
  void dispose() {
    _imagePageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.85,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(24),
        ),
        border: Border.all(color: AppTheme.black, width: AppTheme.borderMedium),
      ),
      child: Column(
        children: [
          Stack(
            children: [
              SizedBox(
                height: 300,
                child: PageView.builder(
                  controller: _imagePageController,
                  onPageChanged: (index) {
                    setState(() {
                      _currentImageIndex = index;
                    });
                  },
                  itemCount: widget.spot.images.length,
                  itemBuilder: (context, index) {
                    return Container(
                      decoration: BoxDecoration(
                        borderRadius: const BorderRadius.vertical(
                          top: Radius.circular(24),
                        ),
                        image: DecorationImage(
                          image: NetworkImage(widget.spot.images[index]),
                          fit: BoxFit.cover,
                        ),
                      ),
                    );
                  },
                ),
              ),
              if (widget.spot.images.length > 1)
                Positioned(
                  bottom: 12,
                  left: 0,
                  right: 0,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(
                      widget.spot.images.length,
                      (index) => Container(
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: index == _currentImageIndex
                              ? AppTheme.primaryYellow
                              : Colors.white.withOpacity(0.5),
                          border: Border.all(color: AppTheme.black, width: 1),
                        ),
                      ),
                    ),
                  ),
                ),
              Positioned(
                top: 16,
                right: 16,
                child: IconButtonCustom(
                  icon: Icons.close,
                  onPressed: () => Navigator.pop(context),
                  backgroundColor: Colors.white,
                ),
              ),
            ],
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: widget.spot.tags.take(4).map((tag) {
                      return Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: AppTheme.primaryYellow.withOpacity(0.3),
                          borderRadius:
                              BorderRadius.circular(AppTheme.radiusSmall),
                          border: Border.all(
                            color: AppTheme.black,
                            width: AppTheme.borderMedium,
                          ),
                        ),
                        child: Text(tag, style: AppTheme.labelMedium(context)),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    widget.spot.name,
                    style: AppTheme.headlineLarge(context),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 16),
                  if (widget.spot.aiSummary != null) ...[
                    Text(
                      widget.spot.aiSummary!,
                      style: AppTheme.bodyLarge(context).copyWith(
                        color: AppTheme.darkGray,
                      ),
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 16),
                  ],
                  Row(
                    children: [
                      Text(
                        '${widget.spot.rating}',
                        style: AppTheme.headlineMedium(context).copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(width: 8),
                      ...List.generate(5, (index) {
                        return Icon(
                          index < widget.spot.rating.floor()
                              ? Icons.star
                              : (index < widget.spot.rating
                                  ? Icons.star_half
                                  : Icons.star_border),
                          color: AppTheme.primaryYellow,
                          size: 24,
                        );
                      }),
                      const SizedBox(width: 8),
                      Text(
                        '(${widget.spot.ratingCount})',
                        style: AppTheme.bodyMedium(context).copyWith(
                          color: AppTheme.mediumGray,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: PrimaryButton(
                      text: 'Add to Wishlist',
                      onPressed: () {
                        Navigator.pop(context);
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content:
                                Text('${widget.spot.name} added to wishlist!'),
                            backgroundColor: AppTheme.primaryYellow,
                            behavior: SnackBarBehavior.floating,
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
