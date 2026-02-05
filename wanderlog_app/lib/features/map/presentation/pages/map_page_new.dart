import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' as picker;
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:palette_generator/palette_generator.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/core/utils/category_emoji.dart';
import 'package:wanderlog/core/utils/color_utils.dart';
import 'package:wanderlog/core/utils/dialog_utils.dart';
import 'package:wanderlog/features/map/data/models/public_place_dto.dart';
import 'package:wanderlog/features/map/data/supabase_place_repository.dart';
import 'package:wanderlog/features/map/presentation/widgets/mapbox_spot_map.dart';
import 'package:wanderlog/features/map/providers/public_place_providers.dart';
import 'package:wanderlog/features/map/providers/places_cache_provider.dart';
import 'package:wanderlog/shared/widgets/vago_placeholder.dart';
import 'package:wanderlog/features/search/data/search_repository.dart';
import 'package:wanderlog/features/search/providers/countries_cities_stats_provider.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/ai_recognition/providers/wishlist_status_provider.dart';
import 'package:wanderlog/shared/widgets/unified_spot_detail_modal.dart';
import 'package:wanderlog/shared/utils/number_format_utils.dart';
import 'package:wanderlog/features/ai_recognition/presentation/pages/ai_assistant_page.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/features/collections/providers/collection_providers.dart';
import 'package:wanderlog/shared/models/trip_model.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart';

/// 地点来源枚举
enum SpotSource {
  google, // 来自 Google Places API
  cache, // 来自数据库缓存
  ai, // 来自 AI 生成（未验证）
}

class Spot {
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
    this.collectionCoverImage,
    this.displayTagsEn = const [],
    this.description,
    this.aiSummary,
    this.isFromAI = false,
    this.isVerified = true,
    this.recommendationPhrase,
    this.source = SpotSource.cache,
    // 详情页需要的额外字段
    this.address,
    this.phoneNumber,
    this.website,
    this.openingHours,
    this.country,
    this.customFields,
  });

  final String id;
  final String name;
  final String city;
  final String? country;
  final String category;
  final double latitude;
  final double longitude;
  final double rating;
  final int ratingCount;
  final String coverImage;
  final String? collectionCoverImage;
  final List<String> images;
  final List<String> tags;

  /// 后端计算好的展示标签（category + aiTags + tags 的合并结果）
  final List<String> displayTagsEn;

  /// 后台设置的描述（优先显示）
  final String? description;

  /// AI 生成的描述（description 为空时显示）
  final String? aiSummary;
  final bool isFromAI;

  /// 是否有 Google 验证（有 google_place_id）
  /// Requirements: 11.1, 11.4
  final bool isVerified;

  /// AI 推荐短语（如 "highly rated", "local favorite", "hidden gem"）
  /// AI-only 地点时显示此字段替代评分
  /// Requirements: 11.1, 11.4
  final String? recommendationPhrase;

  /// 数据来源
  /// Requirements: 11.1, 11.4
  final SpotSource source;

  /// 详情页需要的额外字段
  final String? address;
  final String? phoneNumber;
  final String? website;
  final Map<String, dynamic>? openingHours;

  /// 自定义字段（包含剧照等数据）
  final PlaceCustomFields? customFields;

  /// 是否是 AI-only 地点（未经 Google 验证）
  bool get isAIOnly => !isVerified && source == SpotSource.ai;

  /// 是否有评分
  bool get hasRating => rating > 0;

  /// 是否有有效的封面图片（排除占位符 URL）
  bool get hasValidCoverImage {
    if (coverImage.isEmpty) return false;
    if (coverImage.contains('example.com')) return false;
    if (coverImage.contains('placeholder')) return false;
    // 必须是 http/https 开头的有效 URL
    return coverImage.startsWith('http');
  }

  /// 复制并修改
  Spot copyWith({
    String? id,
    String? name,
    String? city,
    String? country,
    String? category,
    double? latitude,
    double? longitude,
    double? rating,
    int? ratingCount,
    String? coverImage,
    String? collectionCoverImage,
    List<String>? images,
    List<String>? tags,
    List<String>? displayTagsEn,
    String? description,
    String? aiSummary,
    bool? isFromAI,
    bool? isVerified,
    String? recommendationPhrase,
    SpotSource? source,
    String? address,
    String? phoneNumber,
    String? website,
    Map<String, dynamic>? openingHours,
    PlaceCustomFields? customFields,
  }) =>
      Spot(
        id: id ?? this.id,
        name: name ?? this.name,
        city: city ?? this.city,
        country: country ?? this.country,
        category: category ?? this.category,
        latitude: latitude ?? this.latitude,
        longitude: longitude ?? this.longitude,
        rating: rating ?? this.rating,
        ratingCount: ratingCount ?? this.ratingCount,
        coverImage: coverImage ?? this.coverImage,
        collectionCoverImage: collectionCoverImage ?? this.collectionCoverImage,
        images: images ?? this.images,
        tags: tags ?? this.tags,
        displayTagsEn: displayTagsEn ?? this.displayTagsEn,
        description: description ?? this.description,
        aiSummary: aiSummary ?? this.aiSummary,
        isFromAI: isFromAI ?? this.isFromAI,
        isVerified: isVerified ?? this.isVerified,
        recommendationPhrase: recommendationPhrase ?? this.recommendationPhrase,
        source: source ?? this.source,
        address: address ?? this.address,
        phoneNumber: phoneNumber ?? this.phoneNumber,
        website: website ?? this.website,
        openingHours: openingHours ?? this.openingHours,
        customFields: customFields ?? this.customFields,
      );
}

class MapPageSnapshot {
  MapPageSnapshot({
    required this.selectedCity,
    required this.selectedTags,
    required this.currentZoom,
    required this.carouselSpots,
    required this.currentCardIndex,
    this.selectedSpot,
    this.currentCenter,
    this.searchImage,
  });

  final String selectedCity;
  final Spot? selectedSpot;
  final Set<String> selectedTags;
  final Position? currentCenter;
  final double currentZoom;
  final picker.XFile? searchImage;
  final List<Spot> carouselSpots;
  final int currentCardIndex;

  MapPageSnapshot copyWith({
    String? selectedCity,
    Spot? selectedSpot,
    Set<String>? selectedTags,
    Position? currentCenter,
    double? currentZoom,
    picker.XFile? searchImage,
    List<Spot>? carouselSpots,
    int? currentCardIndex,
  }) =>
      MapPageSnapshot(
        selectedCity: selectedCity ?? this.selectedCity,
        selectedSpot: selectedSpot ?? this.selectedSpot,
        selectedTags: selectedTags != null
            ? Set<String>.from(selectedTags)
            : Set<String>.from(this.selectedTags),
        currentCenter: currentCenter ?? this.currentCenter,
        currentZoom: currentZoom ?? this.currentZoom,
        searchImage: searchImage ?? this.searchImage,
        carouselSpots: carouselSpots != null
            ? List<Spot>.from(carouselSpots)
            : List<Spot>.from(this.carouselSpots),
        currentCardIndex: currentCardIndex ?? this.currentCardIndex,
      );
}

class MapPage extends ConsumerStatefulWidget {
  const MapPage({
    super.key,
    this.startFullscreen = false,
    this.initialSnapshot,
    this.initialSpotOverride,
    this.onExitFullscreen,
    this.onFullscreenChanged,
    this.onBack,
    this.resetSelectionKey,
  });

  final bool startFullscreen;
  final MapPageSnapshot? initialSnapshot;
  final Spot? initialSpotOverride;
  final ValueChanged<MapPageSnapshot>? onExitFullscreen;
  final ValueChanged<bool>? onFullscreenChanged;
  final ValueChanged<String>? onBack;

  /// 当这个 key 变化时，重置选中状态
  final int? resetSelectionKey;

  @override
  ConsumerState<MapPage> createState() => _MapPageState();
}

class _MapPageState extends ConsumerState<MapPage> {
  static const String _mapHeroTag = 'map-page-map-hero';
  static const double _nonFullscreenTopInset = 0.0;
  static const double _collapsedMapZoom = 13.0;
  static const int _spotsPerCityLimit =
      100; // Increased to show more spots per city
  static const int _minCategoriesPerCity =
      1; // Reduced to include cities with fewer categories
  static const String _fallbackCoverImage =
      'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80';

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

  /// 检查是否为无效标签
  static bool _isInvalidTag(String tag) {
    final lowerTag = tag.toLowerCase().replaceAll(' ', '_');
    return _invalidTags.any((invalid) => invalid.toLowerCase() == lowerTag);
  }

  // 动态计算当前城市的热门标签（从缓存获取）
  List<String> get _dynamicTagOptions {
    // 优先使用后端计算的标签统计
    final cacheState = ref.read(placesCacheProvider);
    final cachedTags = cacheState.getTopTags(_selectedCity);
    if (cachedTags.isNotEmpty) {
      print(
        '🏷️ [_dynamicTagOptions] 使用缓存的标签: ${cachedTags.map((t) => '${t.name}(${t.count})').join(', ')}',
      );
      // 过滤无效标签
      return cachedTags
          .where((t) => !_isInvalidTag(t.name))
          .map((t) => t.name)
          .toList();
    }

    // 回退：基于当前加载的地点计算（复用 spots_tab.dart 的逻辑）
    final spots = _currentCitySpots;
    if (spots.isEmpty) return const [];

    // 统计所有标签出现次数
    final tagCounts = <String, int>{};

    for (final spot in spots) {
      // 优先使用 displayTagsEn（后端计算好的展示标签，包含 category + aiTags + tags）
      if (spot.displayTagsEn.isNotEmpty) {
        for (final tag in spot.displayTagsEn) {
          final trimmedTag = tag.trim();
          if (trimmedTag.isNotEmpty && !_isInvalidTag(trimmedTag)) {
            final normalizedTag = _capitalizeTag(trimmedTag);
            tagCounts[normalizedTag] = (tagCounts[normalizedTag] ?? 0) + 1;
          }
        }
      } else {
        // 回退：统计 category
        final category = spot.category.trim();
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
      }
    }

    // 按出现次数倒序排序，取前 10 个
    final sortedTags = tagCounts.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    // Debug logging
    print(
      '🏷️ [_dynamicTagOptions] 本地计算的标签: ${sortedTags.take(10).map((e) => '${e.key}(${e.value})').join(', ')}',
    );

    return sortedTags.take(10).map((e) => e.key).toList();
  }

