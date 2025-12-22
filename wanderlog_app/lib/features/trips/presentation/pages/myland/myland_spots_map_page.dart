import 'dart:convert';
import 'dart:typed_data';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart' hide Spot;
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart' as map_page show Spot;
import 'package:wanderlog/features/map/presentation/widgets/mapbox_spot_map.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';
import 'package:wanderlog/shared/models/spot_model.dart';
import 'package:wanderlog/shared/widgets/unified_spot_detail_modal.dart';

/// MyLand 地点地图页面 - 展示 MustGo 或 Today's Plan 中的地点
class MyLandSpotsMapPage extends ConsumerStatefulWidget {
  const MyLandSpotsMapPage({
    required this.cityName,
    required this.spots,
    required this.tabLabel,
    this.allCities = const [],
    this.allSpotsByCity = const {},
    this.onCityChanged,
    this.onDataChanged,
    this.visitedSpots,
    super.key,
  });

  final String cityName;
  final List<Spot> spots;
  final String tabLabel; // "MustGo" 或 "Today's Plan"
  final List<String> allCities; // 所有可选城市
  final Map<String, List<Spot>> allSpotsByCity; // 按城市分组的所有地点
  final ValueChanged<String>? onCityChanged;
  final VoidCallback? onDataChanged; // Callback when spot status changes
  final Map<String, bool>? visitedSpots; // spotId -> isVisited

  @override
  ConsumerState<MyLandSpotsMapPage> createState() => _MyLandSpotsMapPageState();
}

class _MyLandSpotsMapPageState extends ConsumerState<MyLandSpotsMapPage> {
  final GlobalKey<MapboxSpotMapState> _mapKey = GlobalKey<MapboxSpotMapState>();
  final PageController _cardPageController =
      PageController(viewportFraction: 0.55);
  final TextEditingController _searchController = TextEditingController();
  int _currentCardIndex = 0;
  List<map_page.Spot> _mapSpots = [];
  map_page.Spot? _selectedSpot;
  bool _skipNextRecenter = false;
  final Set<String> _selectedTags = {};
  late String _currentCity;
  late List<Spot> _currentSpots;

