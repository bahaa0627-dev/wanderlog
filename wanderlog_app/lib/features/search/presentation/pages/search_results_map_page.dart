import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:palette_generator/palette_generator.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';
import 'package:wanderlog/features/search/data/search_repository.dart';
import 'package:wanderlog/features/map/presentation/widgets/mapbox_spot_map.dart';
import 'package:wanderlog/shared/widgets/unified_spot_detail_modal.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart';
import 'package:wanderlog/features/search/presentation/widgets/search_menu_sheet.dart';
import 'package:wanderlog/features/search/providers/countries_cities_provider.dart';

/// 搜索结果地图页面
class SearchResultsMapPage extends ConsumerStatefulWidget {
  const SearchResultsMapPage({
    super.key,
    required this.city,
    required this.country,
    required this.selectedTags,
  });

  final String city;
  final String country;
  final List<String> selectedTags;

  @override
  ConsumerState<SearchResultsMapPage> createState() => _SearchResultsMapPageState();
}

class _SearchResultsMapPageState extends ConsumerState<SearchResultsMapPage> {
  final GlobalKey<MapboxSpotMapState> _mapKey = GlobalKey<MapboxSpotMapState>();
  final GlobalKey _searchBoxKey = GlobalKey();
  late final PageController _cardPageController;
  
  late String _currentCity;
  late String _currentCountry;
  late List<String> _userSelectedTags;
  
  List<Spot> _spots = [];
  List<Spot> _cachedFilteredSpots = []; // 缓存过滤后的 spots
  Spot? _selectedSpot;
  int _currentCardIndex = 0;
  bool _isLoading = true;
  bool _isAiGenerated = false;
  bool _isAiGenerationFailed = false;
  String? _error;
  Position? _currentMapCenter;
  double _currentZoom = 12.0;
  bool _showSearchMenu = false;
  
  // 所有地点的标签统计
  Map<String, int> _allTagsCounts = {};
  Set<String> _activeFilterTags = {};

  @override
  void initState() {
    super.initState();
    _currentCity = widget.city;
    _currentCountry = widget.country;
    _userSelectedTags = List.from(widget.selectedTags);
    _activeFilterTags = Set.from(widget.selectedTags);
    _cardPageController = PageController(viewportFraction: 0.55);
    _loadPlaces();
  }

  @override
  void dispose() {
    _cardPageController.dispose();
    super.dispose();
  }

  /// 计算所有地点的标签统计
  void _computeTagsCounts() {
    final counts = <String, int>{};
    for (final spot in _spots) {
      for (final tag in spot.tags) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
    }
    // 按数量排序
    final sortedEntries = counts.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    _allTagsCounts = Map.fromEntries(sortedEntries);
  }

  /// 获取过滤后的地点
  List<Spot> get _filteredSpots => _cachedFilteredSpots;
  
  /// 更新过滤后的地点缓存
  void _updateFilteredSpots() {
    // 如果是 AI 生成的结果，不需要再过滤
    if (_isAiGenerated) {
      _cachedFilteredSpots = _spots;
      return;
    }
    
    if (_activeFilterTags.isEmpty) {
      _cachedFilteredSpots = _spots;
      return;
    }
    
    // 转换为小写进行比较
    final lowerTags = _activeFilterTags.map((t) => t.toLowerCase()).toSet();
    
    _cachedFilteredSpots = _spots.where((spot) => 
      spot.tags.any((tag) => lowerTags.contains(tag.toLowerCase()))
    ).toList();
  }