  // 标签首字母大写
  String _capitalizeTag(String tag) {
    if (tag.isEmpty) return tag;
    return tag[0].toUpperCase() + tag.substring(1).toLowerCase();
  }

  final GlobalKey<MapboxSpotMapState> _mapKey = GlobalKey<MapboxSpotMapState>();
  late String _selectedCity;
  String? _selectedCountry; // 当前选中城市对应的国家
  Spot? _selectedSpot;
  late bool _isFullscreen;
  late final bool _isOverlayInstance;
  final TextEditingController _searchController = TextEditingController();
  late final PageController _cardPageController;
  int _currentCardIndex = 0;
  Position? _currentMapCenter;
  double _currentZoom = 13.0;

  // 防抖控制，避免快速重复点击
  String? _lastClickedSpotId;
  DateTime? _lastClickTime;
  final Set<String> _selectedTags = {};
  picker.XFile? _searchPickedImage;
  List<Spot> _carouselSpots = const [];
  bool _hasRequestedExit = false;
  bool _hideMapChrome = false;
  bool _isLaunchingOverlay = false;
  bool _isLoadingTaggedSpots = false; // 标签筛选加载状态
  bool _isSearching = false; // 搜索加载状态
  final FocusNode _searchFocusNode = FocusNode(); // 搜索框焦点

  Map<String, List<Spot>> _spotsByCity = const <String, List<Spot>>{};
  List<String> _availableCities = const <String>[];
  bool _isLoadingSpots = false;
  String? _loadingError;

  // Dynamic city coordinates - populated from place data
  final Map<String, Position> _cityCoordinates = <String, Position>{};

  @override
  void initState() {
    super.initState();
    _isOverlayInstance = widget.onExitFullscreen != null;
    _isFullscreen = widget.startFullscreen;
    _selectedCity =
        widget.initialSnapshot?.selectedCity ?? 'Paris'; // 默认值改为 Paris
    _selectedSpot = widget.initialSnapshot?.selectedSpot;
    _selectedTags.addAll(widget.initialSnapshot?.selectedTags ?? <String>{});
    _currentMapCenter = widget.initialSnapshot?.currentCenter;
    _currentZoom = widget.initialSnapshot?.currentZoom ?? _currentZoom;
    _searchPickedImage = widget.initialSnapshot?.searchImage;
    _carouselSpots = widget.initialSnapshot?.carouselSpots ?? const <Spot>[];
    _currentCardIndex =
        widget.initialSnapshot?.currentCardIndex ?? _currentCardIndex;

    final overrideSpot = widget.initialSpotOverride;
    if (overrideSpot != null) {
      _selectedCity = overrideSpot.city;
      _selectedSpot = overrideSpot;
      _carouselSpots = _computeNearbySpots(overrideSpot);
      _currentCardIndex = 0;
      _currentMapCenter =
          Position(overrideSpot.longitude, overrideSpot.latitude);
    }

    _cardPageController = PageController(
      viewportFraction: 0.55,
      initialPage: _currentCardIndex,
    );

    // 监听搜索框变化，用于显示/隐藏清除按钮
    _searchController.addListener(_onSearchTextChanged);

    // 监听 wishlistStatusProvider 变化，实时更新地图卡片状态
    ref.listenManual(wishlistStatusProvider, (previous, next) {
      print('🔄 [MapPage] wishlistStatusProvider changed, updating UI...');
      if (mounted) {
        setState(() {
          // 触发 UI 更新，卡片会从缓存读取最新状态
        });
      }
    });

    _loadPublicPlaces();

    // 预加载用户收藏状态到缓存
    _preloadWishlistStatus();
  }

  /// 预加载用户收藏状态，填充 WishlistStatusCache
  Future<void> _preloadWishlistStatus() async {
    final authState = ref.read(authProvider);
    if (!authState.isAuthenticated) return;

    try {
      // 触发 wishlistStatusProvider 加载，它会自动填充 WishlistStatusCache
      await ref.read(wishlistStatusProvider.future);
      // 触发重建以更新卡片状态显示
      if (mounted) setState(() {});
    } catch (e) {
      print('⚠️ [MapPage] Failed to preload wishlist status: $e');
    }
  }

  void _onSearchTextChanged() {
    // 触发 rebuild 以更新清除按钮的显示状态
    if (mounted) setState(() {});
  }

  @override
  void didUpdateWidget(covariant MapPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    // 当 resetSelectionKey 变化时，重置选中状态
    if (widget.resetSelectionKey != oldWidget.resetSelectionKey &&
        widget.resetSelectionKey != null) {
      setState(() {
        _selectedSpot = null;
        _carouselSpots = const [];
        _currentCardIndex = 0;
      });
    }
  }

  @override
  void dispose() {
    _searchController.removeListener(_onSearchTextChanged);
    _cardPageController.dispose();
    _searchController.dispose();
    _searchFocusNode.dispose();
    super.dispose();
  }

  List<String> get _cities => _availableCities;

  List<Spot> get _currentCitySpots => _spotsByCity[_selectedCity] ?? const [];

  List<Spot> get _filteredSpots {
    // 如果正在搜索或有搜索结果，使用 carouselSpots
    if (_searchController.text.isNotEmpty || _selectedTags.isNotEmpty) {
      return _carouselSpots;
    }
    // 否则返回当前城市的所有地点
    return _currentCitySpots;
  }

  Future<void> _animateCamera(Position newCenter, {double? zoom}) async {
    _currentMapCenter = newCenter;
    if (zoom != null) {
      _currentZoom = zoom;
    }

    _mapKey.currentState?.animateCamera(newCenter, zoom: zoom);
  }

  void _handleSpotTap(Spot spot) {
    // 如果未全屏，先切换到全屏
    if (!_isFullscreen) {
      _openFullscreen(focusSpot: spot);
      return;
    }

    // 如果已经全屏，更新选中的spot
    final newCarousel = _computeNearbySpots(spot);
    setState(() {
      _selectedSpot = spot;
      _carouselSpots = newCarousel;
      _currentCardIndex = 0;
    });
    _jumpToPage(0);

    final target = Position(spot.longitude, spot.latitude);
    final mapState = _mapKey.currentState;
    if (mapState == null) {
      _animateCamera(target, zoom: math.max(_currentZoom, 14.0));
      return;
    }

    final mq = MediaQuery.of(context);
    final double topPaddingPx =
        mq.padding.top + 160.0; // matches top gradient height
    final double bottomPaddingPx =
        _carouselSpots.isNotEmpty ? (32.0 + 240.0) : 0.0; // carousel overlay

    mapState
        .isPositionWithinVerticalSafeArea(
      target,
      topPaddingPx: topPaddingPx,
      bottomPaddingPx: bottomPaddingPx,
    )
        .then((isSafe) {
      if (!isSafe) {
        _animateCamera(target, zoom: math.max(_currentZoom, 14.0));
      }
    });

    // 共享组件会自动通过 didUpdateWidget 更新标记
  }

