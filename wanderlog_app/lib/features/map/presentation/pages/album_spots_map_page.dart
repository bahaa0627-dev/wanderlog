import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart';
import 'package:wanderlog/features/map/presentation/widgets/mapbox_spot_map.dart';
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
  final GlobalKey<MapboxSpotMapState> _mapKey = GlobalKey<MapboxSpotMapState>();
  final PageController _cardPageController =
      PageController(viewportFraction: 0.85);
  int _currentCardIndex = 0;
  List<Spot> _citySpots = [];
  Spot? _selectedSpot;

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
    super.dispose();
  }

  void _onCardPageChanged() {
    if (!_cardPageController.hasClients) return;

    final page = _cardPageController.page?.round();
    if (page != null && page != _currentCardIndex && page < _citySpots.length) {
      final spot = _citySpots[page];
      setState(() {
        _currentCardIndex = page;
        _selectedSpot = spot;
      });

      // 移动地图到新选中的地点
      _mapKey.currentState?.animateCamera(
        Position(spot.longitude, spot.latitude),
      );
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
    }
  }

  Position? _getCityCenter() {
    if (_citySpots.isEmpty) return null;

    // 计算所有地点的中心
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

  @override
  Widget build(BuildContext context) {
    final cityCenter = _getCityCenter();

    return Scaffold(
      body: Stack(
        children: [
          // 全屏地图 - 使用共享组件
          if (cityCenter != null && _citySpots.isNotEmpty)
            MapboxSpotMap(
              key: _mapKey,
              spots: _citySpots,
              initialCenter: cityCenter,
              initialZoom: 13.0,
              selectedSpot: _selectedSpot,
              onSpotTap: _handleSpotTap,
            )
          else
            const Center(child: Text('No spots found')),

          // 顶部导航栏
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: _buildAppBar(),
          ),

          // 底部地点卡片滑动列表
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

  void _handleSpotTap(Spot spot) {
    final spotIndex = _citySpots.indexOf(spot);
    if (spotIndex == -1) return;

    setState(() => _selectedSpot = spot);

    if (spotIndex != _currentCardIndex) {
      _cardPageController.animateToPage(
        spotIndex,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
    }
  }

  void _showSpotDetail(Spot spot) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => SpotDetailModal(spot: spot),
    );
  }

  Widget _buildAppBar() => Container(
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

  Widget _buildBottomCards() => SizedBox(
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
              onTap: () {
                // 如果点击的是当前居中的卡片，打开详情
                // 如果点击的是其他卡片，只跳转到该卡片
                if (index == _currentCardIndex) {
                  _showSpotDetail(spot);
                } else {
                  _cardPageController.animateToPage(
                    index,
                    duration: const Duration(milliseconds: 300),
                    curve: Curves.easeInOut,
                  );
                }
              },
            ),
          );
        },
      ),
    );

  // Mock 数据 - 实际项目中应从 API 或 provider 获取
  Map<String, List<Spot>> _buildMockSpots() => {
        'Copenhagen': [
          Spot(
            id: 'cph-nyhavn',
            name: 'Nyhavn Harbour',
            city: 'Copenhagen',
            category: 'Waterfront',
            latitude: 55.6804,
            longitude: 12.5870,
            rating: 4.8,
            ratingCount: 3287,
            coverImage:
                'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Architecture', 'Food', 'History'],
            aiSummary:
                'Colorful 17th-century waterfront lined with ships, cafes, and lively outdoor terraces.',
          ),
          Spot(
            id: 'cph-rosenborg',
            name: 'Rosenborg Castle',
            city: 'Copenhagen',
            category: 'Museum',
            latitude: 55.6857,
            longitude: 12.5763,
            rating: 4.7,
            ratingCount: 1822,
            coverImage:
                'https://images.unsplash.com/photo-1511840636560-acee95b47a37?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1511840636560-acee95b47a37?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Museum', 'History', 'Architecture'],
            aiSummary:
                'Renaissance castle housing royal collections, crown jewels, and manicured palace gardens.',
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
                '17th-century astronomical observatory with a spiraling ramp and sweeping city views.',
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
  Widget build(BuildContext context) => GestureDetector(
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
                      size: 50, color: AppTheme.mediumGray,),
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
                      children: spot.tags.take(2).map((tag) => Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 5,),
                          decoration: BoxDecoration(
                            color: AppTheme.primaryYellow.withOpacity(0.3),
                            borderRadius:
                                BorderRadius.circular(AppTheme.radiusSmall),
                            border:
                                Border.all(color: AppTheme.black, width: 1.0),
                          ),
                          child: Text(tag, style: AppTheme.labelLarge(context)),
                        ),).toList(),
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
                            color: AppTheme.primaryYellow, size: 16,),
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