  Future<void> _loadPlaces() async {
    setState(() {
      _isLoading = true;
      _error = null;
      _isAiGenerationFailed = false;
    });

    try {
      final repository = ref.read(searchRepositoryProvider);
      
      // 调试日志
      print('🔍 Searching: city=$_currentCity, country=$_currentCountry, tags=$_userSelectedTags');
      
      // 先尝试从数据库搜索
      var result = await repository.searchPlaces(
        city: _currentCity,
        country: _currentCountry,
        tags: _userSelectedTags.isEmpty ? null : _userSelectedTags,
        limit: 50,
      );
      
      // 调试日志
      print('📍 Search result: ${result.places.length} places, isAiGenerated=${result.isAiGenerated}');
      if (result.places.isNotEmpty) {
        print('📍 First place: ${result.places.first.name}, tags: ${result.places.first.tags}');
      }

      // 如果选择了标签但没有结果，尝试使用 AI 生成
      if (result.places.isEmpty && _userSelectedTags.isNotEmpty) {
        print('🤖 No results, trying AI generation...');
        try {
          result = await repository.generatePlacesWithAI(
            city: _currentCity,
            country: _currentCountry,
            tags: _userSelectedTags,
            maxPerCategory: 10,
          );
          print('🤖 AI generated ${result.places.length} places');
        } catch (aiError) {
          print('❌ AI generation failed: $aiError');
          setState(() {
            _isLoading = false;
            _isAiGenerationFailed = true;
            _currentMapCenter = _getCityDefaultCenter(_currentCity, _currentCountry);
          });
          return;
        }
      }

      final spots = result.places.map(_convertToSpot).toList();
      final limitedSpots = spots.take(50).toList();
      
      if (spots.length > 50) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          CustomToast.showInfo(context, '50 spots for you');
        });
      }

      setState(() {
        _spots = limitedSpots;
        _isAiGenerated = result.isAiGenerated;
        _isLoading = false;
        _computeTagsCounts();
        _updateFilteredSpots(); // 更新过滤后的缓存
        
        if (_spots.isNotEmpty) {
          _selectedSpot = _cachedFilteredSpots.isNotEmpty ? _cachedFilteredSpots.first : _spots.first;
          _currentMapCenter = Position(
            _selectedSpot!.longitude,
            _selectedSpot!.latitude,
          );
        } else {
          _currentMapCenter = _getCityDefaultCenter(_currentCity, _currentCountry);
        }
      });
    } catch (e) {
      print('❌ Search error: $e');
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  Spot _convertToSpot(SearchPlaceResult place) {
    // 合并 category 和 aiTags 作为 tags
    final allTags = <String>{
      if (place.category != null && place.category!.isNotEmpty) place.category!,
      ...place.tags,
    }.toList();
    
    // 调试日志
    if (place.name.contains('Yoyogi') || place.name.contains('Ebisu')) {
      print('🏷️ Converting ${place.name}: category=${place.category}, tags=${place.tags}, allTags=$allTags');
    }
    
    return Spot(
      id: place.id,
      name: place.name,
      city: place.city ?? _currentCity,
      category: place.category ?? 'Place',
      latitude: place.latitude,
      longitude: place.longitude,
      rating: place.rating ?? 0.0,
      ratingCount: place.ratingCount ?? 0,
      coverImage: place.coverImage ?? 
          'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80',
      images: place.images,
      tags: allTags,
      aiSummary: place.aiSummary,
    );
  }

  Position _getCityDefaultCenter(String city, String country) {
    final cityCoordinates = <String, Position>{
      'Paris': Position(2.3522, 48.8566),
      'Tokyo': Position(139.6917, 35.6895),
      'Copenhagen': Position(12.5683, 55.6761),
      'Vienna': Position(16.3738, 48.2082),
      'Berlin': Position(13.4050, 52.5200),
      'Chiang Mai': Position(98.9853, 18.7883),
      'Sapporo': Position(141.3545, 43.0618),
      'Aarhus': Position(10.2039, 56.1629),
    };
    return cityCoordinates[city] ?? Position(0, 0);
  }

  // 标记是否由 marker 点击触发的卡片滚动，避免触发相机移动
  bool _isMarkerTapScroll = false;
  // 记录 marker 点击滚动的目标 index，用于在动画过程中持续判断
  int? _markerTapTargetIndex;

  void _handleSpotTap(Spot spot) {
    final filteredSpots = _filteredSpots;
    final index = filteredSpots.indexOf(spot);
    if (index >= 0) {
      // 标记这是 marker 点击触发的滚动，记录目标 index
      _isMarkerTapScroll = true;
      _markerTapTargetIndex = index;
      
      // 更新内部状态但不触发 setState，避免地图重建
      _selectedSpot = spot;
      _currentCardIndex = index;
      
      // 直接调用地图的方法更新 marker 样式，不触发重建
      _mapKey.currentState?.updateSelectedSpot(spot);
      
      // 只滚动卡片
      _cardPageController.animateToPage(
        index,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      ).then((_) {
        // 动画完成后重置标记
        _isMarkerTapScroll = false;
        _markerTapTargetIndex = null;
      });
    }
  }

  void _animateCamera(Position target, {double? zoom}) {
    _currentMapCenter = target;
    if (zoom != null) _currentZoom = zoom;
    _mapKey.currentState?.animateCamera(target, zoom: zoom);
  }

  void _showSpotDetail(Spot spot) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => UnifiedSpotDetailModal(spot: spot),
    );
  }

  void _toggleFilterTag(String tag) {
    setState(() {
      if (_activeFilterTags.contains(tag)) {
        _activeFilterTags.remove(tag);
      } else {
        _activeFilterTags.add(tag);
      }
      _updateFilteredSpots(); // 更新过滤后的缓存
      _selectedSpot = _cachedFilteredSpots.isNotEmpty ? _cachedFilteredSpots.first : null;
      _currentCardIndex = 0;
    });
    _jumpToPage(0);
  }

  void _jumpToPage(int index) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_cardPageController.hasClients) {
        _cardPageController.jumpToPage(index);
      }
    });
  }

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
      case 'bread':
      case 'bakery':
        return '🥐';
      case 'brunch':
        return '🍳';
      case 'hiking':
        return '🥾';
      case 'cemetery':
        return '⚰️';
      case 'pilgrimage':
        return '⛪';
      case 'knitting':
        return '🧶';
      case 'store':
      case 'shopping':
        return '🛍️';
      case 'attractions':
        return '🎡';
      default:
        return '📍';
    }
  }

  void _openSearchMenu() {
    setState(() => _showSearchMenu = true);
  }

  void _closeSearchMenu() {
    setState(() => _showSearchMenu = false);
  }

  void _handleNewSearch(String city, String country, List<String> tags) {
    setState(() {
      _currentCity = city;
      _currentCountry = country;
      _userSelectedTags = tags;
      _activeFilterTags = Set.from(tags);
      _showSearchMenu = false;
    });
    _loadPlaces();
  }

  @override
  Widget build(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    final topPadding = mediaQuery.padding.top;
    final filteredSpots = _filteredSpots;

    return Scaffold(
      backgroundColor: Colors.white,
      body: Stack(
        children: [
          // Map
          if (!_isLoading && _error == null)
            Positioned.fill(
              child: _MapSurface(
                mapKey: _mapKey,
                spots: filteredSpots,
                fallbackCenter: _currentMapCenter ?? Position(0, 0),
                currentCenter: _currentMapCenter,
                currentZoom: _currentZoom,
                selectedSpot: _selectedSpot,
                onSpotTap: _handleSpotTap,
                onCameraMove: (center, zoom) {
                  // 只更新内部状态，不触发 setState 避免重建地图
                  _currentMapCenter = center;
                  _currentZoom = zoom;
                },
              ),
            ),

          // Top gradient
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: IgnorePointer(
              child: Container(
                height: topPadding + 160,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.white.withOpacity(0.85),
                      Colors.white.withOpacity(0.0),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // Header with search box
          Positioned(
            top: topPadding + 12,
            left: 16,
            right: 16,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    IconButtonCustom(
                      icon: Icons.arrow_back,
                      onPressed: () => Navigator.of(context).pop(),
                      backgroundColor: Colors.white,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: GestureDetector(
                        key: _searchBoxKey,
                        onTap: _openSearchMenu,
                        child: Container(
                          height: 48,
                          padding: const EdgeInsets.symmetric(horizontal: 16),
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
                              const Icon(Icons.search, size: 20, color: AppTheme.mediumGray),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  '$_currentCity, $_currentCountry',
                                  style: AppTheme.bodyMedium(context),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                // Tag bar - 与首页 map 样式一致
                _buildTagBar(),
              ],
            ),
          ),

          // Loading overlay
          if (_isLoading)
            Positioned.fill(
              child: Container(
                color: Colors.white.withOpacity(0.92),
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const SizedBox(
                        width: 48,
                        height: 48,
                        child: CircularProgressIndicator(
                          strokeWidth: 3,
                          valueColor: AlwaysStoppedAnimation<Color>(AppTheme.black),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text('Finding spots for you...', style: AppTheme.bodyLarge(context)),
                    ],
                  ),
                ),
              ),
            ),

          // Error overlay
          if (_error != null)
            Positioned.fill(
              child: Container(
                color: Colors.white.withOpacity(0.95),
                padding: const EdgeInsets.all(32),
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('Unable to load places', style: AppTheme.headlineMedium(context)),
                      const SizedBox(height: 8),
                      Text(
                        _error!,
                        style: AppTheme.bodyMedium(context).copyWith(color: AppTheme.mediumGray),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 20),
                      PrimaryButton(text: 'Retry', onPressed: _loadPlaces),
                    ],
                  ),
                ),
              ),
            ),

          if (!_isLoading && _error == null && filteredSpots.isNotEmpty)
            Positioned(
              bottom: 32,
              left: 0,
              right: 0,
              height: 280, // 固定高度
              child: PageView.builder(
                  controller: _cardPageController,
                  clipBehavior: Clip.none,
                  onPageChanged: (index) {
                    if (index >= filteredSpots.length) return;
                    final spot = filteredSpots[index];
                    
                    // marker 点击触发的滚动，不移动相机，不重建地图
                    if (_isMarkerTapScroll) {
                      _currentCardIndex = index;
                      _selectedSpot = spot;
                      // 到达目标 index 后才重置标记
                      if (index == _markerTapTargetIndex) {
                        _isMarkerTapScroll = false;
                        _markerTapTargetIndex = null;
                      }
                      return;
                    }
                    
                    // 用户手动滑动卡片，移动相机
                    setState(() {
                      _currentCardIndex = index;
                      _selectedSpot = spot;
                    });
                    _animateCamera(Position(spot.longitude, spot.latitude));
                  },
                  itemCount: filteredSpots.length,
                  itemBuilder: (context, index) {
                    final spot = filteredSpots[index];
                    final isCenter = index == _currentCardIndex;
                    return AnimatedScale(
                      scale: isCenter ? 1.0 : 0.92,
                      duration: const Duration(milliseconds: 250),
                      child: Center(
                        child: SizedBox(
                          width: 210,
                          height: 280, // 宽:高 = 3:4
                          child: _BottomSpotCard(
                            spot: spot,
                            onTap: () => _showSpotDetail(spot),
                            isAiGenerated: _isAiGenerated,
                          ),
                        ),
                      ),
                    );
                  },
                ),
            ),

          // AI generation failed overlay
          if (_isAiGenerationFailed)
            _buildAiFailedOverlay(),

          // Empty state
          if (!_isLoading && _error == null && filteredSpots.isEmpty && !_isAiGenerationFailed)
            _buildEmptyState(),

          // Search menu overlay
          if (_showSearchMenu)
            _SearchMenuOverlayInPage(
              searchBoxKey: _searchBoxKey,
              initialCountry: _currentCountry,
              initialCity: _currentCity,
              initialTags: _userSelectedTags,
              onClose: _closeSearchMenu,
              onSearch: _handleNewSearch,
            ),
        ],
      ),
    );
  }

  /// 标签栏 - 与首页 map 样式一致，最多展示 8 个标签
  Widget _buildTagBar() {
    // 合并用户选择的标签和搜索结果的标签
    final allTags = <String>{..._userSelectedTags, ..._allTagsCounts.keys};
    
    // 按数量排序，用户选择的标签优先
    final sortedTags = allTags.toList()..sort((a, b) {
      final aSelected = _userSelectedTags.contains(a);
      final bSelected = _userSelectedTags.contains(b);
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      final aCount = _allTagsCounts[a] ?? 0;
      final bCount = _allTagsCounts[b] ?? 0;
      return bCount.compareTo(aCount);
    });
    
    // 最多展示 8 个标签
    final displayTags = sortedTags.take(8).toList();

    return SizedBox(
      height: 42,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 0),
        scrollDirection: Axis.horizontal,
        itemCount: displayTags.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, index) {
          final tag = displayTags[index];
          final isSelected = _activeFilterTags.contains(tag);
          final emoji = _tagEmoji(tag);
          final count = _allTagsCounts[tag];
          
          return GestureDetector(
            onTap: () => _toggleFilterTag(tag),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: isSelected ? AppTheme.primaryYellow : Colors.white,
                borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                border: Border.all(
                  color: AppTheme.black,
                  width: AppTheme.borderMedium,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(emoji, style: const TextStyle(fontSize: 16)),
                  const SizedBox(width: 6),
                  Text(tag, style: AppTheme.labelMedium(context)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildAiFailedOverlay() {
    return Positioned.fill(
      child: Container(
        color: Colors.white,
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    IconButtonCustom(
                      icon: Icons.arrow_back,
                      onPressed: () => Navigator.of(context).pop(),
                      backgroundColor: Colors.white,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        '$_currentCity, $_currentCountry',
                        style: AppTheme.titleMedium(context),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 200,
                          height: 200,
                          decoration: BoxDecoration(
                            color: AppTheme.lightGray,
                            borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
                            border: Border.all(color: AppTheme.black, width: AppTheme.borderMedium),
                          ),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.auto_awesome_outlined, size: 64, color: AppTheme.mediumGray),
                              const SizedBox(height: 8),
                              Text(
                                '✨ AI',
                                style: AppTheme.titleMedium(context).copyWith(color: AppTheme.mediumGray),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 24),
                        Text('AI Generation Failed', style: AppTheme.headlineMedium(context), textAlign: TextAlign.center),
                        const SizedBox(height: 12),
                        Text(
                          'We couldn\'t generate recommendations for "${_userSelectedTags.join(', ')}" in $_currentCity.\n\nPlease try again later or choose different filters.',
                          style: AppTheme.bodyMedium(context).copyWith(color: AppTheme.mediumGray),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 32),
                        PrimaryButton(text: 'Go Back', onPressed: () => Navigator.of(context).pop()),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Positioned.fill(
      child: Container(
        color: Colors.white.withOpacity(0.9),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.search_off, size: 64, color: AppTheme.mediumGray),
              const SizedBox(height: 16),
              Text('No spots found', style: AppTheme.headlineMedium(context)),
              const SizedBox(height: 8),
              Text(
                'Try different filters or another city',
                style: AppTheme.bodyMedium(context).copyWith(color: AppTheme.mediumGray),
              ),
            ],
          ),
        ),
      ),
    );
  }
}


class _MapSurface extends StatelessWidget {
  const _MapSurface({
    required this.mapKey,
    required this.spots,
    required this.fallbackCenter,
    this.currentCenter,
    required this.currentZoom,
    this.selectedSpot,
    required this.onSpotTap,
    required this.onCameraMove,
  });

  final GlobalKey<MapboxSpotMapState> mapKey;
  final List<Spot> spots;
  final Position fallbackCenter;
  final Position? currentCenter;
  final double currentZoom;
  final Spot? selectedSpot;
  final void Function(Spot) onSpotTap;
  final void Function(Position, double) onCameraMove;

  @override
  Widget build(BuildContext context) {
    return MapboxSpotMap(
      key: mapKey,
      spots: spots,
      initialCenter: currentCenter ?? fallbackCenter,
      initialZoom: currentZoom,
      selectedSpot: selectedSpot,
      onSpotTap: onSpotTap,
      onCameraMove: onCameraMove,
    );
  }
}

/// 底部地点卡片组件 - 全图+渐变覆盖样式（与首页 map 一致）
class _BottomSpotCard extends StatefulWidget {
  const _BottomSpotCard({
    required this.spot,
    required this.onTap,
    this.isAiGenerated = false,
  });

  final Spot spot;
  final VoidCallback onTap;
  final bool isAiGenerated;

  @override
  State<_BottomSpotCard> createState() => _BottomSpotCardState();
}

class _BottomSpotCardState extends State<_BottomSpotCard> {
  Color _dominantColor = Colors.black;

  @override
  void initState() {
    super.initState();
    _extractDominantColor();
  }

  @override
  void didUpdateWidget(_BottomSpotCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.spot.coverImage != widget.spot.coverImage) {
      _extractDominantColor();
    }
  }

  Future<void> _extractDominantColor() async {
    if (widget.spot.coverImage.isEmpty) return;
    
    try {
      final ImageProvider imageProvider;
      if (widget.spot.coverImage.startsWith('data:')) {
        final base64Data = widget.spot.coverImage.split(',').last;
        final bytes = base64Decode(base64Data);
        imageProvider = MemoryImage(Uint8List.fromList(bytes));
      } else {
        imageProvider = NetworkImage(widget.spot.coverImage);
      }
      
      final paletteGenerator = await PaletteGenerator.fromImageProvider(
        imageProvider,
        size: const ui.Size(100, 100),
        maximumColorCount: 5,
      );
      
      if (mounted) {
        setState(() {
          _dominantColor = paletteGenerator.dominantColor?.color ??
              paletteGenerator.darkMutedColor?.color ??
              paletteGenerator.darkVibrantColor?.color ??
              Colors.black;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _dominantColor = Colors.black);
      }
    }
  }

  Widget _buildCover() {
    final placeholder = ColoredBox(
      color: AppTheme.lightGray,
      child: const Icon(Icons.place, size: 52, color: AppTheme.mediumGray),
    );

    if (widget.spot.coverImage.isEmpty) return placeholder;

    // Handle data URI format
    if (widget.spot.coverImage.startsWith('data:')) {
      try {
        final base64Data = widget.spot.coverImage.split(',').last;
        final bytes = base64Decode(base64Data);
        return Image.memory(Uint8List.fromList(bytes), fit: BoxFit.cover, errorBuilder: (_, __, ___) => placeholder);
      } catch (e) {
        return placeholder;
      }
    }
    return Image.network(widget.spot.coverImage, fit: BoxFit.cover, errorBuilder: (_, __, ___) => placeholder);
  }

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: widget.onTap,
    child: Container(
      margin: const EdgeInsets.symmetric(horizontal: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
        border: Border.all(color: AppTheme.black, width: AppTheme.borderMedium),
        boxShadow: AppTheme.cardShadow,
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppTheme.radiusMedium - 1),
        child: Stack(
          fit: StackFit.expand,
          children: [
            _buildCover(),
            // 底部渐变蒙层 - 使用提取的主色
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                height: 140, // 卡片高度 280 的一半
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.transparent,
                      _dominantColor.withOpacity(0.3),
                      _dominantColor.withOpacity(0.6),
                      _dominantColor.withOpacity(0.85),
                    ],
                    stops: const [0.0, 0.3, 0.6, 1.0],
                  ),
                ),
              ),
            ),
            // AI 标签 - 右上角
            if (widget.isAiGenerated)
              Positioned(
                top: 10,
                right: 10,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryYellow,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppTheme.black, width: 1),
                  ),
                  child: const Text('✨ AI', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                ),
              ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Text(
                    widget.spot.name,
                    style: AppTheme.bodyLarge(context).copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      height: 1.2,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 8),
                  _RatingRow(rating: widget.spot.rating, ratingCount: widget.spot.ratingCount),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _RatingRow extends StatelessWidget {
  const _RatingRow({required this.rating, required this.ratingCount});

  final double rating;
  final int ratingCount;

  @override
  Widget build(BuildContext context) {
    final hasRating = rating > 0;
    return Row(
      children: [
        Icon(
          hasRating ? Icons.star : Icons.star_border,
          size: 16,
          color: hasRating ? Colors.amber : Colors.white54,
        ),
        const SizedBox(width: 4),
        Text(
          hasRating ? rating.toStringAsFixed(1) : '-',
          style: AppTheme.labelSmall(context).copyWith(color: Colors.white),
        ),
        if (ratingCount > 0) ...[
          const SizedBox(width: 4),
          Text(
            '($ratingCount)',
            style: AppTheme.labelSmall(context).copyWith(color: Colors.white70),
          ),
        ],
      ],
    );
  }
}