  void _jumpToPage(int index) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_cardPageController.hasClients) {
        _cardPageController.jumpToPage(index);
      }
    });
  }

  RectTween _mapHeroRectTween(Rect? begin, Rect? end) =>
      RectTween(begin: begin, end: end);

  Widget _mapHeroFlight(
    BuildContext flightContext,
    Animation<double> animation,
    HeroFlightDirection direction,
    BuildContext fromContext,
    BuildContext toContext,
  ) {
    final Widget target = direction == HeroFlightDirection.push
        ? toContext.widget
        : fromContext.widget;
    return Material(
      color: Colors.transparent,
      child: target,
    );
  }

  void _requestExitFullscreen() {
    if (!_isFullscreen) {
      return;
    }
    if (_isOverlayInstance) {
      if (_hasRequestedExit) {
        return;
      }
      _hasRequestedExit = true;
      final snapshot = _createSnapshot();
      widget.onExitFullscreen?.call(snapshot);
      return;
    }

    setState(() {
      _isFullscreen = false;
      _selectedSpot = null;
      _carouselSpots = const [];
      _currentCardIndex = 0;
    });
    widget.onFullscreenChanged?.call(false);
    _jumpToPage(0);
  }

  void _handleBackPressed() {
    if (widget.onBack != null) {
      widget.onBack!(_selectedCity);
      return;
    }
    Navigator.of(context).maybePop();
  }

  Future<void> _openFullscreen({Spot? focusSpot}) async {
    if (_isOverlayInstance) {
      return;
    }

    setState(() {
      _hideMapChrome = true;
      _isLaunchingOverlay = true;
    });
    await Future<void>.delayed(Duration.zero);

    final snapshotForRoute = () {
      final base = _createSnapshot();
      if (focusSpot == null) {
        return base;
      }
      final focusCenter = Position(focusSpot.longitude, focusSpot.latitude);
      return base.copyWith(
        selectedCity: focusSpot.city,
        selectedSpot: focusSpot,
        carouselSpots: _computeNearbySpots(focusSpot),
        currentCardIndex: 0,
        currentCenter: focusCenter,
        currentZoom: math.max(_currentZoom, 14.0),
      );
    }();

    widget.onFullscreenChanged?.call(true);

    final result = await Navigator.of(context).push<MapPageSnapshot>(
      PageRouteBuilder<MapPageSnapshot>(
        transitionDuration: const Duration(milliseconds: 350),
        reverseTransitionDuration: const Duration(milliseconds: 280),
        pageBuilder: (routeContext, animation, secondaryAnimation) => MapPage(
          startFullscreen: true,
          initialSnapshot: snapshotForRoute,
          initialSpotOverride: focusSpot,
          onExitFullscreen: (exitSnapshot) {
            Navigator.of(routeContext).pop(exitSnapshot);
          },
        ),
        transitionsBuilder: (context, animation, secondaryAnimation, child) =>
            child,
      ),
    );

    widget.onFullscreenChanged?.call(false);

    if (result != null) {
      await _restoreFromSnapshot(result);
    }

    if (mounted) {
      setState(() {
        _hideMapChrome = false;
        _isLaunchingOverlay = false;
      });
    }
  }

  Position _cityPosition(String city) =>
      _cityCoordinates[city] ??
      (_cities.isNotEmpty ? _cityCoordinates[_cities.first] : null) ??
      Position(139.6503, 35.6762); // Tokyo as default

  List<Spot> _computeNearbySpots(Spot anchor, {List<Spot>? baseSpots}) {
    final spots = baseSpots ?? _filteredSpots;
    if (spots.isEmpty) {
      return const [];
    }

    final sorted = List<Spot>.from(spots)
      ..sort(
        (a, b) => _distanceBetween(
          a.latitude,
          a.longitude,
          anchor.latitude,
          anchor.longitude,
        ).compareTo(
          _distanceBetween(
            b.latitude,
            b.longitude,
            anchor.latitude,
            anchor.longitude,
          ),
        ),
      );

    // Return all spots sorted by distance, not just 5
    return sorted;
  }

  double _distanceBetween(
    double lat1,
    double lng1,
    double lat2,
    double lng2,
  ) {
    const radius = 6371000.0;
    final dLat = _degToRad(lat2 - lat1);
    final dLng = _degToRad(lng2 - lng1);

    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(_degToRad(lat1)) *
            math.cos(_degToRad(lat2)) *
            math.sin(dLng / 2) *
            math.sin(dLng / 2);

    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    return radius * c;
  }

  double _degToRad(double value) => value * math.pi / 180;

  void _handleCameraMove(Position center, double zoom) {
    setState(() {
      _currentMapCenter = center;
      _currentZoom = zoom;
    });
  }

  MapPageSnapshot _createSnapshot() => MapPageSnapshot(
        selectedCity: _selectedCity,
        selectedSpot: _selectedSpot,
        selectedTags: Set<String>.from(_selectedTags),
        currentCenter: _currentMapCenter,
        currentZoom: _currentZoom,
        searchImage: _searchPickedImage,
        carouselSpots: List<Spot>.from(_carouselSpots),
        currentCardIndex: _currentCardIndex,
      );

  Future<void> _restoreFromSnapshot(MapPageSnapshot snapshot) async {
    setState(() {
      _selectedCity = snapshot.selectedCity;
      _selectedSpot = snapshot.selectedSpot;
      _selectedTags
        ..clear()
        ..addAll(snapshot.selectedTags);
      _currentMapCenter =
          snapshot.currentCenter ?? _cityPosition(snapshot.selectedCity);
      _currentZoom = snapshot.currentZoom;
      _searchPickedImage = snapshot.searchImage;
      _carouselSpots = List<Spot>.from(snapshot.carouselSpots);
      _currentCardIndex = snapshot.currentCardIndex;
    });

    final targetCenter = _currentMapCenter ?? _cityPosition(_selectedCity);
    final mapState = _mapKey.currentState;
    if (mapState != null) {
      await mapState.jumpToPosition(targetCenter, zoom: _currentZoom);
    }

    if (_carouselSpots.isNotEmpty &&
        _currentCardIndex >= 0 &&
        _currentCardIndex < _carouselSpots.length) {
      _jumpToPage(_currentCardIndex);
    } else {
      _jumpToPage(0);
    }
  }

  void _jumpToCollapsedViewport(Position center) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _mapKey.currentState?.jumpToPosition(center, zoom: _collapsedMapZoom);
    });
  }

  @override
  Widget build(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    final topPadding = mediaQuery.padding.top;
    final bool isExpanded = _isFullscreen || _isLaunchingOverlay;
    final bool showChrome = !(isExpanded || _hideMapChrome);
    final borderRadius = BorderRadius.circular(
      showChrome ? AppTheme.radiusMedium : 0,
    );

    final carouselSpots = _carouselSpots;
    final bool hasAnySpots =
        _spotsByCity.values.any((spots) => spots.isNotEmpty);
    final bool showErrorOverlay = _loadingError != null && !hasAnySpots;
    final cityFallback = _cityCoordinates[_selectedCity] ??
        (_cities.isNotEmpty ? _cityCoordinates[_cities.first] : null) ??
        Position(139.6503, 35.6762); // Tokyo as default
    const double controlsHorizontalPadding = 16.0;
    final mapSurface = _MapSurface(
      borderRadius: borderRadius,
      showChrome: showChrome,
      animateTransitions: !widget.startFullscreen,
      mapKey: _mapKey,
      spots: _filteredSpots,
      fallbackCenter: cityFallback,
      currentCenter: _currentMapCenter,
      currentZoom: _currentZoom,
      // 默认态（非全屏）不显示选中的 marker
      selectedSpot: _isFullscreen ? _selectedSpot : null,
      onSpotTap: _handleSpotTap,
      onCameraMove: _handleCameraMove,
    );

    final Widget mapContent = widget.startFullscreen
        ? mapSurface
        : Hero(
            tag: _mapHeroTag,
            createRectTween: _mapHeroRectTween,
            flightShuttleBuilder: _mapHeroFlight,
            transitionOnUserGestures: false,
            child: mapSurface,
          );

    return WillPopScope(
      onWillPop: () async {
        if (_isOverlayInstance && _isFullscreen && !_hasRequestedExit) {
          _requestExitFullscreen();
          return false;
        }
        if (!_isOverlayInstance && _isFullscreen) {
          _requestExitFullscreen();
          return false;
        }
        if (widget.onBack != null) {
          _handleBackPressed();
          return false;
        }
        return true;
      },
      child: Scaffold(
        resizeToAvoidBottomInset: false,
        backgroundColor: Colors.white,
        body: Stack(
          children: [
            AnimatedPositioned(
              duration: widget.startFullscreen
                  ? Duration.zero
                  : const Duration(milliseconds: 350),
              curve: Curves.easeInOut,
              top: isExpanded ? 0 : _nonFullscreenTopInset,
              left: isExpanded ? 0 : 16,
              right: isExpanded ? 0 : 16,
              bottom: isExpanded ? 0 : 16,
              child: mapContent,
            ),
            if (_isFullscreen)
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: IgnorePointer(
                  ignoring: true,
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
            Positioned(
              top: _isFullscreen ? topPadding + 12 : 12,
              left: _isFullscreen ? 0 : 16,
              right: _isFullscreen ? 0 : 16,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: controlsHorizontalPadding,
                    ),
                    child: Row(
                      children: [
                        if (widget.onBack != null) ...[
                          IconButtonCustom(
                            icon: Icons.arrow_back,
                            size: 44,
                            onPressed: _handleBackPressed,
                            backgroundColor: Colors.white,
                          ),
                          const SizedBox(width: 8),
                        ],
                        _CitySelector(
                          selectedCity: _selectedCity,
                          cities: _cities,
                          onCityChanged: (city, country) async {
                            print('🔄 [MapPage] 城市切换: $city (国家: $country)');
                            // 保存用户选择的城市
                            ref
                                .read(placesCacheProvider.notifier)
                                .saveSelectedCity(city);

                            // 使用缓存的按需加载
                            final places = await ref
                                .read(placesCacheProvider.notifier)
                                .loadCityOnDemand(city, country: country);
                            print('🔄 [MapPage] 加载完成: ${places.length} 个地点');

                            // 转换为 Spot
                            List<Spot> spots = [];
                            if (places.isNotEmpty) {
                              spots = _selectTopSpotsForCity(city, places);
                              if (spots.isNotEmpty) {
                                final updatedSpotsByCity =
                                    Map<String, List<Spot>>.from(_spotsByCity);
                                updatedSpotsByCity[city] = spots;
                                _spotsByCity = updatedSpotsByCity;
                                _cityCoordinates[city] =
                                    _calculateCenterOfSpots(spots);
                              }
                            }

                            final finalSpots =
                                _spotsByCity[city] ?? const <Spot>[];
                            print(
                              '🔄 [MapPage] 最终 carouselSpots: ${finalSpots.length} 个',
                            );

                            // 计算合适的缩放级别，确保至少 5 个 marker 可见
                            final (:center, :zoom) =
                                _calculateCenterAndZoomForSpots(
                              finalSpots,
                              minSpots: 5,
                            );

                            setState(() {
                              _selectedCity = city;
                              _selectedCountry = country; // 保存国家信息
                              _selectedSpot = null;
                              _selectedTags.clear(); // 切换城市时清除已选标签
                              _carouselSpots = finalSpots;
                              _currentCardIndex = 0;
                              _currentMapCenter = center;
                              _currentZoom = zoom;
                            });
                            _jumpToPage(0);
                            _animateCamera(center, zoom: zoom);
                          },
                        ),
                        if (_isFullscreen) ...[
                          const SizedBox(width: 8),
                          Expanded(child: _buildFullscreenSearchBar(context)),
                        ],
                        if (!_isFullscreen) const Spacer(),
                        if (_isFullscreen) const SizedBox(width: 8),
                        // 只在非 MyLand 入口时显示全屏切换按钮
                        if (widget.onBack == null)
                          IconButtonCustom(
                            icon: _isFullscreen
                                ? Icons.fullscreen_exit
                                : Icons.fullscreen,
                            size: 44,
                            onPressed: () {
                              if (_isFullscreen) {
                                _requestExitFullscreen();
                              } else {
                                _openFullscreen();
                              }
                            },
                            backgroundColor: Colors.white,
                          ),
                      ],
                    ),
                  ),
                  if (_isFullscreen) ...[
                    const SizedBox(height: 10),
                    _buildTagBar(),
                  ],
                ],
              ),
            ),
            if (_isFullscreen && carouselSpots.isNotEmpty)
              Positioned(
                bottom: 32,
                left: 0,
                right: 0,
                height: 280, // 固定高度
                child: PageView.builder(
                  controller: _cardPageController,
                  clipBehavior: Clip.none,
                  onPageChanged: (index) {
                    if (index >= carouselSpots.length) {
                      return;
                    }
                    final spot = carouselSpots[index];
                    setState(() {
                      _currentCardIndex = index;
                      _selectedSpot = spot;
                    });
                    _animateCamera(
                      Position(spot.longitude, spot.latitude),
                    );
                  },
                  itemCount: carouselSpots.length,
                  itemBuilder: (context, index) {
                    final spot = carouselSpots[index];
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
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            if (_isLoadingSpots && !hasAnySpots)
              Positioned.fill(
                child: Container(
                  color: Colors.white.withOpacity(0.92),
                  alignment: Alignment.center,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const SizedBox(
                        width: 48,
                        height: 48,
                        child: CircularProgressIndicator(
                          strokeWidth: 3,
                          valueColor:
                              AlwaysStoppedAnimation<Color>(AppTheme.black),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Fetching curated spots…',
                        style: AppTheme.bodyLarge(context),
                      ),
                    ],
                  ),
                ),
              ),
            if (showErrorOverlay)
              Positioned.fill(
                child: Container(
                  color: Colors.white.withOpacity(0.95),
                  alignment: Alignment.center,
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Unable to load places',
                        style: AppTheme.headlineMedium(context),
                      ),
                      if (_loadingError != null) ...[
                        const SizedBox(height: 8),
                        Text(
                          _loadingError!,
                          style: AppTheme.bodyMedium(context).copyWith(
                            color: AppTheme.mediumGray,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ],
                      const SizedBox(height: 20),
                      PrimaryButton(
                        text: 'Retry',
                        onPressed: _loadPublicPlaces,
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

  Widget _buildFullscreenSearchBar(BuildContext context) => Container(
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
                  hintText: 'Find your interest',
                  hintStyle: AppTheme.bodySmall(context).copyWith(
                    color: AppTheme.mediumGray,
                  ),
                  border: InputBorder.none,
                  isDense: true,
                  contentPadding: EdgeInsets.zero,
                ),
              ),
            ),
            // Clear button - before ask AI
            if (_searchController.text.isNotEmpty)
              GestureDetector(
                onTap: _clearSearch,
                child: const Padding(
                  padding: EdgeInsets.only(left: 4, right: 4),
                  child:
                      Icon(Icons.close, size: 18, color: AppTheme.mediumGray),
                ),
              ),
            // Ask AI entry
            GestureDetector(
              onTap: () {
                Navigator.of(context).push<void>(
                  MaterialPageRoute<void>(
                    builder: (context) => const AIAssistantPage(),
                  ),
                );
              },
              child: Padding(
                padding: const EdgeInsets.only(left: 4, right: 10),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.auto_awesome,
                      size: 16,
                      color: AppTheme.primaryYellow,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      'ask AI',
                      style: AppTheme.bodyMedium(context).copyWith(
                        color: AppTheme.black,
                        fontSize: 14,
                        decoration: TextDecoration.underline,
                        decorationColor: AppTheme.primaryYellow,
                        decorationThickness: 2,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      );

  /// 执行搜索
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
      print('🔍 [MapPage] 搜索: "$query" in $_selectedCity');

      final repository = ref.read(publicPlaceRepositoryProvider);
      final places = await repository.searchPlacesByCity(
        query: query,
        city: _selectedCity,
        country: _selectedCountry,
      );

      print('🔍 [MapPage] 搜索结果: ${places.length} 个地点');

      if (places.isEmpty) {
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

      // 转换为 Spot
      final spots = places
          .map((place) => _mapPublicPlaceToSpot(_selectedCity, place))
          .whereType<Spot>()
          .toList();

      if (spots.isEmpty) {
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
      final (:center, :zoom) =
          _calculateCenterAndZoomForSpots(spots, minSpots: 5);

      setState(() {
        _carouselSpots = spots;
        _isSearching = false;
        _selectedSpot = spots.first;
        _currentCardIndex = 0;
        _currentMapCenter = center;
        _currentZoom = zoom;
      });

      _jumpToPage(0);
      _animateCamera(center, zoom: zoom);
    } catch (e) {
      print('❌ [MapPage] 搜索失败: $e');
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
    // 恢复显示默认的城市地点
    final defaultSpots = _spotsByCity[_selectedCity] ?? const <Spot>[];
    final (:center, :zoom) =
        _calculateCenterAndZoomForSpots(defaultSpots, minSpots: 5);

    setState(() {
      _carouselSpots = defaultSpots;
      _selectedSpot = defaultSpots.isNotEmpty ? defaultSpots.first : null;
      _currentCardIndex = 0;
      _currentMapCenter = center;
      _currentZoom = zoom;
    });

    _jumpToPage(0);
    _animateCamera(center, zoom: zoom);
  }

  Widget _buildTagBar() {
    final tags = _dynamicTagOptions;
    if (tags.isEmpty) return const SizedBox.shrink();
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

  void _toggleTag(String tag) async {
    final wasSelected = _selectedTags.contains(tag);

    setState(() {
      if (wasSelected) {
        _selectedTags.remove(tag);
      } else {
        // 单选模式：清除其他标签，只选中当前标签
        _selectedTags.clear();
        _selectedTags.add(tag);
      }
      _selectedSpot = null;
      _currentCardIndex = 0;
    });

    // 如果取消选择，恢复显示默认的城市地点
    if (wasSelected) {
      final defaultSpots = _spotsByCity[_selectedCity] ?? const <Spot>[];
      setState(() {
        _carouselSpots = defaultSpots;
        // 设置第一个 spot 为选中状态
        _selectedSpot = defaultSpots.isNotEmpty ? defaultSpots.first : null;
        _currentCardIndex = 0;
      });
      _jumpToPage(0);
      return;
    }

    // 选中标签时，优先使用缓存的标签地点
    final cacheNotifier = ref.read(placesCacheProvider.notifier);

    // 尝试获取国家信息
    if (_selectedCountry == null) {
      final statsState = ref.read(countriesCitiesStatsProvider);
      if (statsState.hasData) {
        for (final countryStats in statsState.countries) {
          if (countryStats.cities.any((c) => c.name == _selectedCity)) {
            _selectedCountry = countryStats.name;
            break;
          }
        }
      }
    }

    setState(() {
      _isLoadingTaggedSpots = true;
    });

    try {
      print('🏷️ [MapPage] 获取标签 "$tag" 的地点...');

      // 使用缓存的标签地点（如果没有会自动从后端加载）
      final places = await cacheNotifier.getPlacesByTag(
        _selectedCity,
        tag,
        country: _selectedCountry,
      );

      print('🏷️ [MapPage] 获取到 ${places.length} 个地点');

      List<Spot> spots;
      if (places.isNotEmpty) {
        // 转换为 Spot
        spots = places
            .map((place) => _mapPublicPlaceToSpot(_selectedCity, place))
            .whereType<Spot>()
            .toList();
      } else {
        // 后端没有数据，回退到本地筛选
        print('🏷️ [MapPage] 后端无数据，回退到本地筛选...');
        final allSpots = _spotsByCity[_selectedCity] ?? const <Spot>[];
        final tagLower = tag.toLowerCase();
        spots = allSpots.where((spot) {
          // 检查 displayTagsEn
          if (spot.displayTagsEn.any((t) => t.toLowerCase() == tagLower)) {
            return true;
          }
          // 检查 tags
          if (spot.tags.any((t) => t.toLowerCase() == tagLower)) {
            return true;
          }
          // 检查 category
          if (spot.category.toLowerCase() == tagLower) {
            return true;
          }
          return false;
        }).toList();
        print('🏷️ [MapPage] 本地筛选到 ${spots.length} 个地点');
      }

      // 计算中心点和缩放
      final (:center, :zoom) =
          _calculateCenterAndZoomForSpots(spots, minSpots: 5);

      setState(() {
        _carouselSpots = spots;
        _isLoadingTaggedSpots = false;
        // 设置第一个 spot 为选中状态
        _selectedSpot = spots.isNotEmpty ? spots.first : null;
        _currentCardIndex = 0;
        if (spots.isNotEmpty) {
          _currentMapCenter = center;
          _currentZoom = zoom;
        }
      });

      _jumpToPage(0);
      if (spots.isNotEmpty) {
        _animateCamera(center, zoom: zoom);
      }
    } catch (e) {
      print('❌ [MapPage] 获取标签地点失败: $e');
      setState(() {
        _isLoadingTaggedSpots = false;
      });
      _jumpToPage(0);
    }
  }

  /// 将搜索结果转换为 Spot
  Spot _convertSearchResultToSpot(SearchPlaceResult place) {
    // 优先使用 displayTagsEn（包含 category + aiTags + tags 的合并结果）
    final displayTags = place.displayTagsEn.isNotEmpty
        ? place.displayTagsEn
        : (place.tags.isNotEmpty
            ? place.tags
            : [place.categoryEn ?? place.category ?? 'Hidden Gem']);

    return Spot(
      id: place.id,
      name: place.name,
      city: place.city ?? _selectedCity,
      category: place.categoryEn ?? place.category ?? 'Point of Interest',
      latitude: place.latitude,
      longitude: place.longitude,
      rating: place.rating ?? 0.0,
      ratingCount: place.ratingCount ?? 0,
      coverImage: place.coverImage ?? _fallbackCoverImage,
      images: place.images,
      tags: place.tags,
      displayTagsEn: displayTags,
      aiSummary: place.aiSummary,
      address: place.address,
    );
  }

  String _tagEmoji(String tag) => getCategoryEmoji(tag);

  void _showSpotDetail(Spot spot) async {
    final now = DateTime.now();

    // 防抖：如果是同一个地点且点击间隔小于1秒，则忽略
    if (_lastClickedSpotId == spot.id &&
        _lastClickTime != null &&
        now.difference(_lastClickTime!).inMilliseconds < 1000) {
      print('🔧 [map_page_new.dart] Debouncing rapid clicks for ${spot.name}');
      return;
    }

    _lastClickedSpotId = spot.id;
    _lastClickTime = now;

    print('🗺️ [MapPageNew] _showSpotDetail called for spot: ${spot.name}');

    if (!mounted) return;

    // 检查用户是否登录，预加载状态
    final authState = ref.read(authProvider);
    bool? initialIsSaved;
    bool? initialIsMustGo;
    bool? initialIsTodaysPlan;
    bool? initialIsVisited;
    String? initialDestinationId;

    // 预加载 check-in 详细数据
    DateTime? initialVisitDate;
    int? initialUserRating;
    String? initialUserNotes;
    List<String>? initialUserPhotos;

    // 预加载关联合集
    Map<String, dynamic>? linkedCollection;

    if (authState.isAuthenticated) {
      print(
        '🗺️ [MapPageNew] User authenticated, loading full status from server...',
      );

      try {
        // 先显示一个简单的loading indicator
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

        // 从服务器获取最新的完整状态 - 2秒超时
        final tripRepo = ref.read(tripRepositoryProvider);
        final trips = await tripRepo.getMyTrips().timeout(
              const Duration(seconds: 2),
              onTimeout: () => <Trip>[],
            );

        print('�🚨🚨 [SPOT_DETAIL_DEBUG] Loading status for spot:');
        print('🚨 spot.id: ${spot.id}');
        print('🚨 spot.name: ${spot.name}');
        print('🚨 trips count: ${trips.length}');

        // 查找包含这个 spot 的 trip
        for (final trip in trips) {
          try {
            // 优先使用 getMyTrips 已包含的 tripSpots，避免额外请求
            List<TripSpot> tripSpots = trip.tripSpots ?? [];
            if (tripSpots.isEmpty) {
              final tripDetail = await tripRepo.getTripById(trip.id);
              tripSpots = tripDetail.tripSpots ?? [];
            }

            print(
              '� [SPOT_DETAIL_DEBUG] Checking trip: ${trip.name} (${tripSpots.length} spots)',
            );

            for (final ts in tripSpots) {
              // 尝试匹配 spot（通过 id、name 或 googlePlaceId）
              bool isMatch = false;
              String matchType = '';

              if (ts.spot?.id == spot.id) {
                isMatch = true;
                matchType = 'by id';
              } else if (ts.spot?.name == spot.name && spot.name.isNotEmpty) {
                isMatch = true;
                matchType = 'by name';
              } else if (ts.spot?.googlePlaceId != null &&
                  ts.spot?.googlePlaceId == spot.id) {
                isMatch = true;
                matchType = 'by googlePlaceId';
              }

              if (isMatch) {
                print(
                  '🚨✅ [SPOT_DETAIL_DEBUG] MATCH FOUND in trip ${trip.name} ($matchType)',
                );
                print('🚨   ts.spot.id: ${ts.spot?.id}');
                print('🚨   ts.spot.googlePlaceId: ${ts.spot?.googlePlaceId}');
                print('🚨   ts.isSaved: ${ts.isSaved}');
                print('🚨   ts.isMustGo: ${ts.isMustGo}');
                print('🚨   ts.isVisited: ${ts.isVisited}');

                initialIsSaved = ts.isSaved == true;
                initialIsMustGo = ts.isMustGo == true;
                initialIsTodaysPlan = ts.isTodaysPlan == true;
                initialIsVisited = ts.isVisited == true;
                initialDestinationId = trip.id;
                initialVisitDate = ts.visitDate;
                initialUserRating = ts.userRating;
                initialUserNotes = ts.userNotes;
                initialUserPhotos = ts.userPhotos?.cast<String>();
                break;
              }
            }
            if (initialDestinationId != null) break;
          } catch (e) {
            print('⚠️ [MapPageNew] Error loading trip ${trip.name}: $e');
          }
        }

        if (initialDestinationId == null) {
          print('ℹ️ [MapPageNew] Spot not found in any trip (not saved)');
          initialIsSaved = false;
        }

        // 💾 保存到缓存供后续使用
        WishlistStatusCache.updateFullStatus(
          spot.id,
          destinationId: initialDestinationId,
          isSaved: initialIsSaved ?? false,
          isMustGo: initialIsMustGo,
          isTodaysPlan: initialIsTodaysPlan,
          isVisited: initialIsVisited,
          visitDate: initialVisitDate,
          userRating: initialUserRating,
          userNotes: initialUserNotes,
          userPhotos: initialUserPhotos,
        );

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
          print('⚠️ [MapPageNew] Error loading linked collection: $e');
        }

        // 关闭loading dialog
        if (mounted && Navigator.canPop(context)) {
          Navigator.pop(context);
        }

        print(
          '🗺️ [MapPageNew] Server data loaded: isSaved=$initialIsSaved, isVisited=$initialIsVisited',
        );
      } catch (e) {
        print('❌ [MapPageNew] Failed to load status from server: $e');
        // 关闭loading dialog
        if (mounted && Navigator.canPop(context)) {
          Navigator.pop(context);
        }
        // 失败时回退到缓存
        print('🗺️ [MapPageNew] Falling back to cache...');
        SpotStatusData? fullStatus = WishlistStatusCache.getFullStatus(spot.id);
        if (fullStatus == null && spot.name.isNotEmpty) {
          fullStatus = WishlistStatusCache.getFullStatus(spot.name);
        }
        initialIsSaved =
            fullStatus?.isSaved ?? fullStatus?.destinationId != null;
        initialIsMustGo = fullStatus?.isMustGo;
        initialIsTodaysPlan = fullStatus?.isTodaysPlan;
        initialIsVisited = fullStatus?.isVisited;
        initialVisitDate = fullStatus?.visitDate;
        initialUserRating = fullStatus?.userRating;
        initialUserNotes = fullStatus?.userNotes;
        initialUserPhotos = fullStatus?.userPhotos;
        initialDestinationId = fullStatus?.destinationId;
        if (fullStatus == null && spot.name.isNotEmpty) {
          fullStatus = WishlistStatusCache.getFullStatus(spot.name);
        }

        if (fullStatus != null) {
          initialIsSaved = fullStatus.isSaved;
          initialIsMustGo = fullStatus.isMustGo;
          initialIsTodaysPlan = fullStatus.isTodaysPlan;
          initialIsVisited = fullStatus.isVisited;
          initialDestinationId = fullStatus.destinationId;
          initialVisitDate = fullStatus.visitDate;
          initialUserRating = fullStatus.userRating;
          initialUserNotes = fullStatus.userNotes;
          initialUserPhotos = fullStatus.userPhotos;
        } else {
          initialIsSaved = false;
        }
      }
    } else {
      // 未登录用户显示默认状态
      initialIsSaved = false;

      // 未登录用户也预加载合集数据（避免详情页闪现）
      try {
        final uuidRegex = RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
          caseSensitive: false,
        );
        if (uuidRegex.hasMatch(spot.id)) {
          final collectionRepo = ref.read(collectionRepositoryProvider);
          final collections = await collectionRepo
              .getCollectionsForPlace(spot.id)
              .timeout(const Duration(milliseconds: 1200), onTimeout: () => []);
          if (collections.isNotEmpty) {
            // 随机选择一个合集展示
            final random = math.Random();
            linkedCollection = collections[random.nextInt(collections.length)];
          }
        }
      } catch (e) {
        print(
          '⚠️ [MapPageNew] Error loading linked collection (unauthenticated): $e',
        );
      }
    }

    if (!mounted) return;

    print(
      '🗺️ [MapPageNew] Showing detail modal with accurate status: isSaved=$initialIsSaved, isVisited=$initialIsVisited',
    );

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => UnifiedSpotDetailModal(
        spot: spot,
        linkedCollection: linkedCollection,
        initialIsSaved: initialIsSaved,
        initialIsMustGo: initialIsMustGo,
        initialIsTodaysPlan: initialIsTodaysPlan,
        initialIsVisited: initialIsVisited,
        initialDestinationId: initialDestinationId,
        initialVisitDate: initialVisitDate,
        initialUserRating: initialUserRating,
        initialUserNotes: initialUserNotes,
        initialUserPhotos: initialUserPhotos,
        onStatusChanged: (
          spotId, {
          isMustGo,
          isTodaysPlan,
          isVisited,
          isRemoved,
          needsReload,
          visitDate,
          userRating,
          userNotes,
          userPhotos,
          destinationId,
        }) {
          // 状态变更后，invalidate provider 触发卡片刷新
          ref.invalidate(wishlistStatusProvider);
        },
      ),
    );
  }

  // 以下是被移除的旧代码的占位注释
  // 状态加载已移至 UnifiedSpotDetailModal 内部

  Future<void> _loadPublicPlaces() async {
    print('📍 [MapPage] _loadPublicPlaces 开始');

    // 每次进入页面都强制刷新数据
    final cacheNotifier = ref.read(placesCacheProvider.notifier);
    final cacheState = ref.read(placesCacheProvider);

    // 如果缓存过期或没有数据，强制刷新
    if (cacheState.isStale || !cacheState.hasData) {
      print('📍 [MapPage] 缓存过期或无数据，强制刷新');
      setState(() {
        _isLoadingSpots = true;
        _loadingError = null;
      });
      await cacheNotifier.refresh();
    }

    // 重新读取缓存状态
    final updatedCacheState = ref.read(placesCacheProvider);
    print(
      '📍 [MapPage] 缓存状态: hasData=${updatedCacheState.hasData}, isLoading=${updatedCacheState.isLoading}, isInitialLoading=${updatedCacheState.isInitialLoading}',
    );

    if (updatedCacheState.hasData) {
      // 使用缓存数据
      print('📍 [MapPage] 使用缓存数据');
      await _loadFromCache(updatedCacheState);
      return;
    }

    // 没有数据，显示加载状态
    setState(() {
      _isLoadingSpots = true;
      _loadingError = null;
    });

    // 如果缓存正在加载，等待它完成
    if (cacheState.isLoading || cacheState.isInitialLoading) {
      print('📍 [MapPage] 缓存正在加载，等待完成...');
      final completer = Completer<void>();
      late final ProviderSubscription<PlacesCacheState> subscription;

      Timer? timeoutTimer;
      timeoutTimer = Timer(const Duration(seconds: 10), () {
        if (!completer.isCompleted) {
          print('📍 [MapPage] 等待缓存超时');
          subscription.close();
          setState(() {
            _isLoadingSpots = false;
            _loadingError = 'Loading timeout';
          });
          completer.complete();
        }
      });

      subscription =
          ref.listenManual(placesCacheProvider, (previous, next) async {
        print(
          '📍 [MapPage] 缓存状态变化: hasData=${next.hasData}, isLoading=${next.isLoading}, error=${next.error}',
        );
        if (next.hasData) {
          timeoutTimer?.cancel();
          subscription.close();
          await _loadFromCache(next);
          if (!completer.isCompleted) completer.complete();
        } else if (!next.isLoading &&
            !next.isInitialLoading &&
            next.error != null) {
          timeoutTimer?.cancel();
          subscription.close();
          print('📍 [MapPage] 缓存加载失败: ${next.error}');
          setState(() {
            _isLoadingSpots = false;
            _loadingError = next.error;
          });
          if (!completer.isCompleted) completer.complete();
        }
      });
      await completer.future;
      return;
    }

    // 缓存为空且未在加载，触发预加载
    print('📍 [MapPage] 触发预加载');
    ref.read(placesCacheProvider.notifier).preloadPlaces();

    // 等待预加载完成
    final completer = Completer<void>();
    late final ProviderSubscription<PlacesCacheState> subscription;

    Timer? timeoutTimer;
    timeoutTimer = Timer(const Duration(seconds: 10), () {
      if (!completer.isCompleted) {
        print('📍 [MapPage] 预加载超时');
        subscription.close();
        setState(() {
          _isLoadingSpots = false;
          _loadingError = 'Loading timeout';
        });
        completer.complete();
      }
    });

    subscription =
        ref.listenManual(placesCacheProvider, (previous, next) async {
      print(
        '📍 [MapPage] 预加载状态变化: hasData=${next.hasData}, isLoading=${next.isLoading}, error=${next.error}',
      );
      if (next.hasData) {
        timeoutTimer?.cancel();
        subscription.close();
        await _loadFromCache(next);
        if (!completer.isCompleted) completer.complete();
      } else if (!next.isLoading &&
          !next.isInitialLoading &&
          next.error != null) {
        timeoutTimer?.cancel();
        subscription.close();
        setState(() {
          _isLoadingSpots = false;
          _loadingError = next.error;
        });
        if (!completer.isCompleted) completer.complete();
      }
    });
    await completer.future;
  }

  /// 计算一组地点的中心坐标（使用 bounding box 中心，确保 markers 居中显示）
  Position _calculateCenterOfSpots(List<Spot> spots) {
    if (spots.isEmpty) {
      return Position(2.3522, 48.8566); // Paris 作为默认
    }
    if (spots.length == 1) {
      return Position(spots.first.longitude, spots.first.latitude);
    }

    // 使用 bounding box 的中心点，而不是简单平均值
    // 这样可以确保所有 markers 都在视野范围内且相对居中
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

    // 返回 bounding box 的中心点
    final centerLat = (minLat + maxLat) / 2;
    final centerLng = (minLng + maxLng) / 2;

    return Position(centerLng, centerLat);
  }

  /// 计算合适的缩放级别，确保至少 minSpots 个地点在视野中
  /// 返回 (center, zoom) 元组
  ({Position center, double zoom}) _calculateCenterAndZoomForSpots(
    List<Spot> spots, {
    int minSpots = 5,
  }) {
    if (spots.isEmpty) {
      return (center: Position(2.3522, 48.8566), zoom: _collapsedMapZoom);
    }
    if (spots.length == 1) {
      return (
        center: Position(spots.first.longitude, spots.first.latitude),
        zoom: 14.0
      );
    }

    // 取前 minSpots 个地点（按评分人数排序后的）来计算 bounding box
    final spotsToFit = spots.take(math.min(minSpots, spots.length)).toList();

    double minLat = spotsToFit.first.latitude;
    double maxLat = spotsToFit.first.latitude;
    double minLng = spotsToFit.first.longitude;
    double maxLng = spotsToFit.first.longitude;

    for (final spot in spotsToFit) {
      if (spot.latitude < minLat) minLat = spot.latitude;
      if (spot.latitude > maxLat) maxLat = spot.latitude;
      if (spot.longitude < minLng) minLng = spot.longitude;
      if (spot.longitude > maxLng) maxLng = spot.longitude;
    }

    // 计算中心点
    final centerLat = (minLat + maxLat) / 2;
    final centerLng = (minLng + maxLng) / 2;
    final center = Position(centerLng, centerLat);

    // 计算 bounding box 的跨度
    final latSpan = maxLat - minLat;
    final lngSpan = maxLng - minLng;

    // 添加一些边距（20%）
    final paddedLatSpan = latSpan * 1.2;
    final paddedLngSpan = lngSpan * 1.2;

    // 根据跨度计算合适的缩放级别
    // Mapbox 缩放级别公式：zoom = log2(360 / span)
    // 我们取纬度和经度中较大的跨度来确定缩放级别
    final maxSpan = math.max(paddedLatSpan, paddedLngSpan);

    double zoom;
    if (maxSpan <= 0.001) {
      zoom = 16.0; // 非常近
    } else if (maxSpan <= 0.01) {
      zoom = 14.0;
    } else if (maxSpan <= 0.05) {
      zoom = 13.0;
    } else if (maxSpan <= 0.1) {
      zoom = 12.0;
    } else if (maxSpan <= 0.5) {
      zoom = 11.0;
    } else if (maxSpan <= 1.0) {
      zoom = 10.0;
    } else if (maxSpan <= 2.0) {
      zoom = 9.0;
    } else {
      zoom = 8.0;
    }

    // 确保缩放级别在合理范围内
    zoom = zoom.clamp(8.0, 16.0);

    print(
      '📍 [MapPage] 计算缩放级别: ${spotsToFit.length} 个地点, latSpan=$latSpan, lngSpan=$lngSpan, zoom=$zoom',
    );

    return (center: center, zoom: zoom);
  }

  /// 从缓存加载数据
  Future<void> _loadFromCache(PlacesCacheState cacheState) async {
    final Map<String, List<Spot>> nextSpotsByCity = <String, List<Spot>>{};

    for (final entry in cacheState.placesByCity.entries) {
      final spots = _selectTopSpotsForCity(entry.key, entry.value);
      if (spots.isNotEmpty) {
        nextSpotsByCity[entry.key] = spots;
        if (!_cityCoordinates.containsKey(entry.key)) {
          // 使用所有地点的中心点作为城市坐标
          _cityCoordinates[entry.key] = _calculateCenterOfSpots(spots);
        }
      }
    }

    if (!mounted) return;

    // 只显示地点数量 >= 5 的城市
    final citiesWithSpots = nextSpotsByCity.entries
        .where((entry) => entry.value.length >= 5)
        .map((entry) => entry.key)
        .toList()
      ..sort();
    final resolvedCity =
        _resolveCitySelection(nextSpotsByCity, citiesWithSpots);

    // 如果选中的城市没有数据，尝试加载
    if ((nextSpotsByCity[resolvedCity] ?? const <Spot>[]).isEmpty &&
        resolvedCity.isNotEmpty) {
      print('📍 [MapPage] 城市 $resolvedCity 没有数据，开始加载...');
      final repository = ref.read(publicPlaceRepositoryProvider);
      try {
        // 尝试从 countriesCitiesStats 获取国家信息
        String? country;
        final statsState = ref.read(countriesCitiesStatsProvider);
        if (statsState.hasData) {
          for (final countryStats in statsState.countries) {
            if (countryStats.cities.any((c) => c.name == resolvedCity)) {
              country = countryStats.name;
              break;
            }
          }
        }

        final places = await repository.fetchTopPlacesByCity(
          city: resolvedCity,
          country: country, // 传递国家参数
          limit: 20,
        );
        if (places.isNotEmpty) {
          final spots = _selectTopSpotsForCity(resolvedCity, places);
          if (spots.isNotEmpty) {
            nextSpotsByCity[resolvedCity] = spots;
            // 使用所有地点的中心点作为城市坐标
            _cityCoordinates[resolvedCity] = _calculateCenterOfSpots(spots);
          }
          print('✅ [MapPage] 加载 $resolvedCity 完成: ${places.length} 个地点');
        }
      } catch (e) {
        print('❌ [MapPage] 加载 $resolvedCity 失败: $e');
      }
    }

    if (!mounted) return;

    // 默认态不选中任何地点
    final Spot? resolvedSpot;
    final List<Spot> nearby;
    if (_isFullscreen) {
      resolvedSpot =
          _resolveSelectedSpot(resolvedCity, nextSpotsByCity, _selectedSpot);
      // 如果有选中的地点，显示附近地点；否则显示该城市的所有地点
      if (resolvedSpot != null) {
        nearby = _computeNearbySpots(
          resolvedSpot,
          baseSpots: nextSpotsByCity[resolvedCity],
        );
      } else {
        nearby = nextSpotsByCity[resolvedCity] ?? const <Spot>[];
      }
    } else {
      resolvedSpot = null;
      nearby = const <Spot>[];
    }

    // 计算初始视图：确保至少 5 个 marker 在屏幕中央
    final citySpots = nextSpotsByCity[resolvedCity] ?? const <Spot>[];
    final (:center, :zoom) =
        _calculateCenterAndZoomForSpots(citySpots, minSpots: 5);
    final targetCenter = center;
    final targetZoom = zoom;

    setState(() {
      _availableCities = citiesWithSpots;
      _spotsByCity = nextSpotsByCity;
      _selectedCity = resolvedCity;
      _selectedSpot = resolvedSpot;
      _carouselSpots = nearby;
      _currentCardIndex = 0;
      _currentMapCenter = targetCenter;
      _currentZoom = targetZoom;
      _isLoadingSpots = false;
      _loadingError = null;
    });

    _updateMapPosition(targetCenter, resolvedSpot, targetZoom);
  }

  /// 直接从 API 加载数据
  Future<void> _loadDirectly() async {
    print('📍 [MapPage] _loadDirectly 开始');
    setState(() {
      _isLoadingSpots = true;
      _loadingError = null;
    });

    final repository = ref.read(publicPlaceRepositoryProvider);
    final Map<String, List<Spot>> nextSpotsByCity = <String, List<Spot>>{};
    String? firstError;

    // First, fetch available cities from the database
    List<String> cities = <String>[];
    try {
      cities = await repository.fetchCities();
      print('📍 [MapPage] 获取到 ${cities.length} 个城市: $cities');
    } on SupabasePlaceRepositoryException catch (error) {
      print('❌ [MapPage] 获取城市失败: ${error.message}');
      firstError ??= error.message;
    } catch (error) {
      print('❌ [MapPage] 获取城市失败: $error');
      firstError ??= error.toString();
    }

    // Load places for each city
    for (final city in cities) {
      try {
        final places = await repository.fetchPlacesByCity(
          city: city,
          limit: 200,
          minRating: 0.0, // Include all places
        );
        final spots = _selectTopSpotsForCity(city, places);
        if (spots.isNotEmpty) {
          nextSpotsByCity[city] = spots;
          // 使用所有地点的中心点作为城市坐标
          if (!_cityCoordinates.containsKey(city)) {
            _cityCoordinates[city] = _calculateCenterOfSpots(spots);
          }
        }
      } on SupabasePlaceRepositoryException catch (error) {
        firstError ??= error.message;
      } catch (error) {
        firstError ??= error.toString();
      }
    }

    if (!mounted) {
      return;
    }

    // Only include cities that have at least 5 spots
    final citiesWithSpots = cities
        .where((city) => (nextSpotsByCity[city] ?? const <Spot>[]).length >= 5)
        .toList()
      ..sort();

    final resolvedCity =
        _resolveCitySelection(nextSpotsByCity, citiesWithSpots);

    // 默认态不选中任何地点
    final Spot? resolvedSpot;
    final List<Spot> nearby;
    if (_isFullscreen) {
      resolvedSpot = _resolveSelectedSpot(
        resolvedCity,
        nextSpotsByCity,
        _selectedSpot,
      );
      nearby = resolvedSpot != null
          ? _computeNearbySpots(
              resolvedSpot,
              baseSpots: nextSpotsByCity[resolvedCity],
            )
          : const <Spot>[];
    } else {
      resolvedSpot = null;
      nearby = const <Spot>[];
    }

    // 计算初始视图：确保至少 5 个 marker 在屏幕中央
    final citySpots = nextSpotsByCity[resolvedCity] ?? const <Spot>[];
    final (:center, :zoom) =
        _calculateCenterAndZoomForSpots(citySpots, minSpots: 5);
    final targetCenter = center;
    final targetZoom = zoom;

    setState(() {
      _availableCities = citiesWithSpots;
      _spotsByCity = nextSpotsByCity;
      _selectedCity = resolvedCity;
      _selectedSpot = resolvedSpot;
      _carouselSpots = nearby;
      _currentCardIndex = 0;
      _currentMapCenter = targetCenter;
      _currentZoom = targetZoom;
      _isLoadingSpots = false;
      _loadingError = firstError;
    });

    _updateMapPosition(targetCenter, _selectedSpot, targetZoom);
  }

  void _updateMapPosition(
    Position targetCenter, [
    Spot? spot,
    double? zoom,
  ]) async {
    final mapState = _mapKey.currentState;
    if (mapState != null) {
      final targetZoom =
          zoom ?? (spot != null ? math.max(_currentZoom, 14.0) : _currentZoom);
      await mapState.jumpToPosition(
        targetCenter,
        zoom: targetZoom,
      );
    } else {
      _jumpToCollapsedViewport(targetCenter);
    }
  }

  static const String _defaultCity = 'Paris'; // 默认城市

  String _resolveCitySelection(
    Map<String, List<Spot>> nextSpotsByCity,
    List<String> citiesWithSpots,
  ) {
    // 1. 如果已经有选中的城市（来自 snapshot 或用户选择），优先保持
    //    即使该城市暂时没有数据，也保持选择（数据会后续加载）
    //    但要排除空字符串
    if (_selectedCity.isNotEmpty && _selectedCity != '') {
      return _selectedCity;
    }

    // 2. 尝试使用缓存中保存的上次选择的城市
    final cacheState = ref.read(placesCacheProvider);
    final lastSelectedCity = cacheState.lastSelectedCity;
    if (lastSelectedCity != null && lastSelectedCity.isNotEmpty) {
      return lastSelectedCity;
    }

    // 3. 尝试使用默认城市 Paris
    if ((nextSpotsByCity[_defaultCity] ?? const <Spot>[]).isNotEmpty) {
      return _defaultCity;
    }
    if (citiesWithSpots.contains(_defaultCity)) {
      return _defaultCity;
    }

    // 4. 使用第一个有数据的城市
    for (final city in citiesWithSpots) {
      if ((nextSpotsByCity[city] ?? const <Spot>[]).isNotEmpty) {
        return city;
      }
    }
    return citiesWithSpots.isNotEmpty ? citiesWithSpots.first : _defaultCity;
  }

  Spot? _resolveSelectedSpot(
    String city,
    Map<String, List<Spot>> nextSpotsByCity,
    Spot? currentSpot,
  ) {
    final citySpots = nextSpotsByCity[city] ?? const <Spot>[];
    if (citySpots.isEmpty) {
      return null;
    }
    if (currentSpot != null) {
      for (final spot in citySpots) {
        if (spot.id == currentSpot.id) {
          return spot;
        }
      }
    }
    return citySpots.first;
  }

  List<Spot> _selectTopSpotsForCity(
    String city,
    List<PublicPlaceDto> places,
  ) {
    if (places.isEmpty) {
      return const <Spot>[];
    }

    final List<Spot> candidates = [];
    final Set<String> seenIds = {};

    for (final place in places) {
      if (seenIds.contains(place.placeId)) {
        continue;
      }
      final spot = _mapPublicPlaceToSpot(city, place);
      if (spot == null) {
        continue;
      }
      seenIds.add(spot.id);
      candidates.add(spot);
    }

    if (candidates.isEmpty) {
      return const <Spot>[];
    }

    candidates.sort(_comparePlaces);

    final List<Spot> selected = [];
    final Set<String> selectedIds = {};
    final Set<String> coveredCategories = {};
    const int requiredCategoryCount =
        _minCategoriesPerCity <= _spotsPerCityLimit
            ? _minCategoriesPerCity
            : _spotsPerCityLimit;

    for (final spot in candidates) {
      if (selected.length >= _spotsPerCityLimit) {
        break;
      }
      final categoryKey = _normalizeCategory(spot.category);
      final bool mustCoverCategory =
          coveredCategories.length < requiredCategoryCount;
      if (coveredCategories.contains(categoryKey) && mustCoverCategory) {
        continue;
      }
      coveredCategories.add(categoryKey);
      if (selectedIds.add(spot.id)) {
        selected.add(spot);
      }
    }

    if (selected.length < _spotsPerCityLimit) {
      for (final spot in candidates) {
        if (selected.length >= _spotsPerCityLimit) {
          break;
        }
        if (selectedIds.add(spot.id)) {
          selected.add(spot);
        }
      }
    }

    return selected;
  }

  int _comparePlaces(Spot a, Spot b) {
    final ratingComparison = b.rating.compareTo(a.rating);
    if (ratingComparison != 0) {
      return ratingComparison;
    }
    final countComparison = b.ratingCount.compareTo(a.ratingCount);
    if (countComparison != 0) {
      return countComparison;
    }
    return a.name.compareTo(b.name);
  }

  Spot? _mapPublicPlaceToSpot(String fallbackCity, PublicPlaceDto place) {
    // Debug logging for Luxembourg
    if (place.name.toLowerCase().contains('luxembourg') ||
        place.name.toLowerCase().contains('jardin')) {
      print('🖼️ [_mapPublicPlaceToSpot] Processing: ${place.name}');
      print(
        '🖼️ [_mapPublicPlaceToSpot] place.coverImage: ${place.coverImage}',
      );
      print('🖼️ [_mapPublicPlaceToSpot] place.images: ${place.images}');
    }

    final images = _dedupeImages([
      if ((place.coverImage ?? '').isNotEmpty) place.coverImage!,
      ...place.images,
    ]);

    if (place.name.toLowerCase().contains('luxembourg') ||
        place.name.toLowerCase().contains('jardin')) {
      print('🖼️ [_mapPublicPlaceToSpot] Final images: $images');
    }

    if (place.latitude.isNaN || place.longitude.isNaN) {
      return null;
    }

    // 过滤没有有效图片的地点
    if (images.isEmpty) {
      if (place.name.toLowerCase().contains('luxembourg') ||
          place.name.toLowerCase().contains('jardin')) {
        print('🖼️ [_mapPublicPlaceToSpot] Filtered out due to no images!');
      }
      return null;
    }

    // Debug logging for Sydney Opera House
    if (place.name.toLowerCase().contains('opera')) {
      print('🎭 [_mapPublicPlaceToSpot] Processing: ${place.name}');
      print(
        '🎭 [_mapPublicPlaceToSpot] place.displayTagsEn: ${place.displayTagsEn}',
      );
      print('🎭 [_mapPublicPlaceToSpot] place.aiTags: ${place.aiTags}');
      print('🎭 [_mapPublicPlaceToSpot] place.categoryEn: ${place.categoryEn}');
    }

    // 优先使用后端计算好的 displayTagsEn，否则回退到 aiTags 或 category
    final displayTags = place.displayTagsEn.isNotEmpty
        ? place.displayTagsEn
        : (place.aiTags.isNotEmpty
            ? place.aiTags
            : <String>[place.categoryEn ?? place.category ?? 'Hidden Gem']);

    if (place.name.toLowerCase().contains('opera')) {
      print('🎭 [_mapPublicPlaceToSpot] Final displayTags: $displayTags');
    }

    return Spot(
      id: place.placeId,
      name: place.name,
      city: (place.city ?? '').isNotEmpty ? place.city! : fallbackCity,
      category: (place.categoryEn ?? place.category ?? '').isNotEmpty
          ? (place.categoryEn ?? place.category!)
          : 'Point of Interest',
      latitude: place.latitude,
      longitude: place.longitude,
      rating: place.rating ?? 4.0,
      ratingCount: place.ratingCount ?? 0,
      coverImage: images.first,
      images: images,
      tags: place.aiTags,
      displayTagsEn: displayTags,
      description: place.description,
      aiSummary: place.aiSummary ?? place.aiDescription,
      // 详情页需要的额外字段
      address: place.address,
      phoneNumber: place.phoneNumber,
      website: place.website,
      openingHours: place.openingHours,
      customFields: place.customFields,
    );
  }

  // Debug: 检查是否有剧照数据
  void _debugCheckStillsData() {
    final cacheState = ref.read(placesCacheProvider);
    if (cacheState.hasData) {
      final allPlaces =
          cacheState.placesByCity.values.expand((list) => list).toList();
      final placesWithStills =
          allPlaces.where((p) => p.customFields?.hasStills ?? false).toList();
      print('🎬 [MapPage] 有剧照数据的地点数量: ${placesWithStills.length}');
      for (final p in placesWithStills.take(3)) {
        print(
          '🎬 [MapPage] - ${p.name}: ${p.customFields?.stills.length ?? 0} stills',
        );
      }
    }
  }

  /// 检查是否为有效的图片 URL（排除占位符图片）
  bool _isValidImageUrl(String url) {
    if (url.isEmpty) return false;
    // 排除占位符图片
    if (url.contains('placeholder')) return false;
    if (url.contains('example.com')) return false;
    return true;
  }

  List<String> _dedupeImages(List<String> rawImages) {
    final Set<String> seen = {};
    final List<String> results = [];
    for (final image in rawImages) {
      final normalized = image.trim();
      if (normalized.isEmpty) {
        continue;
      }
      // 过滤占位符图片
      if (!_isValidImageUrl(normalized)) {
        continue;
      }
      if (seen.add(normalized)) {
        results.add(normalized);
      }
    }
    return results;
  }

  String _normalizeCategory(String category) {
    final normalized = category.trim().toLowerCase();
    return normalized.isEmpty ? 'poi' : normalized;
  }
}

class _MapSurface extends StatelessWidget {
  const _MapSurface({
    required this.borderRadius,
    required this.showChrome,
    required this.animateTransitions,
    required this.mapKey,
    required this.spots,
    required this.fallbackCenter,
    required this.currentCenter,
    required this.currentZoom,
    required this.selectedSpot,
    required this.onSpotTap,
    required this.onCameraMove,
  });

  final BorderRadius borderRadius;
  final bool showChrome;
  final bool animateTransitions;
  final GlobalKey<MapboxSpotMapState> mapKey;
  final List<Spot> spots;
  final Position fallbackCenter;
  final Position? currentCenter;
  final double currentZoom;
  final Spot? selectedSpot;
  final ValueChanged<Spot> onSpotTap;
  final void Function(Position center, double zoom) onCameraMove;

  @override
  Widget build(BuildContext context) => AnimatedContainer(
        duration: animateTransitions && showChrome
            ? const Duration(milliseconds: 350)
            : Duration.zero,
        curve: Curves.easeInOut,
        decoration: showChrome
            ? BoxDecoration(
                color: Colors.white,
                borderRadius: borderRadius,
                border: Border.all(
                  color: AppTheme.black,
                  width: AppTheme.borderMedium,
                ),
                boxShadow: AppTheme.cardShadow,
              )
            : const BoxDecoration(),
        child: ClipRRect(
          borderRadius: borderRadius,
          child: MapboxSpotMap(
            key: mapKey,
            spots: spots,
            initialCenter: currentCenter ?? fallbackCenter,
            initialZoom: currentZoom,
            selectedSpot: selectedSpot,
            onSpotTap: onSpotTap,
            onCameraMove: onCameraMove,
            // 添加 EagerGestureRecognizer 确保地图手势优先于父组件
            gestureRecognizers: <Factory<OneSequenceGestureRecognizer>>{
              Factory<OneSequenceGestureRecognizer>(
                () => EagerGestureRecognizer(),
              ),
            },
          ),
        ),
      );
}

class _CitySelector extends ConsumerStatefulWidget {
  const _CitySelector({
    required this.selectedCity,
    required this.cities,
    required this.onCityChanged,
  });

  final String selectedCity;
  final List<String> cities;

  /// 城市选择回调，参数为 (city, country)
  final void Function(String city, String? country) onCityChanged;

  @override
  ConsumerState<_CitySelector> createState() => _CitySelectorState();
}

class _CitySelectorState extends ConsumerState<_CitySelector> {
  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: () => _showCityPicker(context),
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
                widget.selectedCity,
                style: AppTheme.bodySmall(context).copyWith(
                  color: AppTheme.black,
                ),
              ),
              const SizedBox(width: 4),
              const Icon(Icons.keyboard_arrow_down, size: 16),
            ],
          ),
        ),
      );

  void _showCityPicker(BuildContext context) {
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
        selectedCity: widget.selectedCity,
        allCities: widget.cities,
        onCitySelected: (city, country) {
          Navigator.pop(sheetContext); // 先关闭半层
          widget.onCityChanged(city, country); // 再触发回调，传递国家参数
        },
      ),
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
    if (statsState.hasData && statsState.countries.isNotEmpty) {
      // 只在 _selectedCountry 为 null 时设置默认值
      if (_selectedCountry == null) {
        final country = _findCountryForCity(widget.selectedCity, statsState);
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
    for (final country in statsState.countries) {
      if (country.cities.any((c) => c.name == city)) {
        return country.name;
      }
    }
    // 如果找不到，返回第一个国家（而不是 null）
    return statsState.countries.isNotEmpty
        ? statsState.countries.first.name
        : null;
  }

  @override
  Widget build(BuildContext context) {
    final statsState = ref.watch(countriesCitiesStatsProvider);

    // 延迟初始化，避免在 build 中调用 setState
    // 只在第一次有数据且 _selectedCountry 为 null 时设置
    if (_selectedCountry == null &&
        statsState.hasData &&
        statsState.countries.isNotEmpty) {
      // 使用 WidgetsBinding 避免在 build 过程中调用 setState
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _selectedCountry == null) {
          setState(() {
            _selectedCountry =
                _findCountryForCity(widget.selectedCity, statsState);
          });
        }
      });
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
          return ListTile(
            title: Text(city, style: AppTheme.bodyLarge(context)),
            trailing: city == widget.selectedCity
                ? const Icon(Icons.check, color: AppTheme.primaryYellow)
                : null,
            onTap: () => widget.onCitySelected(city, null),
          );
        },
      );

  /// 国家城市两列选择
  Widget _buildCountryCityColumns(
    ScrollController scrollController,
    CountriesCitiesStatsState statsState,
  ) {
    final countries = statsState.countries;
    print(
      '🗺️ [MapPage] 构建国家城市选择器: ${countries.length} 个国家, 当前选中国家: $_selectedCountry',
    );

    // 过滤掉地点数量 < 5 的城市
    final citiesForCountry = _selectedCountry != null
        ? statsState
            .getCities(_selectedCountry!)
            .where((c) => c.placeCount >= 5)
            .toList()
        : <CityStats>[];

    print(
      '🗺️ [MapPage] 当前国家的城市: ${citiesForCountry.length} 个 - ${citiesForCountry.map((c) => c.name).join(", ")}',
    );

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
              itemCount: countries.length,
              itemBuilder: (context, index) {
                final country = countries[index];
                final isSelected = country.name == _selectedCountry;
                return GestureDetector(
                  onTap: () {
                    print('🗺️ [MapPage] 点击切换国家: ${country.name}');
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

/// 底部地点卡片组件 - 全图+渐变覆盖样式（无收藏按钮，收藏在详情页）
class _BottomSpotCard extends ConsumerStatefulWidget {
  const _BottomSpotCard({
    required this.spot,
    required this.onTap,
  });

  final Spot spot;
  final VoidCallback onTap;

  @override
  ConsumerState<_BottomSpotCard> createState() => _BottomSpotCardState();
}

class _BottomSpotCardState extends ConsumerState<_BottomSpotCard> {
  Color _dominantColor = Colors.black;

  /// 获取用户状态（收藏、已访问等）
  /// 返回 (isSaved, isVisited, isMustGo)
  (bool, bool, bool) _getUserStatus() {
    // 首先检查用户是否登录
    final authState = ref.watch(authProvider);
    if (!authState.isAuthenticated) {
      return (false, false, false);
    }

    // 监听 wishlistStatusProvider 以便在缓存更新时重建
    // 这会触发 _BottomSpotCard 在缓存加载完成后自动重建
    ref.watch(wishlistStatusProvider);

    // 从缓存获取状态
    final spotId = widget.spot.id;
    final fullStatus = WishlistStatusCache.getFullStatus(spotId);
    if (fullStatus != null) {
      return (true, fullStatus.isVisited, fullStatus.isMustGo);
    }

    // 回退到基础缓存检查
    final (isInCache, _) = WishlistStatusCache.check(spotId);
    if (isInCache) {
      return (true, false, false);
    }

    return (false, false, false);
  }

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

  /// Build image widget that handles both data URIs and network URLs
  Widget _buildCover() {
    const placeholder = VagoPlaceholderSmall();

    if (widget.spot.coverImage.isEmpty) return placeholder;

    // Handle data URI format (data:image/jpeg;base64,...)
    if (widget.spot.coverImage.startsWith('data:')) {
      try {
        final base64Data = widget.spot.coverImage.split(',').last;
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
    // Handle regular network URLs
    return Image.network(
      widget.spot.coverImage,
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => placeholder,
    );
  }

  @override
  Widget build(BuildContext context) {
    final (isSaved, isVisited, isMustGo) = _getUserStatus();

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
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium - 1),
          child: Stack(
            fit: StackFit.expand,
            children: [
              _buildCover(),
              // 右上角状态图标
              if (isSaved || isVisited)
                Positioned(
                  top: 10,
                  right: 10,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (isVisited)
                        Container(
                          padding: const EdgeInsets.all(6),
                          decoration: BoxDecoration(
                            color: AppTheme.primaryYellow,
                            shape: BoxShape.circle,
                            border:
                                Border.all(color: AppTheme.black, width: 1.5),
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
                        )
                      else if (isSaved)
                        Container(
                          padding: const EdgeInsets.all(6),
                          decoration: BoxDecoration(
                            color: AppTheme.primaryYellow,
                            shape: BoxShape.circle,
                            border:
                                Border.all(color: AppTheme.black, width: 1.5),
                            boxShadow: const [
                              BoxShadow(
                                color: AppTheme.black,
                                blurRadius: 0,
                                offset: Offset(0, 1),
                              ),
                            ],
                          ),
                          child: const Icon(
                            Icons.favorite,
                            color: AppTheme.black,
                            size: 14,
                          ),
                        ),
                    ],
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
                    if (widget.spot.rating > 0 &&
                        widget.spot.ratingCount > 0) ...[
                      const SizedBox(height: 8),
                      _RatingRow(
                        rating: widget.spot.rating,
                        ratingCount: widget.spot.ratingCount,
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
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
    if (rating <= 0 && ratingCount <= 0) {
      return const SizedBox.shrink();
    }

    return Row(
      children: [
        const Icon(Icons.star, color: AppTheme.primaryYellow, size: 18),
        const SizedBox(width: 6),
        Text(
          rating.toStringAsFixed(1),
          style: AppTheme.bodyMedium(context).copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w600,
          ),
        ),
        if (ratingCount > 0) ...[
          const SizedBox(width: 4),
          Text(
            formatRatingCount(ratingCount),
            style: AppTheme.bodySmall(context).copyWith(
              color: Colors.white70,
            ),
          ),
        ],
      ],
    );
  }
}
