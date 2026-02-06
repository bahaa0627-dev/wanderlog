import 'dart:convert';
import 'dart:typed_data';
import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:palette_generator/palette_generator.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/core/utils/color_utils.dart';
import 'package:wanderlog/core/utils/dialog_utils.dart';
import 'package:wanderlog/features/ai_recognition/presentation/pages/ai_assistant_page.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart'
    hide Spot;
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart'
    as map_page show Spot;
import 'package:wanderlog/features/map/presentation/widgets/mapbox_spot_map.dart';
import 'package:wanderlog/features/map/data/supabase_place_repository.dart';
import 'package:wanderlog/features/map/providers/public_place_providers.dart';
import 'package:wanderlog/features/search/providers/countries_cities_stats_provider.dart';
import 'package:wanderlog/shared/utils/opening_hours_utils.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';
import 'package:wanderlog/shared/models/spot_model.dart';
import 'package:wanderlog/shared/widgets/unified_spot_detail_modal.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/shared/models/trip_model.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart';
import 'package:wanderlog/shared/widgets/vago_placeholder.dart';
import 'package:wanderlog/features/collections/providers/collection_providers.dart';
import 'package:wanderlog/shared/utils/number_format_utils.dart';
import 'package:wanderlog/features/ai_recognition/providers/wishlist_status_provider.dart';