/// 搜索菜单覆盖层（页面内使用）
class _SearchMenuOverlayInPage extends ConsumerStatefulWidget {
  const _SearchMenuOverlayInPage({
    required this.searchBoxKey,
    required this.initialCountry,
    required this.initialCity,
    required this.initialTags,
    required this.onClose,
    required this.onSearch,
  });

  final GlobalKey searchBoxKey;
  final String initialCountry;
  final String initialCity;
  final List<String> initialTags;
  final VoidCallback onClose;
  final void Function(String city, String country, List<String> tags) onSearch;

  @override
  ConsumerState<_SearchMenuOverlayInPage> createState() => _SearchMenuOverlayInPageState();
}

class _SearchMenuOverlayInPageState extends ConsumerState<_SearchMenuOverlayInPage> {
  late String? _selectedCountry;
  late String? _selectedCity;
  late Set<String> _selectedTags;

  static const Map<String, List<String>> _interestCategories = {
    'Things to do': ['Museum', 'Attractions', 'Store'],
    'Nature': ['Park', 'Cemetery', 'Hiking'],
    'Arts': ['Architecture', 'Pilgrimage', 'Knitting'],
    'Food': ['Cafe', 'Bread', 'Brunch', 'Restaurant'],
  };

  @override
  void initState() {
    super.initState();
    _selectedCountry = widget.initialCountry;
    _selectedCity = widget.initialCity;
    _selectedTags = Set.from(widget.initialTags);
  }