  @override
  void initState() {
    super.initState();
    _currentCity = widget.cityName;
    _currentSpots = widget.spots;
    _convertSpots();
    _cardPageController.addListener(_onCardPageChanged);
    
    // 默认选中第一个地点（最新的）
    if (_mapSpots.isNotEmpty) {
      _selectedSpot = _mapSpots.first;
      // 延迟跳转相机到选中的地点
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_selectedSpot != null) {
          _mapKey.currentState?.jumpToPosition(
            Position(_selectedSpot!.longitude, _selectedSpot!.latitude),
            zoom: 14.0,
          );
        }
      });
    }
  }

  @override
  void dispose() {
    _cardPageController.removeListener(_onCardPageChanged);
    _cardPageController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  /// 转换 Spot 模型到地图使用的格式
  void _convertSpots() {
    _mapSpots = _currentSpots.map((spot) => _convertSpot(spot)).toList();
    if (_mapSpots.isNotEmpty) {
      _selectedSpot = _mapSpots[0];
    }
  }

  /// 获取所有地点的分类和 tags 的并集
  List<String> _getAllUniqueTags() {
    final Set<String> tagSet = {};
    for (final spot in _currentSpots) {
      // 添加分类
      final category = spot.category?.trim() ?? '';
      if (category.isNotEmpty) {
        tagSet.add(category);
      }
      // 添加 tags
      for (final tag in spot.tags) {
        final normalized = tag.trim();
        if (normalized.isNotEmpty) {
          tagSet.add(normalized);
        }
      }
    }
    return tagSet.toList();
  }

  /// 根据选中的标签筛选地点
  List<map_page.Spot> get _filteredSpots {
    if (_selectedTags.isEmpty) {
      return _mapSpots;
    }
    return _mapSpots.where((spot) {
      final spotTags = spot.tags.map((t) => t.toLowerCase()).toSet();
      final categoryLower = spot.category.toLowerCase();
      return _selectedTags.any((tag) =>
          spotTags.contains(tag.toLowerCase()) ||
          categoryLower == tag.toLowerCase());
    }).toList();
  }

  map_page.Spot _convertSpot(Spot spot) {
    final List<String> imageList = spot.images;
    final String coverImg = imageList.isNotEmpty ? imageList.first : '';
    final List<String> tagList = spot.tags
        .map((e) => e.toString().trim())
        .where((e) => e.isNotEmpty)
        .toList();
    final String category = (spot.category ?? 'place').trim();
    if (category.isNotEmpty && !tagList.contains(category)) {
      tagList.add(category);
    }

    return map_page.Spot(
      id: spot.id,
      name: spot.name,
      city: spot.city ?? 'Unknown',
      category: category.isNotEmpty ? category : 'place',
      latitude: spot.latitude,
      longitude: spot.longitude,
      rating: spot.rating ?? 0.0,
      ratingCount: spot.ratingCount ?? 0,
      coverImage: coverImg,
      images: imageList,
      tags: tagList,
      aiSummary: null,
    );
  }

  void _onCardPageChanged() {
    if (!_cardPageController.hasClients) return;

    final page = _cardPageController.page?.round();
    final spots = _filteredSpots;
    if (page != null && page != _currentCardIndex && page < spots.length) {
      final spot = spots[page];
      setState(() {
        _currentCardIndex = page;
        _selectedSpot = spot;
      });

      if (_skipNextRecenter) {
        _skipNextRecenter = false;
        return;
      }

      final target = Position(spot.longitude, spot.latitude);
      _mapKey.currentState?.animateCamera(target);
    }
  }

  Position _getCenter() {
    // 如果有选中的地点，以选中地点为中心
    if (_selectedSpot != null) {
      return Position(_selectedSpot!.longitude, _selectedSpot!.latitude);
    }
    // 否则计算所有地点的中心
    if (_mapSpots.isNotEmpty) {
      double totalLat = 0;
      double totalLng = 0;
      for (final spot in _mapSpots) {
        totalLat += spot.latitude;
        totalLng += spot.longitude;
      }
      return Position(
        totalLng / _mapSpots.length,
        totalLat / _mapSpots.length,
      );
    }
    return Position(139.6503, 35.6762); // Tokyo as default
  }

  void _handleSpotTap(map_page.Spot spot) {
    final spots = _filteredSpots;
    final spotIndex = spots.indexOf(spot);
    if (spotIndex == -1) return;

    setState(() => _selectedSpot = spot);
    _skipNextRecenter = true;

    // Only recenter if the marker is likely obscured by the top chrome or
    // bottom cards. If it's in the safe band, selecting should not move camera.
    final mapState = _mapKey.currentState;
    if (mapState != null) {
      final target = Position(spot.longitude, spot.latitude);
      mapState
          .isPositionWithinVerticalSafeArea(
            target,
            topPaddingPx: 200,
            bottomPaddingPx: 320,
          )
          .then((isSafe) {
        if (!isSafe) {
          mapState.animateCamera(target);
        }
      });
    }

    if (spotIndex != _currentCardIndex) {
      _cardPageController.animateToPage(
        spotIndex,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
    }
  }

  void _showSpotDetail(map_page.Spot spot) {
    // Provide optimistic initial state to avoid flicker; modal will reconcile with API.
    final isMustGo = widget.tabLabel == 'MustGo';
    final isTodaysPlan = widget.tabLabel == "Today's Plan";

    showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => UnifiedSpotDetailModal(
        spot: spot,
        initialIsSaved: true,
        initialIsMustGo: isMustGo,
        initialIsTodaysPlan: isTodaysPlan,
      ),
    ).then((hasChanged) {
      // Only refresh if status actually changed
      if (hasChanged == true) {
        widget.onDataChanged?.call();
      }
    });
  }

  void _toggleTag(String tag) {
    setState(() {
      if (_selectedTags.contains(tag)) {
        _selectedTags.remove(tag);
      } else {
        _selectedTags.add(tag);
      }
      _currentCardIndex = 0;
    });
    
    // 跳转到第一个卡片
    if (_cardPageController.hasClients) {
      _cardPageController.jumpToPage(0);
    }
    
    // 如果有筛选后的地点，选中第一个
    final filtered = _filteredSpots;
    if (filtered.isNotEmpty) {
      setState(() {
        _selectedSpot = filtered.first;
      });
      // 移动相机到选中的地点
      _mapKey.currentState?.animateCamera(
        Position(filtered.first.longitude, filtered.first.latitude),
      );
    } else {
      setState(() {
        _selectedSpot = null;
      });
    }
  }

  /// 切换城市 - 在当前页面内更新数据
  void _switchCity(String newCity) {
    if (newCity == _currentCity) return;
    
    // 获取新城市的地点数据
    final newSpots = widget.allSpotsByCity[newCity] ?? <Spot>[];
    
    setState(() {
      _currentCity = newCity;
      _currentSpots = newSpots;
      _selectedTags.clear();
      _currentCardIndex = 0;
    });
    
    // 重新转换地点
    _convertSpots();
    
    // 跳转到第一个卡片
    if (_cardPageController.hasClients) {
      _cardPageController.jumpToPage(0);
    }
    
    // 移动相机到新城市的第一个地点
    if (_mapSpots.isNotEmpty) {
      final first = _mapSpots.first;
      setState(() {
        _selectedSpot = first;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _mapKey.currentState?.jumpToPosition(
          Position(first.longitude, first.latitude),
          zoom: 14.0,
        );
      });
    }
    
    // 通知父组件城市已切换
    widget.onCityChanged?.call(newCity);
  }

  void _showCityPicker() {
    if (widget.allCities.isEmpty) return;
    
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.5,
        minChildSize: 0.3,
        maxChildSize: 0.8,
        expand: false,
        builder: (context, scrollController) => Container(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Select City', style: AppTheme.headlineMedium(context)),
              const SizedBox(height: 16),
              Expanded(
                child: ListView.builder(
                  controller: scrollController,
                  itemCount: widget.allCities.length,
                  itemBuilder: (context, index) {
                    final city = widget.allCities[index];
                    return ListTile(
                      title: Text(city, style: AppTheme.bodyLarge(context)),
                      trailing: city == _currentCity
                          ? const Icon(Icons.check, color: AppTheme.primaryYellow)
                          : null,
                      onTap: () {
                        Navigator.pop(context);
                        _switchCity(city);
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// 获取标签对应的 emoji
  String _tagEmoji(String tag) {
    switch (tag.toLowerCase()) {
      case 'architecture':
        return '🏛️';
      case 'museum':
        return '🎨';
      case 'coffee':
      case 'cafe':
        return '☕';
      case 'food':
      case 'restaurant':
        return '🍽️';
      case 'nature':
      case 'park':
        return '🌿';
      case 'history':
        return '📜';
      case 'culture':
        return '🎭';
      case 'shopping':
        return '🛍️';
      case 'bar':
        return '🍷';
      case 'hotel':
        return '🏨';
      case 'landmark':
        return '🗼';
      case 'beach':
        return '🏖️';
      case 'temple':
      case 'church':
        return '⛪';
      case 'gallery':
        return '🖼️';
      case 'theater':
        return '🎭';
      case 'zoo':
        return '🐘';
      case 'aquarium':
        return '🐠';
      case 'library':
        return '📚';
      default:
        return '📍';
    }
  }

  @override
  Widget build(BuildContext context) {
    final cityCenter = _getCenter();
    final allTags = _getAllUniqueTags();
    final spots = _filteredSpots;

    return Scaffold(
      body: Stack(
        children: [
          // 全屏地图
          MapboxSpotMap(
            key: _mapKey,
            spots: spots,
            initialCenter: cityCenter,
            initialZoom: spots.isNotEmpty ? 14.0 : 10.0,
            selectedSpot: _selectedSpot,
            onSpotTap: _handleSpotTap,
            visitedSpots: widget.visitedSpots,
            cameraPadding: MbxEdgeInsets(
              top: 200,
              bottom: 320,
              left: 24,
              right: 24,
            ),
          ),

          // 顶部渐变遮罩
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: IgnorePointer(
              ignoring: true,
              child: Container(
                height: MediaQuery.of(context).padding.top + 160,
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
              ),
            ),
          ),

          // 顶部导航栏 + 标签
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _buildAppBar(context),
                if (allTags.isNotEmpty) _buildTagBar(allTags),
              ],
            ),
          ),

          // 底部地点卡片滑动列表 - 调整位置避免遮挡
          if (spots.isNotEmpty)
            Positioned(
              bottom: MediaQuery.of(context).padding.bottom + 24,
              left: 0,
              right: 0,
              child: _buildBottomCards(spots),
            ),

          // 空状态
          if (spots.isEmpty && _selectedTags.isNotEmpty)
            Positioned.fill(
              child: Center(
                child: Container(
                  margin: const EdgeInsets.all(32),
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: AppTheme.white,
                    borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                    border: Border.all(
                      color: AppTheme.black,
                      width: AppTheme.borderMedium,
                    ),
                    boxShadow: AppTheme.cardShadow,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.filter_list_off,
                        size: 48,
                        color: AppTheme.mediumGray,
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'No spots match the selected tags',
                        style: AppTheme.bodyLarge(context).copyWith(
                          color: AppTheme.darkGray,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      GestureDetector(
                        onTap: () {
                          setState(() {
                            _selectedTags.clear();
                            if (_mapSpots.isNotEmpty) {
                              _selectedSpot = _mapSpots.first;
                            }
                          });
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 20,
                            vertical: 10,
                          ),
                          decoration: BoxDecoration(
                            color: AppTheme.primaryYellow,
                            borderRadius:
                                BorderRadius.circular(AppTheme.radiusSmall),
                            border: Border.all(
                              color: AppTheme.black,
                              width: AppTheme.borderMedium,
                            ),
                          ),
                          child: Text(
                            'Clear filters',
                            style: AppTheme.labelMedium(context).copyWith(
                              color: AppTheme.black,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildAppBar(BuildContext context) {
    final paddingTop = MediaQuery.of(context).padding.top;
    return Container(
      padding: EdgeInsets.only(
        top: paddingTop + 10,
        left: 16,
        right: 16,
        bottom: 10,
      ),
      child: Row(
        children: [
          // 城市筛选器（可点击切换城市）
          GestureDetector(
            onTap: widget.allCities.isNotEmpty ? _showCityPicker : null,
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 12,
              ),
              decoration: BoxDecoration(
                color: AppTheme.white,
                borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                border: Border.all(
                  color: AppTheme.black,
                  width: AppTheme.borderMedium,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _currentCity,
                    style: AppTheme.labelLarge(context).copyWith(
                      color: AppTheme.black,
                    ),
                  ),
                  if (widget.allCities.isNotEmpty) ...[
                    const SizedBox(width: 4),
                    const Icon(
                      Icons.keyboard_arrow_down,
                      size: 20,
                      color: AppTheme.black,
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(width: 12),
          // 中间搜索框
          Expanded(
            child: Container(
              height: 48,
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
                        hintText: 'Find your...',
                        hintStyle: AppTheme.bodySmall(context).copyWith(
                          color: AppTheme.mediumGray,
                        ),
                        border: InputBorder.none,
                        contentPadding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(
                      Icons.photo_camera,
                      size: 20,
                      color: AppTheme.mediumGray,
                    ),
                    onPressed: () {
                      // TODO: 图片搜索功能
                    },
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 12),
          // 缩小按钮（返回）
          IconButtonCustom(
            icon: Icons.fullscreen_exit,
            onPressed: () => Navigator.of(context).pop(),
            backgroundColor: Colors.white,
          ),
        ],
      ),
    );
  }

  Widget _buildTagBar(List<String> tags) {
    return Container(
      padding: const EdgeInsets.only(bottom: 12),
      child: SizedBox(
        height: 42,
        child: ListView.separated(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          scrollDirection: Axis.horizontal,
          itemCount: tags.length,
          separatorBuilder: (_, __) => const SizedBox(width: 10),
          itemBuilder: (context, index) {
            final tag = tags[index];
            final isSelected = _selectedTags.contains(tag);
            final emoji = _tagEmoji(tag);
            return GestureDetector(
              onTap: () => _toggleTag(tag),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: isSelected ? AppTheme.primaryYellow : Colors.white,
                  borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                  border: Border.all(
                    color: AppTheme.black,
                    width: AppTheme.borderMedium,
                  ),
                  boxShadow: isSelected ? AppTheme.cardShadow : null,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Text(emoji, style: const TextStyle(fontSize: 16)),
                    const SizedBox(width: 6),
                    Text(
                      tag,
                      style: AppTheme.labelMedium(context).copyWith(
                        color: AppTheme.black,
                        fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildBottomCards(List<map_page.Spot> spots) {
    const double cardHeight = 220;
    const double shadowPadding = 8; // Extra space for shadow and border

    return SizedBox(
      height: cardHeight + shadowPadding,
      child: Padding(
        padding: const EdgeInsets.only(bottom: shadowPadding),
        child: PageView.builder(
          controller: _cardPageController,
          padEnds: true,
          itemCount: spots.length,
          itemBuilder: (context, index) {
            final spot = spots[index];
            final isCenter = index == _currentCardIndex;

            return AnimatedScale(
              scale: isCenter ? 1.0 : 0.92,
              duration: const Duration(milliseconds: 220),
              child: _BottomSpotCard(
                spot: spot,
                onTap: () {
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
      ),
    );
  }
}

/// 底部地点卡片组件 - 无标签版本
class _BottomSpotCard extends StatelessWidget {
  const _BottomSpotCard({
    required this.spot,
    required this.onTap,
  });

  final map_page.Spot spot;
  final VoidCallback onTap;

  static Uint8List _decodeBase64Image(String dataUrl) {
    try {
      final base64String = dataUrl.split(',').last;
      return base64Decode(base64String);
    } catch (e) {
      return Uint8List(0);
    }
  }

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
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
                Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.transparent,
                        Colors.black26,
                        Colors.black87,
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Spacer(),
                      // 地点名称
                      Text(
                        spot.name,
                        style: AppTheme.bodyLarge(context).copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          height: 1.2,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 8),
                      // 评分
                      _RatingRow(
                        rating: spot.rating,
                        ratingCount: spot.ratingCount,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      );

  Widget _buildCover() {
    final placeholder = Container(
      color: AppTheme.lightGray,
      child: const Icon(
        Icons.place,
        size: 52,
        color: AppTheme.mediumGray,
      ),
    );

    if (spot.coverImage.isEmpty) return placeholder;
    if (spot.coverImage.startsWith('data:image/')) {
      final data = _decodeBase64Image(spot.coverImage);
      if (data.isEmpty) return placeholder;
      return Image.memory(
        data,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => placeholder,
      );
    }

    return Image.network(
      spot.coverImage,
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => placeholder,
    );
  }
}

class _RatingRow extends StatelessWidget {
  const _RatingRow({
    required this.rating,
    required this.ratingCount,
  });

  final double rating;
  final int ratingCount;

  @override
  Widget build(BuildContext context) {
    final hasRating = rating > 0;
    return Row(
      children: [
        Icon(
          Icons.star,
          color: hasRating ? AppTheme.primaryYellow : Colors.white70,
          size: 18,
        ),
        const SizedBox(width: 6),
        Text(
          hasRating ? rating.toStringAsFixed(1) : 'No rating',
          style: AppTheme.bodyMedium(context).copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
        if (ratingCount > 0) ...[
          const SizedBox(width: 8),
          Text(
            '($ratingCount)',
            style: AppTheme.labelMedium(context).copyWith(
              color: Colors.white70,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ],
    );
  }
}