/// MyLand 地点地图页面 - 展示 MustGo 或 Today's Plan 中的地点
class MyLandSpotsMapPage extends ConsumerStatefulWidget {
  const MyLandSpotsMapPage({
    required this.cityName,
    required this.spots,
    required this.tabLabel,
    this.allCities = const [],
    this.allSpotsByCity = const {},
    this.spotsByCountryCity = const {},
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
  final Map<String, Map<String, List<Spot>>>
      spotsByCountryCity; // 按国家->城市分组的所有地点
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
  final FocusNode _searchFocusNode = FocusNode();
  int _currentCardIndex = 0;
  List<map_page.Spot> _mapSpots = [];
  List<map_page.Spot> _carouselSpots = []; // 卡片列表（按距离排序）
  List<map_page.Spot> _searchResultSpots = []; // 搜索结果
  map_page.Spot? _selectedSpot;
  bool _skipNextRecenter = false;
  final Set<String> _selectedTags = {};
  late String _currentCity;
  String? _currentCountry;
  late List<Spot> _currentSpots;
  bool _isSearching = false; // 搜索加载状态
  bool _hasSearchResults = false; // 是否有搜索结果
  bool _isExiting = false;

  // 需要过滤的无效标签（旧的 Google 分类等）
  static const Set<String> _invalidTags = {
    'point_of_interest',
    'Point_of_interest',
    'Point_Of_Interest',
    'place_of_interest',
    'tourist_attraction',
    'establishment',
    'premise',
    'subpremise',
    'route',
    'street_address',
    'political',
    'locality',
    'sublocality',
    'neighborhood',
    'administrative_area_level_1',
    'administrative_area_level_2',
    'country',
    'postal_code',
  };

  // 防抖字段
  String? _lastClickedSpotId;
  DateTime? _lastClickTime;

  /// 检查是否为无效标签
  static bool _isInvalidTag(String tag) {
    final lowerTag = tag.toLowerCase().replaceAll(' ', '_');
    return _invalidTags.any((invalid) => invalid.toLowerCase() == lowerTag);
  }

  @override
  void initState() {
    super.initState();
    _currentCity = widget.cityName;
    _currentSpots = widget.spots;
    _initCurrentCountry();
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

  /// 初始化当前国家（从地点数据中获取）
  void _initCurrentCountry() {
    // 从 spotsByCountryCity 中找到当前城市所属的国家
    for (final entry in widget.spotsByCountryCity.entries) {
      if (entry.value.containsKey(_currentCity)) {
        _currentCountry = entry.key;
        return;
      }
    }
    // 如果没找到，尝试从当前地点中获取
    if (_currentSpots.isNotEmpty) {
      _currentCountry = _currentSpots.first.country;
    }
  }

  @override
  void dispose() {
    _cardPageController.removeListener(_onCardPageChanged);
    _cardPageController.dispose();
    _searchController.dispose();
    _searchFocusNode.dispose();
    super.dispose();
  }

  void _handleExit() {
    if (_isExiting) return;
    setState(() {
      _isExiting = true;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && Navigator.canPop(context)) {
        Navigator.of(context).pop();
      }
    });
  }

  /// 转换 Spot 模型到地图使用的格式
  void _convertSpots() {
    _mapSpots = _currentSpots.map((spot) => _convertSpot(spot)).toList();
    if (_mapSpots.isNotEmpty) {
      _selectedSpot = _mapSpots[0];
    }
  }

  /// 首字母大写
  String _capitalizeTag(String tag) {
    if (tag.isEmpty) return tag;
    return tag[0].toUpperCase() + tag.substring(1).toLowerCase();
  }

  /// 从 aiTag 元素中提取标签字符串
  String _extractTagString(dynamic aiTag) {
    if (aiTag == null) return '';
    if (aiTag is String) return aiTag.trim();
    if (aiTag is Map) {
      final en = aiTag['en'];
      if (en != null && en is String && en.trim().isNotEmpty) {
        return en.trim();
      }
      final zh = aiTag['zh'];
      if (zh != null && zh is String && zh.trim().isNotEmpty) {
        return zh.trim();
      }
    }
    return '';
  }

  /// 获取所有地点的标签（统计出现次数，按从多到少排序）
  /// 复用 spots_tab.dart 的逻辑
  List<String> _getAllUniqueTags() {
    final tagCounts = <String, int>{};

    for (final spot in _currentSpots) {
      // 优先使用 displayTagsEn（后端已处理好的展示标签，包含 category）
      final displayTags = spot.displayTagsEn;
      if (displayTags != null && displayTags.isNotEmpty) {
        for (final tag in displayTags) {
          final normalizedTag = tag.trim();
          if (normalizedTag.isNotEmpty && !_isInvalidTag(normalizedTag)) {
            final capitalizedTag = _capitalizeTag(normalizedTag);
            tagCounts[capitalizedTag] = (tagCounts[capitalizedTag] ?? 0) + 1;
          }
        }
      } else {
        // 回退：统计 category
        final category = spot.category?.trim() ?? '';
        if (category.isNotEmpty && !_isInvalidTag(category)) {
          final normalizedCategory = _capitalizeTag(category);
          tagCounts[normalizedCategory] =
              (tagCounts[normalizedCategory] ?? 0) + 1;
        }

        // 回退：统计 tags
        for (final tag in spot.tags) {
          final normalizedTag = tag.trim();
          if (normalizedTag.isNotEmpty && !_isInvalidTag(normalizedTag)) {
            final capitalizedTag = _capitalizeTag(normalizedTag);
            tagCounts[capitalizedTag] = (tagCounts[capitalizedTag] ?? 0) + 1;
          }
        }

        // 回退：统计 aiTags
        final aiTags = spot.aiTags;
        if (aiTags != null) {
          for (final aiTag in aiTags) {
            final tagStr = _extractTagString(aiTag);
            if (tagStr.isNotEmpty && !_isInvalidTag(tagStr)) {
              final normalizedAiTag = _capitalizeTag(tagStr);
              tagCounts[normalizedAiTag] =
                  (tagCounts[normalizedAiTag] ?? 0) + 1;
            }
          }
        }
      }
    }

    // 按出现次数从多到少排序，最多取 8 个
    final sortedTags = tagCounts.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    return sortedTags.take(8).map((e) => e.key).toList();
  }

  /// 根据选中的标签和搜索词筛选地点
  List<map_page.Spot> get _filteredSpots {
    // 如果有搜索结果，优先使用搜索结果
    if (_hasSearchResults) {
      return _searchResultSpots;
    }

    var spots = _mapSpots.toList();

    // 按标签筛选 - 检查 tags 列表（大小写不敏感）
    if (_selectedTags.isNotEmpty) {
      spots = spots.where((spot) {
        final spotTags = spot.tags.map((t) => t.toLowerCase()).toSet();
        return _selectedTags.any((tag) => spotTags.contains(tag.toLowerCase()));
      }).toList();
    }

    return spots;
  }

  map_page.Spot _convertSpot(Spot spot) {
    final List<String> imageList = spot.images;
    // 优先使用 spot.coverImage（普通封面图），避免使用合集封面图
    final String coverImg =
        (spot.coverImage != null && spot.coverImage!.isNotEmpty)
            ? spot.coverImage!
            : (imageList.isNotEmpty ? imageList.first : '');

    // 优先使用 displayTagsEn，过滤无效标签，首字母大写（与 _getAllUniqueTags 保持一致）
    final List<String> tagList = [];
    final displayTags = spot.displayTagsEn;
    if (displayTags != null && displayTags.isNotEmpty) {
      for (final tag in displayTags) {
        final normalized = tag.trim();
        if (normalized.isNotEmpty && !_isInvalidTag(normalized)) {
          tagList.add(_capitalizeTag(normalized));
        }
      }
    } else {
      // 回退：使用 tags
      for (final tag in spot.tags) {
        final normalized = tag.trim();
        if (normalized.isNotEmpty && !_isInvalidTag(normalized)) {
          tagList.add(_capitalizeTag(normalized));
        }
      }
      // 回退：添加 category
      final String category = (spot.category ?? '').trim();
      if (category.isNotEmpty && !_isInvalidTag(category)) {
        final capitalizedCategory = _capitalizeTag(category);
        if (!tagList.contains(capitalizedCategory)) {
          tagList.add(capitalizedCategory);
        }
      }
    }

    final String category = (spot.category ?? 'place').trim();

    return map_page.Spot(
      id: spot.id,
      name: spot.name,
      city: spot.city ?? 'Unknown',
      country: spot.country,
      category:
          category.isNotEmpty && !_isInvalidTag(category) ? category : 'place',
      latitude: spot.latitude,
      longitude: spot.longitude,
      rating: spot.rating ?? 0.0,
      ratingCount: spot.ratingCount ?? 0,
      coverImage: coverImg,
      images: imageList,
      tags: tagList,
      aiSummary: null,
      // 详情页需要的额外字段
      address: spot.address,
      phoneNumber: spot.phoneNumber,
      website: spot.website,
      openingHours: spot.openingHours,
      // 剧照数据
      customFields: spot.customFields,
    );
  }

  void _onCardPageChanged() {
    if (!_cardPageController.hasClients) return;

    final page = _cardPageController.page?.round();
    final spots = _carouselSpots.isNotEmpty ? _carouselSpots : _filteredSpots;
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
    // 重新计算卡片列表，让被点击的地点在第一位
    final newCarousel = _computeNearbySpots(spot);
    
    _skipNextRecenter = true;
    
    setState(() {
      _selectedSpot = spot;
      _carouselSpots = newCarousel;
      _currentCardIndex = 0;
    });
    
    // 直接跳转到第一个位置
    _jumpToPage(0);
  }

  /// 计算按距离排序的地点列表，被点击的地点在第一位
  List<map_page.Spot> _computeNearbySpots(map_page.Spot anchor) {
    final spots = _filteredSpots;
    if (spots.isEmpty) return const [];
    
    final sorted = List<map_page.Spot>.from(spots)
      ..sort((a, b) => _distanceBetween(
        a.latitude, a.longitude, anchor.latitude, anchor.longitude,
      ).compareTo(_distanceBetween(
        b.latitude, b.longitude, anchor.latitude, anchor.longitude,
      )));
    
    return sorted;
  }

  double _distanceBetween(double lat1, double lng1, double lat2, double lng2) {
    const radius = 6371000.0;
    final dLat = (lat2 - lat1) * math.pi / 180;
    final dLng = (lng2 - lng1) * math.pi / 180;
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(lat1 * math.pi / 180) * math.cos(lat2 * math.pi / 180) *
        math.sin(dLng / 2) * math.sin(dLng / 2);
    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    return radius * c;
  }

  void _jumpToPage(int index) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_cardPageController.hasClients) {
        _cardPageController.jumpToPage(index);
      }
    });
  }

  void _showSpotDetail(map_page.Spot spot) async {
    final now = DateTime.now();

    // 防抖：如果是同一个地点且点击间隔小于1秒，则忽略
    if (_lastClickedSpotId == spot.id &&
        _lastClickTime != null &&
        now.difference(_lastClickTime!).inMilliseconds < 1000) {
      print(
        '🔧 [myland_spots_map_page.dart] Debouncing rapid clicks for ${spot.name}',
      );
      return;
    }

    _lastClickedSpotId = spot.id;
    _lastClickTime = now;

    // Provide optimistic initial state to avoid flicker; modal will reconcile with API.
    final isMustGo = widget.tabLabel == 'MustGo';
    final isTodaysPlan = widget.tabLabel == "Today's Plan";

    // 加载完整的状态信息（包括 check-in 数据）
    bool? isSaved = true;
    bool? isVisited;
    DateTime? visitDate;
    int? userRating;
    String? userNotes;
    List<String>? userPhotos;
    String? destinationId;
    Map<String, dynamic>? linkedCollection;

    try {
      final authState = ref.read(authProvider);
      if (authState.isAuthenticated) {
        // 先显示loading indicator
        if (mounted) {
          showDialog<void>(
            context: context,
            barrierDismissible: false,
            builder: (context) => const Center(
              child: CircularProgressIndicator(color: AppTheme.primaryYellow),
            ),
          );
        }

        // 等待可能正在进行的收藏/取消收藏操作完成
        await WishlistStatusCache.awaitPendingOperation(spot.id);
        if (spot.name.isNotEmpty) {
          await WishlistStatusCache.awaitPendingOperation(spot.name);
        }

        final tripRepo = ref.read(tripRepositoryProvider);
        final trips = await tripRepo.getMyTrips().timeout(
              const Duration(seconds: 2),
              onTimeout: () => <Trip>[],
            );

        // 查找包含这个 spot 的 trip
        for (final trip in trips) {
          // 优先使用 getMyTrips 已包含的 tripSpots，避免额外请求
          List<TripSpot> tripSpots = trip.tripSpots ?? [];
          if (tripSpots.isEmpty) {
            final tripDetail = await tripRepo.getTripById(trip.id);
            tripSpots = tripDetail.tripSpots ?? [];
          }

          for (final ts in tripSpots) {
            // 匹配逻辑：比较 UUID 或 googlePlaceId
            // spot.id 在 map_page.Spot 中实际上是 googlePlaceId
            final tsSpot = ts.spot;
            final matchById = tsSpot?.id == spot.id;
            final matchByGooglePlaceId = tsSpot?.googlePlaceId == spot.id;

            if (matchById || matchByGooglePlaceId) {
              isSaved = ts.isSaved == true;
              isVisited = ts.isVisited == true;
              visitDate = ts.visitDate;
              userRating = ts.userRating;
              userNotes = ts.userNotes;
              userPhotos = ts.userPhotos?.cast<String>();
              destinationId = trip.id;

              // 调试日志
              print('📍 [MyLandSpotsMap] Found spot status for ${spot.name}:');
              print('  - matched by: ${matchById ? "id" : "googlePlaceId"}');
              print('  - isVisited: $isVisited');
              print('  - visitDate: $visitDate');
              print('  - userRating: $userRating');
              print('  - userNotes: $userNotes');
              print('  - userPhotos: ${userPhotos?.length ?? 0} photos');

              // 💾 保存到缓存
              WishlistStatusCache.updateFullStatus(
                spot.id,
                destinationId: destinationId,
                isSaved: isSaved,
                isVisited: isVisited,
                visitDate: visitDate,
                userRating: userRating,
                userNotes: userNotes,
                userPhotos: userPhotos,
              );

              break;
            }
          }
          if (isSaved != null && destinationId != null) break;
        }

        // 预加载合集数据（避免详情页闪现）
        try {
          final uuidRegex = RegExp(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
            caseSensitive: false,
          );
          if (uuidRegex.hasMatch(spot.id)) {
            final collectionRepo = ref.read(collectionRepositoryProvider);
            final collections =
                await collectionRepo.getCollectionsForPlace(spot.id).timeout(
                      const Duration(milliseconds: 1200),
                      onTimeout: () => [],
                    );
            if (collections.isNotEmpty) {
              // 随机选择一个合集展示
              final random = math.Random();
              linkedCollection =
                  collections[random.nextInt(collections.length)];
            }
          }
        } catch (e) {
          print('⚠️ [MyLandSpotsMap] Error loading linked collection: $e');
        }

        // 关闭loading dialog
        if (mounted && Navigator.canPop(context)) {
          Navigator.pop(context);
        }
      }
    } catch (e) {
      print('❌ [MyLandSpotsMap] Error loading spot status: $e');
      // 关闭loading dialog
      if (mounted && Navigator.canPop(context)) {
        Navigator.pop(context);
      }
      // 失败时使用缓存
      final fullStatus = WishlistStatusCache.getFullStatus(spot.id);
      isSaved = fullStatus?.isSaved ?? fullStatus?.destinationId != null;
      isVisited = fullStatus?.isVisited;
      visitDate = fullStatus?.visitDate;
      userRating = fullStatus?.userRating;
      userNotes = fullStatus?.userNotes;
      userPhotos = fullStatus?.userPhotos;
      destinationId = fullStatus?.destinationId;
    }

    if (!mounted) return;

    showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => UnifiedSpotDetailModal(
        spot: spot,
        linkedCollection: linkedCollection,
        initialIsSaved: isSaved,
        initialIsMustGo: isMustGo,
        initialIsTodaysPlan: isTodaysPlan,
        initialIsVisited: isVisited,
        initialVisitDate: visitDate,
        initialUserRating: userRating,
        initialUserNotes: userNotes,
        initialUserPhotos: userPhotos,
        initialDestinationId: destinationId,
      ),
    ).then((hasChanged) {
      // Only refresh if status actually changed
      if (hasChanged ?? false) {
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

    // 获取带统计信息的国家城市数据
    final statsNotifier = ref.read(countriesCitiesStatsProvider.notifier);
    final statsState = ref.read(countriesCitiesStatsProvider);

    // 如果数据还没加载，先加载
    if (!statsState.hasData && !statsState.isLoading) {
      statsNotifier.load();
    }

    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => _CountryCityPickerSheet(
        selectedCity: _currentCity,
        allCities: widget.allCities,
        onCitySelected: (city, country) {
          Navigator.pop(sheetContext);
          setState(() {
            _currentCountry = country;
          });
          _switchCity(city);
        },
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
    // 使用 _carouselSpots 如果已设置，否则使用 spots
    final carouselSpots = _carouselSpots.isNotEmpty ? _carouselSpots : spots;

    return WillPopScope(
      onWillPop: () async {
        _handleExit();
        return false;
      },
      child: Scaffold(
        resizeToAvoidBottomInset: false,
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
                  if (allTags.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    _buildTagBar(allTags),
                  ],
                ],
              ),
            ),

            // 底部地点卡片滑动列表 - 与 map_page_new.dart 保持一致
            if (spots.isNotEmpty && !_isExiting)
              Positioned(
                bottom: 32, // 与 map_page_new.dart 保持一致
                left: 0,
                right: 0,
                child: _buildBottomCards(carouselSpots),
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
                      borderRadius:
                          BorderRadius.circular(AppTheme.radiusMedium),
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
      ),
    );
  }

  Widget _buildAppBar(BuildContext context) {
    final paddingTop = MediaQuery.of(context).padding.top;
    return Container(
      padding: EdgeInsets.only(
        top: paddingTop + 12,
        left: 16,
        right: 16,
        bottom: 10,
      ),
      child: Row(
        children: [
          // 城市筛选器（可点击切换城市）- 与 map_page_new 保持一致
          GestureDetector(
            onTap: widget.allCities.isNotEmpty ? _showCityPicker : null,
            child: Container(
              height: 44,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(22),
                border: Border.all(color: AppTheme.black, width: 1),
                boxShadow: AppTheme.searchBoxShadow,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _currentCity,
                    style: AppTheme.bodySmall(context).copyWith(
                      color: AppTheme.black,
                    ),
                  ),
                  if (widget.allCities.isNotEmpty) ...[
                    const SizedBox(width: 4),
                    const Icon(Icons.keyboard_arrow_down, size: 16),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          // 搜索框
          Expanded(child: _buildSearchBar(context)),
          const SizedBox(width: 8),
          // 缩小按钮（返回）- 与 map_page_new 保持一致
          IconButtonCustom(
            icon: Icons.fullscreen_exit,
            size: 44,
            onPressed: _handleExit,
            backgroundColor: Colors.white,
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar(BuildContext context) => Container(
        height: 44,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: AppTheme.black, width: 1),
          boxShadow: AppTheme.searchBoxShadow,
        ),
        child: Row(
          children: [
            const SizedBox(width: 14),
            if (_isSearching)
              const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation<Color>(AppTheme.black),
                ),
              )
            else
              const Icon(
                Icons.search,
                size: 18,
                color: AppTheme.mediumGray,
              ),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: _searchController,
                focusNode: _searchFocusNode,
                style: AppTheme.bodySmall(context).copyWith(
                  color: AppTheme.black,
                ),
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => _performSearch(),
                decoration: InputDecoration(
                  hintText: 'Search spots',
                  hintStyle: AppTheme.bodySmall(context).copyWith(
                    color: AppTheme.mediumGray,
                  ),
                  border: InputBorder.none,
                  isDense: true,
                  contentPadding: EdgeInsets.zero,
                ),
              ),
            ),
            if (_searchController.text.isNotEmpty)
              GestureDetector(
                onTap: _clearSearch,
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 8),
                  child: Icon(
                    Icons.close,
                    size: 16,
                    color: AppTheme.mediumGray,
                  ),
                ),
              )
            else ...[
              // Ask AI 入口
              GestureDetector(
                onTap: _navigateToAIChat,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('✨', style: TextStyle(fontSize: 14)),
                    const SizedBox(width: 4),
                    Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'ask AI',
                          style: AppTheme.bodySmall(context).copyWith(
                            color: AppTheme.black,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Container(
                          width: 38,
                          height: 2,
                          decoration: BoxDecoration(
                            color: AppTheme.primaryYellow,
                            borderRadius: BorderRadius.circular(1),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
            ],
          ],
        ),
      );

  /// 跳转到 AI 对话页
  void _navigateToAIChat() {
    Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (context) => const AIAssistantPage(),
      ),
    );
  }

  /// 搜索同义词映射 - 支持语义搜索
  static const Map<String, List<String>> _searchSynonyms = {
    'bread': ['bakery', 'boulangerie', 'pastry', 'croissant', 'baguette'],
    'bakery': ['bread', 'pastry', 'croissant', 'boulangerie'],
    'coffee': ['cafe', 'café', 'espresso', 'latte', 'cappuccino'],
    'cafe': ['coffee', 'café', 'espresso'],
    'food': ['restaurant', 'dining', 'eatery', 'bistro'],
    'restaurant': ['food', 'dining', 'eatery', 'bistro'],
    'art': ['museum', 'gallery', 'exhibition'],
    'museum': ['art', 'gallery', 'exhibition', 'history'],
    'shop': ['store', 'shopping', 'boutique', 'retail'],
    'shopping': ['shop', 'store', 'boutique', 'mall'],
    'bar': ['pub', 'cocktail', 'wine', 'beer'],
    'pub': ['bar', 'beer', 'ale'],
    'hotel': ['accommodation', 'lodging', 'inn', 'hostel'],
    'park': ['garden', 'nature', 'green', 'outdoor'],
    'garden': ['park', 'botanical', 'nature'],
    'temple': ['shrine', 'church', 'mosque', 'religious'],
    'church': ['temple', 'cathedral', 'chapel', 'religious'],
  };

  /// 获取搜索词的扩展词列表（包含同义词）
  List<String> _getExpandedSearchTerms(String query) {
    final lowerQuery = query.toLowerCase();
    final terms = <String>{lowerQuery};

    // 添加同义词
    for (final entry in _searchSynonyms.entries) {
      if (entry.key == lowerQuery || entry.value.contains(lowerQuery)) {
        terms.add(entry.key);
        terms.addAll(entry.value);
      }
    }

    return terms.toList();
  }

  /// 执行搜索 - 在已收藏的地点中搜索（支持同义词）
  Future<void> _performSearch() async {
    final query = _searchController.text.trim();
    if (query.isEmpty) return;

    // 收起键盘
    _searchFocusNode.unfocus();

    setState(() {
      _isSearching = true;
      _selectedTags.clear(); // 清除标签筛选
    });

    try {
      print('🔍 [MyLandSpotsMapPage] 搜索: "$query" in $_currentCity');

      // 获取扩展搜索词（包含同义词）
      final searchTerms = _getExpandedSearchTerms(query);
      print('🔍 [MyLandSpotsMapPage] 扩展搜索词: $searchTerms');

      // 在已收藏的地点中搜索
      final matchedSpots = _mapSpots.where((spot) {
        final name = spot.name.toLowerCase();
        final category = spot.category.toLowerCase();
        final tags = spot.tags.map((t) => t.toLowerCase()).toList();
        final city = spot.city.toLowerCase();

        // 检查是否匹配任何搜索词
        for (final term in searchTerms) {
          if (name.contains(term) ||
              category.contains(term) ||
              tags.any((t) => t.contains(term)) ||
              city.contains(term)) {
            return true;
          }
        }
        return false;
      }).toList();

      print('🔍 [MyLandSpotsMapPage] 搜索结果: ${matchedSpots.length} 个地点');

      if (matchedSpots.isEmpty) {
        // 没有结果，显示 toast
        if (mounted) {
          DialogUtils.showToast(
            context,
            'Sorry no related places, please try again',
          );
          setState(() {
            _isSearching = false;
          });
        }
        return;
      }

      // 计算中心点和缩放
      final (:center, :zoom) = _calculateCenterAndZoomForSpots(matchedSpots);

      setState(() {
        _searchResultSpots = matchedSpots;
        _hasSearchResults = true;
        _isSearching = false;
        _selectedSpot = matchedSpots.first;
        _currentCardIndex = 0;
      });

      // 跳转到第一个卡片
      if (_cardPageController.hasClients) {
        _cardPageController.jumpToPage(0);
      }

      // 移动相机
      _mapKey.currentState?.animateCamera(center, zoom: zoom);
    } catch (e) {
      print('❌ [MyLandSpotsMapPage] 搜索失败: $e');
      if (mounted) {
        DialogUtils.showToast(
          context,
          'Sorry no related places, please try again',
        );
        setState(() {
          _isSearching = false;
        });
      }
    }
  }

  /// 清除搜索
  void _clearSearch() {
    _searchController.clear();

    setState(() {
      _searchResultSpots = [];
      _hasSearchResults = false;
      _selectedSpot = _mapSpots.isNotEmpty ? _mapSpots.first : null;
      _currentCardIndex = 0;
    });

    // 跳转到第一个卡片
    if (_cardPageController.hasClients) {
      _cardPageController.jumpToPage(0);
    }

    // 移动相机到第一个地点
    if (_mapSpots.isNotEmpty) {
      final first = _mapSpots.first;
      _mapKey.currentState?.animateCamera(
        Position(first.longitude, first.latitude),
        zoom: 14.0,
      );
    }
  }

  /// 计算地点的中心点和缩放级别
  ({Position center, double zoom}) _calculateCenterAndZoomForSpots(
    List<map_page.Spot> spots,
  ) {
    if (spots.isEmpty) {
      return (center: Position(139.6503, 35.6762), zoom: 14.0);
    }

    if (spots.length == 1) {
      return (
        center: Position(spots.first.longitude, spots.first.latitude),
        zoom: 14.0
      );
    }

    double minLat = spots.first.latitude;
    double maxLat = spots.first.latitude;
    double minLng = spots.first.longitude;
    double maxLng = spots.first.longitude;

    for (final spot in spots) {
      if (spot.latitude < minLat) minLat = spot.latitude;
      if (spot.latitude > maxLat) maxLat = spot.latitude;
      if (spot.longitude < minLng) minLng = spot.longitude;
      if (spot.longitude > maxLng) maxLng = spot.longitude;
    }

    final centerLat = (minLat + maxLat) / 2;
    final centerLng = (minLng + maxLng) / 2;

    // 计算缩放级别
    final latDiff = maxLat - minLat;
    final lngDiff = maxLng - minLng;
    final maxDiff = math.max(latDiff, lngDiff);

    double zoom = 14.0;
    if (maxDiff > 0.5) {
      zoom = 10.0;
    } else if (maxDiff > 0.2) {
      zoom = 11.0;
    } else if (maxDiff > 0.1) {
      zoom = 12.0;
    } else if (maxDiff > 0.05) {
      zoom = 13.0;
    }

    return (center: Position(centerLng, centerLat), zoom: zoom);
  }

  Widget _buildTagBar(List<String> tags) {
    if (tags.isEmpty) {
      return const SizedBox.shrink();
    }

    return SizedBox(
      height: 38,
      child: ListView.separated(
        padding: const EdgeInsets.only(left: 16, right: 16, bottom: 4),
        scrollDirection: Axis.horizontal,
        clipBehavior: Clip.none,
        itemCount: tags.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final tag = tags[index];
          final isSelected = _selectedTags.contains(tag);
          final emoji = _tagEmoji(tag);

          return GestureDetector(
            onTap: () => _toggleTag(tag),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: isSelected ? AppTheme.primaryYellow : Colors.white,
                borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                border: Border.all(color: AppTheme.black, width: 1),
                boxShadow: AppTheme.searchBoxShadow,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(emoji, style: const TextStyle(fontSize: 13)),
                  const SizedBox(width: 4),
                  Text(
                    tag,
                    style: AppTheme.labelSmall(context).copyWith(
                      color: AppTheme.black,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildBottomCards(List<map_page.Spot> spots) {
    const double cardWidth = 210;
    const double cardHeight = 280; // 宽:高 = 3:4

    return SizedBox(
      height: cardHeight + 8, // 固定高度 + 阴影空间
      child: PageView.builder(
        controller: _cardPageController,
        padEnds: true,
        clipBehavior: Clip.none,
        itemCount: spots.length,
        itemBuilder: (context, index) {
          final spot = spots[index];
          final isCenter = index == _currentCardIndex;

          return AnimatedScale(
            scale: isCenter ? 1.0 : 0.92,
            duration: const Duration(milliseconds: 220),
            child: Center(
              child: SizedBox(
                width: cardWidth,
                height: cardHeight,
                child: _BottomSpotCard(
                  spot: spot,
                  isVisited: widget.visitedSpots?[spot.id] ?? false,
                  onTap: () {
                    // Always show detail page on tap
                    _showSpotDetail(spot);
                  },
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// 底部地点卡片组件 - 带取色功能
class _BottomSpotCard extends StatefulWidget {
  const _BottomSpotCard({
    required this.spot,
    required this.onTap,
    this.isVisited = false,
  });

  final map_page.Spot spot;
  final VoidCallback onTap;
  final bool isVisited;

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
      if (widget.spot.coverImage.startsWith('data:image/')) {
        imageProvider = MemoryImage(_decodeBase64Image(widget.spot.coverImage));
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
          // 使用 ColorUtils 获取较深的主色，排除白色和浅色
          _dominantColor = ColorUtils.getDarkDominantColor(
            paletteGenerator,
            fallback: Colors.black,
          );
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _dominantColor = Colors.black);
      }
    }
  }

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
        onTap: widget.onTap,
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 6),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
            border: Border.all(
              color: AppTheme.black,
              width: AppTheme.borderMedium,
            ),
            boxShadow: AppTheme.cardShadow,
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppTheme.radiusMedium - 1),
            child: Stack(
              fit: StackFit.expand,
              children: [
                _buildCover(),
                // Check-in indicator badge
                if (widget.isVisited)
                  Positioned(
                    top: 10,
                    right: 10,
                    child: Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        color: AppTheme.primaryYellow,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: AppTheme.black,
                          width: 1.5,
                        ),
                        boxShadow: const [
                          BoxShadow(
                            color: AppTheme.black,
                            blurRadius: 0,
                            offset: Offset(0, 1),
                          ),
                        ],
                      ),
                      child: const Icon(
                        Icons.check,
                        color: AppTheme.black,
                        size: 14,
                      ),
                    ),
                  ),
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
                Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Spacer(),
                      // 地点名称
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
                      // 评分
                      _RatingRow(
                        rating: widget.spot.rating,
                        ratingCount: widget.spot.ratingCount,
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
    const placeholder = VagoPlaceholderSmall();

    if (widget.spot.coverImage.isEmpty) return placeholder;
    if (widget.spot.coverImage.startsWith('data:image/')) {
      final data = _decodeBase64Image(widget.spot.coverImage);
      if (data.isEmpty) return placeholder;
      return Image.memory(
        data,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => placeholder,
      );
    }

    return Image.network(
      widget.spot.coverImage,
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
    // 没有评分时不显示任何内容
    if (rating <= 0 || ratingCount <= 0) {
      return const SizedBox.shrink();
    }

    return Row(
      children: [
        const Icon(
          Icons.star,
          color: AppTheme.primaryYellow,
          size: 18,
        ),
        const SizedBox(width: 6),
        Text(
          rating.toStringAsFixed(1),
          style: AppTheme.bodyMedium(context).copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
        if (ratingCount > 0) ...[
          const SizedBox(width: 8),
          Text(
            formatRatingCount(ratingCount),
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

/// 国家城市选择器底部弹窗（使用带统计信息的数据）
class _CountryCityPickerSheet extends ConsumerStatefulWidget {
  const _CountryCityPickerSheet({
    required this.selectedCity,
    required this.allCities,
    required this.onCitySelected,
  });

  final String selectedCity;
  final List<String> allCities;
  final void Function(String city, String? country) onCitySelected;

  @override
  ConsumerState<_CountryCityPickerSheet> createState() =>
      _CountryCityPickerSheetState();
}

class _CountryCityPickerSheetState
    extends ConsumerState<_CountryCityPickerSheet> {
  String? _selectedCountry;

  @override
  void initState() {
    super.initState();
    // 确保数据已加载
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final statsState = ref.read(countriesCitiesStatsProvider);
      if (!statsState.hasData && !statsState.isLoading) {
        ref.read(countriesCitiesStatsProvider.notifier).load();
      }
      // 根据当前选中的城市找到对应的国家
      _updateSelectedCountry();
    });
  }

  void _updateSelectedCountry() {
    final statsState = ref.read(countriesCitiesStatsProvider);
    if (statsState.hasData) {
      final country = _findCountryForCity(widget.selectedCity, statsState);
      if (country != null && country != _selectedCountry) {
        setState(() {
          _selectedCountry = country;
        });
      }
    }
  }

  String? _findCountryForCity(
    String city,
    CountriesCitiesStatsState statsState,
  ) {
    // 跳过 "All" 选项
    if (city == 'All') {
      return statsState.countries.isNotEmpty
          ? statsState.countries.first.name
          : null;
    }
    for (final country in statsState.countries) {
      if (country.cities.any((c) => c.name == city)) {
        return country.name;
      }
    }
    return statsState.countries.isNotEmpty
        ? statsState.countries.first.name
        : null;
  }

  @override
  Widget build(BuildContext context) {
    final statsState = ref.watch(countriesCitiesStatsProvider);

    // 如果选中的国家还没设置，尝试设置
    if (_selectedCountry == null && statsState.hasData) {
      _selectedCountry = _findCountryForCity(widget.selectedCity, statsState);
    }

    return DraggableScrollableSheet(
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
              child: statsState.isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : statsState.hasData
                      ? _buildCountryCityColumns(scrollController, statsState)
                      : _buildSimpleCityList(scrollController),
            ),
          ],
        ),
      ),
    );
  }

  /// 简单城市列表（没有国家数据时使用）
  Widget _buildSimpleCityList(ScrollController scrollController) =>
      ListView.builder(
        controller: scrollController,
        itemCount: widget.allCities.length,
        itemBuilder: (context, index) {
          final city = widget.allCities[index];
          final isSelected = city == widget.selectedCity;
          return GestureDetector(
            onTap: () => widget.onCitySelected(city, null),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
              color: isSelected
                  ? AppTheme.primaryYellow.withOpacity(0.2)
                  : Colors.transparent,
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      city,
                      style: AppTheme.bodyMedium(context).copyWith(
                        fontWeight:
                            isSelected ? FontWeight.bold : FontWeight.normal,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (isSelected)
                    const Icon(
                      Icons.check,
                      size: 18,
                      color: AppTheme.primaryYellow,
                    ),
                ],
              ),
            ),
          );
        },
      );

  /// 国家城市两列选择
  Widget _buildCountryCityColumns(
    ScrollController scrollController,
    CountriesCitiesStatsState statsState,
  ) {
    final countries = statsState.countries;
    // 只显示用户收藏的城市（在 allCities 中的城市）
    final userCities = widget.allCities.where((c) => c != 'All').toSet();
    final citiesForCountry = _selectedCountry != null
        ? statsState
            .getCities(_selectedCountry!)
            .where((c) => userCities.contains(c.name))
            .toList()
        : <CityStats>[];

    // 过滤只显示有用户收藏城市的国家
    final countriesWithUserCities = countries
        .where(
            (country) => country.cities.any((c) => userCities.contains(c.name)))
        .toList();

    return Row(
      children: [
        // 左侧国家列表
        Expanded(
          flex: 2,
          child: Container(
            decoration: const BoxDecoration(
              border: Border(
                right: BorderSide(color: AppTheme.border, width: 1),
              ),
            ),
            child: ListView.builder(
              itemCount: countriesWithUserCities.length,
              itemBuilder: (context, index) {
                final country = countriesWithUserCities[index];
                final isSelected = country.name == _selectedCountry;
                return GestureDetector(
                  onTap: () {
                    setState(() {
                      _selectedCountry = country.name;
                    });
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 14,
                    ),
                    color: isSelected
                        ? AppTheme.primaryYellow.withOpacity(0.2)
                        : Colors.transparent,
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            country.name,
                            style: AppTheme.bodyMedium(context).copyWith(
                              fontWeight: isSelected
                                  ? FontWeight.bold
                                  : FontWeight.normal,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (isSelected)
                          const Icon(
                            Icons.chevron_right,
                            size: 18,
                            color: AppTheme.mediumGray,
                          ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ),
        // 右侧城市列表
        Expanded(
          flex: 3,
          child: ListView.builder(
            controller: scrollController,
            itemCount: citiesForCountry.length,
            itemBuilder: (context, index) {
              final city = citiesForCountry[index];
              final isSelected = city.name == widget.selectedCity;
              return GestureDetector(
                onTap: () => widget.onCitySelected(city.name, _selectedCountry),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                  color: isSelected
                      ? AppTheme.primaryYellow.withOpacity(0.2)
                      : Colors.transparent,
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          city.name,
                          style: AppTheme.bodyMedium(context).copyWith(
                            fontWeight: isSelected
                                ? FontWeight.bold
                                : FontWeight.normal,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (isSelected)
                        const Icon(
                          Icons.check,
                          size: 18,
                          color: AppTheme.primaryYellow,
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