  List<String> get _countries {
    final data = ref.watch(countriesCitiesProvider);
    return data.keys.toList()..sort();
  }

  List<String> get _availableCities {
    if (_selectedCountry == null) return [];
    final data = ref.watch(countriesCitiesProvider);
    return data[_selectedCountry] ?? [];
  }

  void _toggleTag(String tag) {
    setState(() {
      if (_selectedTags.contains(tag)) {
        _selectedTags.remove(tag);
      } else {
        _selectedTags.add(tag);
      }
    });
  }

  void _handleSearch() {
    if (_selectedCity == null) {
      CustomToast.showInfo(context, 'Please select a city first');
      return;
    }
    widget.onSearch(_selectedCity!, _selectedCountry!, _selectedTags.toList());
  }

  @override
  Widget build(BuildContext context) {
    final RenderBox? searchBox = widget.searchBoxKey.currentContext?.findRenderObject() as RenderBox?;
    final searchBoxPosition = searchBox?.localToGlobal(Offset.zero) ?? Offset.zero;
    final searchBoxSize = searchBox?.size ?? ui.Size.zero;
    final topOffset = searchBoxPosition.dy + searchBoxSize.height + 8;

    return Stack(
      children: [
        Positioned.fill(
          child: GestureDetector(
            onTap: widget.onClose,
            child: Container(color: Colors.black26),
          ),
        ),
        Positioned(
          top: topOffset,
          left: 16,
          right: 16,
          child: Material(
            color: Colors.transparent,
            child: Container(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(context).size.height - topOffset - 100,
              ),
              decoration: BoxDecoration(
                color: AppTheme.white,
                borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
                border: Border.all(color: AppTheme.black, width: AppTheme.borderThick),
                boxShadow: AppTheme.strongShadow,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Flexible(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('🏙 City', style: AppTheme.headlineMedium(context).copyWith(fontSize: 22)),
                          const SizedBox(height: 12),
                          _buildDropdownRow(),
                          const SizedBox(height: 24),
                          Text('🌟 Interests', style: AppTheme.headlineMedium(context).copyWith(fontSize: 22)),
                          const SizedBox(height: 12),
                          ..._interestCategories.entries.map((entry) => _buildInterestCategory(entry.key, entry.value)),
                        ],
                      ),
                    ),
                  ),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                    child: PrimaryButton(text: 'AI Search & Customize', onPressed: _handleSearch),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildDropdownRow() {
    return Row(
      children: [
        Expanded(child: _buildCompactDropdown(
          value: _selectedCountry,
          hint: 'Country',
          items: _countries,
          onChanged: (value) {
            setState(() {
              _selectedCountry = value;
              _selectedCity = null;
            });
          },
        )),
        const SizedBox(width: 12),
        Expanded(child: _buildCityDropdown()),
      ],
    );
  }

  Widget _buildCompactDropdown({
    required String? value,
    required String hint,
    required List<String> items,
    required ValueChanged<String?> onChanged,
  }) {
    return Container(
      height: 44,
      decoration: BoxDecoration(
        color: AppTheme.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: AppTheme.black, width: 1.5),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: value,
          hint: Padding(
            padding: const EdgeInsets.only(left: 16),
            child: Text(hint, style: AppTheme.bodyMedium(context).copyWith(color: AppTheme.mediumGray, fontSize: 14)),
          ),
          isExpanded: true,
          icon: const Padding(
            padding: EdgeInsets.only(right: 8),
            child: Icon(Icons.keyboard_arrow_down, color: AppTheme.black, size: 20),
          ),
          selectedItemBuilder: (context) => items.map((item) {
            return Padding(
              padding: const EdgeInsets.only(left: 16),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(item, style: AppTheme.bodyMedium(context).copyWith(fontSize: 14), overflow: TextOverflow.ellipsis),
              ),
            );
          }).toList(),
          items: items.map((item) => DropdownMenuItem<String>(
            value: item,
            child: Text(item, style: AppTheme.bodyMedium(context).copyWith(fontSize: 14)),
          )).toList(),
          onChanged: onChanged,
        ),
      ),
    );
  }

  Widget _buildCityDropdown() {
    final hasCountry = _selectedCountry != null;
    final cities = _availableCities;

    return Container(
      height: 44,
      decoration: BoxDecoration(
        color: AppTheme.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: AppTheme.black, width: 1.5),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: _selectedCity,
          hint: Padding(
            padding: const EdgeInsets.only(left: 16),
            child: Text('City', style: AppTheme.bodyMedium(context).copyWith(color: AppTheme.mediumGray, fontSize: 14)),
          ),
          isExpanded: true,
          icon: const Padding(
            padding: EdgeInsets.only(right: 8),
            child: Icon(Icons.keyboard_arrow_down, color: AppTheme.black, size: 20),
          ),
          selectedItemBuilder: hasCountry ? (context) => cities.map((item) {
            return Padding(
              padding: const EdgeInsets.only(left: 16),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(item, style: AppTheme.bodyMedium(context).copyWith(fontSize: 14), overflow: TextOverflow.ellipsis),
              ),
            );
          }).toList() : null,
          items: hasCountry
              ? cities.map((item) => DropdownMenuItem<String>(
                  value: item,
                  child: Text(item, style: AppTheme.bodyMedium(context).copyWith(fontSize: 14)),
                )).toList()
              : [DropdownMenuItem<String>(
                  enabled: false,
                  child: Text('Choose country first', style: AppTheme.bodyMedium(context).copyWith(color: AppTheme.mediumGray, fontSize: 14, fontStyle: FontStyle.italic)),
                )],
          onChanged: hasCountry ? (value) => setState(() => _selectedCity = value) : null,
        ),
      ),
    );
  }

  Widget _buildInterestCategory(String category, List<String> tags) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(category, style: AppTheme.titleMedium(context).copyWith(fontSize: 15)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: tags.map((tag) => _buildTagChip(tag)).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildTagChip(String tag) {
    final isSelected = _selectedTags.contains(tag);
    return GestureDetector(
      onTap: () => _toggleTag(tag),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.primaryYellow : AppTheme.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppTheme.black, width: 1.5),
        ),
        child: Text(tag, style: AppTheme.labelMedium(context).copyWith(fontSize: 13)),
      ),
    );
  }
}
