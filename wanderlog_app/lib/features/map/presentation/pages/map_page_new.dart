import 'dart:async';
import 'dart:convert';
import 'dart:io' show File;
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' as picker;
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:palette_generator/palette_generator.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/core/utils/category_emoji.dart';
import 'package:wanderlog/core/utils/dialog_utils.dart';
import 'package:wanderlog/features/map/data/models/public_place_dto.dart';
import 'package:wanderlog/features/map/data/supabase_place_repository.dart';
import 'package:wanderlog/features/map/presentation/widgets/mapbox_spot_map.dart';
import 'package:wanderlog/features/map/providers/public_place_providers.dart';
import 'package:wanderlog/features/map/providers/places_cache_provider.dart';
import 'package:wanderlog/features/search/data/search_repository.dart';
import 'package:wanderlog/features/search/providers/countries_cities_stats_provider.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/features/ai_recognition/providers/wishlist_status_provider.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart';
import 'package:wanderlog/shared/utils/destination_utils.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';
import 'package:wanderlog/shared/widgets/save_spot_button.dart';
import 'package:wanderlog/features/trips/presentation/widgets/myland/check_in_dialog.dart';
import 'package:wanderlog/shared/models/spot_model.dart' as spot_model;
import 'package:wanderlog/shared/widgets/unified_spot_detail_modal.dart';
import 'package:wanderlog/features/collections/providers/collection_providers.dart';

/// 地点来源枚举
enum SpotSource {
  google,  // 来自 Google Places API
  cache,   // 来自数据库缓存
  ai,      // 来自 AI 生成（未验证）
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
    this.displayTagsEn = const [],
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
  });

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
  /// 后端计算好的展示标签（category + aiTags + tags 的合并结果）
  final List<String> displayTagsEn;
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
  
  /// 是否是 AI-only 地点（未经 Google 验证）
  bool get isAIOnly => !isVerified && source == SpotSource.ai;
  
  /// 是否有评分
  bool get hasRating => rating > 0;
  
  /// 是否有有效的封面图片（排除占位符 URL）
  bool get hasValidCoverImage {
    if (coverImage.isEmpty) return false;
    if (coverImage.contains('example.com')) return false;
    if (coverImage.contains('placeholder')) return false;
    return true;
  }
  
  /// 复制并修改
  Spot copyWith({
    String? id,
    String? name,
    String? city,
    String? category,
    double? latitude,
    double? longitude,
    double? rating,
    int? ratingCount,
    String? coverImage,
    List<String>? images,
    List<String>? tags,
    List<String>? displayTagsEn,
    String? aiSummary,
    bool? isFromAI,
    bool? isVerified,
    String? recommendationPhrase,
    SpotSource? source,
    String? address,
    String? phoneNumber,
    String? website,
    Map<String, dynamic>? openingHours,
  }) => Spot(
      id: id ?? this.id,
      name: name ?? this.name,
      city: city ?? this.city,
      category: category ?? this.category,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      rating: rating ?? this.rating,
      ratingCount: ratingCount ?? this.ratingCount,
      coverImage: coverImage ?? this.coverImage,
      images: images ?? this.images,
      tags: tags ?? this.tags,
      displayTagsEn: displayTagsEn ?? this.displayTagsEn,
      aiSummary: aiSummary ?? this.aiSummary,
      isFromAI: isFromAI ?? this.isFromAI,
      isVerified: isVerified ?? this.isVerified,
      recommendationPhrase: recommendationPhrase ?? this.recommendationPhrase,
      source: source ?? this.source,
      address: address ?? this.address,
      phoneNumber: phoneNumber ?? this.phoneNumber,
      website: website ?? this.website,
      openingHours: openingHours ?? this.openingHours,
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
  static const int _spotsPerCityLimit = 100; // Increased to show more spots per city
  static const int _minCategoriesPerCity = 1; // Reduced to include cities with fewer categories
  static const String _fallbackCoverImage =
      'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80';

  // 动态计算当前城市的热门标签（从缓存获取）
  List<String> get _dynamicTagOptions {
    // 优先使用后端计算的标签统计
    final cacheState = ref.read(placesCacheProvider);
    final cachedTags = cacheState.getTopTags(_selectedCity);
    if (cachedTags.isNotEmpty) {
      print('🏷️ [_dynamicTagOptions] 使用缓存的标签: ${cachedTags.map((t) => '${t.name}(${t.count})').join(', ')}');
      return cachedTags.map((t) => t.name).toList();
    }
    
    // 回退：基于当前加载的地点计算
    final spots = _currentCitySpots;
    if (spots.isEmpty) return const [];
    
    // 统计所有标签出现次数
    final tagCounts = <String, int>{};
    
    for (final spot in spots) {
      // 统计 category（优先）
      final category = spot.category.trim();
      if (category.isNotEmpty) {
        final normalizedCategory = _capitalizeTag(category);
        tagCounts[normalizedCategory] = (tagCounts[normalizedCategory] ?? 0) + 1;
      }
      
      // 统计 displayTagsEn（后端计算好的展示标签，包含 category + structuredTags + aiTags）
      for (final tag in spot.displayTagsEn) {
        final normalizedTag = _capitalizeTag(tag.trim());
        if (normalizedTag.isNotEmpty) {
          tagCounts[normalizedTag] = (tagCounts[normalizedTag] ?? 0) + 1;
        }
      }
    }
    
    // 按出现次数倒序排序，取前 10 个
    final sortedTags = tagCounts.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    
    // Debug logging
    print('🏷️ [_dynamicTagOptions] 本地计算的标签: ${sortedTags.take(10).map((e) => '${e.key}(${e.value})').join(', ')}');
    
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
    _selectedCity = widget.initialSnapshot?.selectedCity ?? '';
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

    _loadPublicPlaces();
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
    final cityFallback =
        _cityCoordinates[_selectedCity] ??
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
                            onPressed: _handleBackPressed,
                            backgroundColor: Colors.white,
                          ),
                          const SizedBox(width: 12),
                        ],
                        _CitySelector(
                          selectedCity: _selectedCity,
                          cities: _cities,
                          onCityChanged: (city, country) async {
                            print('🔄 [MapPage] 城市切换: $city (国家: $country)');
                            // 保存用户选择的城市
                            ref.read(placesCacheProvider.notifier).saveSelectedCity(city);
                            
                            // 使用缓存的按需加载
                            final places = await ref.read(placesCacheProvider.notifier).loadCityOnDemand(city, country: country);
                            print('🔄 [MapPage] 加载完成: ${places.length} 个地点');
                            
                            // 转换为 Spot
                            List<Spot> spots = [];
                            if (places.isNotEmpty) {
                              spots = _selectTopSpotsForCity(city, places);
                              if (spots.isNotEmpty) {
                                final updatedSpotsByCity = Map<String, List<Spot>>.from(_spotsByCity);
                                updatedSpotsByCity[city] = spots;
                                _spotsByCity = updatedSpotsByCity;
                                _cityCoordinates[city] = _calculateCenterOfSpots(spots);
                              }
                            }
                            
                            final finalSpots = _spotsByCity[city] ?? const <Spot>[];
                            print('🔄 [MapPage] 最终 carouselSpots: ${finalSpots.length} 个');
                            
                            // 计算合适的缩放级别，确保至少 5 个 marker 可见
                            final (:center, :zoom) = _calculateCenterAndZoomForSpots(finalSpots, minSpots: 5);
                            
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
                        IconButtonCustom(
                          icon: _isFullscreen
                              ? Icons.fullscreen_exit
                              : Icons.fullscreen,
                          size: 36,
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
        height: 36,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
          border: Border.all(color: AppTheme.black, width: 1),
          boxShadow: AppTheme.searchBoxShadow,
        ),
        child: Row(
          children: [
            const SizedBox(width: 12),
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
            else
              const SizedBox(width: 12),
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
          DialogUtils.showToast(context, 'Sorry no related places, please try again');
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
          DialogUtils.showToast(context, 'Sorry no related places, please try again');
          setState(() {
            _isSearching = false;
          });
        }
        return;
      }
      
      // 计算中心点和缩放
      final (:center, :zoom) = _calculateCenterAndZoomForSpots(spots, minSpots: 5);
      
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
        DialogUtils.showToast(context, 'Sorry no related places, please try again');
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
    final (:center, :zoom) = _calculateCenterAndZoomForSpots(defaultSpots, minSpots: 5);
    
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
      
      // 转换为 Spot
      final spots = places.map((place) => _mapPublicPlaceToSpot(_selectedCity, place)).whereType<Spot>().toList();
      
      // 计算中心点和缩放
      final (:center, :zoom) = _calculateCenterAndZoomForSpots(spots, minSpots: 5);
      
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

  String _tagEmoji(String tag) {
    return getCategoryEmoji(tag);
  }

  void _showSpotDetail(Spot spot) async {
    // 先加载合集数据
    Map<String, dynamic>? linkedCollection;
    try {
      final repo = ref.read(collectionRepositoryProvider);
      final collections = await repo.getCollectionsForPlace(spot.id);
      if (collections.isNotEmpty) {
        final random = math.Random();
        linkedCollection = collections[random.nextInt(collections.length)];
      }
    } catch (e) {
      // 静默失败
    }
    
    if (!mounted) return;
    
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => UnifiedSpotDetailModal(
        spot: spot,
        linkedCollection: linkedCollection,
      ),
    );
  }

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
    print('📍 [MapPage] 缓存状态: hasData=${updatedCacheState.hasData}, isLoading=${updatedCacheState.isLoading}, isInitialLoading=${updatedCacheState.isInitialLoading}');
    
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
      timeoutTimer = Timer(const Duration(seconds: 30), () {
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
      
      subscription = ref.listenManual(placesCacheProvider, (previous, next) async {
        print('📍 [MapPage] 缓存状态变化: hasData=${next.hasData}, isLoading=${next.isLoading}, error=${next.error}');
        if (next.hasData) {
          timeoutTimer?.cancel();
          subscription.close();
          await _loadFromCache(next);
          if (!completer.isCompleted) completer.complete();
        } else if (!next.isLoading && !next.isInitialLoading && next.error != null) {
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
    timeoutTimer = Timer(const Duration(seconds: 30), () {
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
    
    subscription = ref.listenManual(placesCacheProvider, (previous, next) async {
      print('📍 [MapPage] 预加载状态变化: hasData=${next.hasData}, isLoading=${next.isLoading}, error=${next.error}');
      if (next.hasData) {
        timeoutTimer?.cancel();
        subscription.close();
        await _loadFromCache(next);
        if (!completer.isCompleted) completer.complete();
      } else if (!next.isLoading && !next.isInitialLoading && next.error != null) {
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
  ({Position center, double zoom}) _calculateCenterAndZoomForSpots(List<Spot> spots, {int minSpots = 5}) {
    if (spots.isEmpty) {
      return (center: Position(2.3522, 48.8566), zoom: _collapsedMapZoom);
    }
    if (spots.length == 1) {
      return (center: Position(spots.first.longitude, spots.first.latitude), zoom: 14.0);
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
    
    print('📍 [MapPage] 计算缩放级别: ${spotsToFit.length} 个地点, latSpan=$latSpan, lngSpan=$lngSpan, zoom=$zoom');
    
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
        .toList()..sort();
    final resolvedCity = _resolveCitySelection(nextSpotsByCity, citiesWithSpots);
    
    // 如果选中的城市没有数据，尝试加载
    if ((nextSpotsByCity[resolvedCity] ?? const <Spot>[]).isEmpty && resolvedCity.isNotEmpty) {
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
          country: country,  // 传递国家参数
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
      resolvedSpot = _resolveSelectedSpot(resolvedCity, nextSpotsByCity, _selectedSpot);
      // 如果有选中的地点，显示附近地点；否则显示该城市的所有地点
      if (resolvedSpot != null) {
        nearby = _computeNearbySpots(resolvedSpot, baseSpots: nextSpotsByCity[resolvedCity]);
      } else {
        nearby = nextSpotsByCity[resolvedCity] ?? const <Spot>[];
      }
    } else {
      resolvedSpot = null;
      nearby = const <Spot>[];
    }
    
    // 计算初始视图：确保至少 5 个 marker 在屏幕中央
    final citySpots = nextSpotsByCity[resolvedCity] ?? const <Spot>[];
    final (:center, :zoom) = _calculateCenterAndZoomForSpots(citySpots, minSpots: 5);
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

    final resolvedCity = _resolveCitySelection(nextSpotsByCity, citiesWithSpots);
    
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
    final (:center, :zoom) = _calculateCenterAndZoomForSpots(citySpots, minSpots: 5);
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

  void _updateMapPosition(Position targetCenter, [Spot? spot, double? zoom]) async {
    final mapState = _mapKey.currentState;
    if (mapState != null) {
      final targetZoom = zoom ?? (spot != null
          ? math.max(_currentZoom, 14.0)
          : _currentZoom);
      await mapState.jumpToPosition(
        targetCenter,
        zoom: targetZoom,
      );
    } else {
      _jumpToCollapsedViewport(targetCenter);
    }
  }

  static const String _defaultCity = 'Paris';  // 默认城市

  String _resolveCitySelection(
    Map<String, List<Spot>> nextSpotsByCity,
    List<String> citiesWithSpots,
  ) {
    // 1. 如果已经有选中的城市（来自 snapshot 或用户选择），优先保持
    //    即使该城市暂时没有数据，也保持选择（数据会后续加载）
    if (_selectedCity.isNotEmpty) {
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
    
    // 4. 使用第一个有数据的城市
    if ((nextSpotsByCity[_defaultCity] ?? const <Spot>[]).isNotEmpty) {
      return _defaultCity;
    }
    if (citiesWithSpots.contains(_defaultCity)) {
      return _defaultCity;
    }
    
    // Otherwise, pick the first city with spots
    for (final city in citiesWithSpots) {
      if ((nextSpotsByCity[city] ?? const <Spot>[]).isNotEmpty) {
        return city;
      }
    }
    return citiesWithSpots.isNotEmpty ? citiesWithSpots.first : '';
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
    final images = _dedupeImages([
      if ((place.coverImage ?? '').isNotEmpty) place.coverImage!,
      ...place.images,
    ]);

    if (place.latitude.isNaN || place.longitude.isNaN) {
      return null;
    }

    // Debug logging for Sydney Opera House
    if (place.name.toLowerCase().contains('opera')) {
      print('🎭 [_mapPublicPlaceToSpot] Processing: ${place.name}');
      print('🎭 [_mapPublicPlaceToSpot] place.displayTagsEn: ${place.displayTagsEn}');
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
      coverImage: images.isNotEmpty ? images.first : _fallbackCoverImage,
      images: images.isNotEmpty ? images : <String>[_fallbackCoverImage],
      tags: place.aiTags,
      displayTagsEn: displayTags,
      aiSummary: place.aiSummary ?? place.aiDescription ?? place.description,
      // 详情页需要的额外字段
      address: place.address,
      phoneNumber: place.phoneNumber,
      website: place.website,
      openingHours: place.openingHours,
    );
  }

  List<String> _dedupeImages(List<String> rawImages) {
    final Set<String> seen = {};
    final List<String> results = [];
    for (final image in rawImages) {
      final normalized = image.trim();
      if (normalized.isEmpty) {
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
          height: 36,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
            border: Border.all(color: AppTheme.black, width: 1),
            boxShadow: AppTheme.searchBoxShadow,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                widget.selectedCity,
                style: AppTheme.labelMedium(context),
              ),
              const SizedBox(width: 2),
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
          widget.onCityChanged(city, country);  // 再触发回调，传递国家参数
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
  ConsumerState<_CountryCityPickerSheet> createState() => _CountryCityPickerSheetState();
}

class _CountryCityPickerSheetState extends ConsumerState<_CountryCityPickerSheet> {
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
  
  String? _findCountryForCity(String city, CountriesCitiesStatsState statsState) {
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
  Widget _buildSimpleCityList(ScrollController scrollController) => ListView.builder(
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
  Widget _buildCountryCityColumns(ScrollController scrollController, CountriesCitiesStatsState statsState) {
    final countries = statsState.countries;
    // 过滤掉地点数量 < 5 的城市
    final citiesForCountry = _selectedCountry != null 
        ? statsState.getCities(_selectedCountry!).where((c) => c.placeCount >= 5).toList()
        : <CityStats>[];
    
    return Row(
      children: [
        // 左侧国家列表
        Expanded(
          flex: 2,
          child: Container(
            decoration: BoxDecoration(
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
                    setState(() {
                      _selectedCountry = country.name;
                    });
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                    color: isSelected ? AppTheme.primaryYellow.withOpacity(0.2) : Colors.transparent,
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            country.name,
                            style: AppTheme.bodyMedium(context).copyWith(
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (isSelected)
                          const Icon(Icons.chevron_right, size: 18, color: AppTheme.mediumGray),
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
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                  color: isSelected ? AppTheme.primaryYellow.withOpacity(0.2) : Colors.transparent,
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          city.name,
                          style: AppTheme.bodyMedium(context).copyWith(
                            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (isSelected)
                        const Icon(Icons.check, size: 18, color: AppTheme.primaryYellow),
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
class _BottomSpotCard extends StatefulWidget {
  const _BottomSpotCard({
    required this.spot,
    required this.onTap,
  });

  final Spot spot;
  final VoidCallback onTap;

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

  /// Build image widget that handles both data URIs and network URLs
  Widget _buildCover() {
    const placeholder = ColoredBox(
      color: AppTheme.lightGray,
      child: const Icon(
        Icons.place,
        size: 52,
        color: AppTheme.mediumGray,
      ),
    );

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
  Widget build(BuildContext context) => GestureDetector(
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
                    const SizedBox(height: 8),
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
          hasRating ? rating.toStringAsFixed(1) : '暂无评分',
          style: AppTheme.bodyMedium(context).copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w600,
          ),
        ),
        if (hasRating) ...[
          const SizedBox(width: 4),
          Text(
            '($ratingCount)',
            style: AppTheme.bodySmall(context).copyWith(
              color: Colors.white70,
            ),
          ),
        ],
      ],
    );
  }
}

class SpotDetailModal extends ConsumerStatefulWidget {
  const SpotDetailModal({
    required this.spot,
    this.initialIsSaved,
    this.initialIsMustGo,
    this.initialIsTodaysPlan,
    super.key,
  });

  final Spot spot;
  /// If provided, skip async loading and use these initial values
  final bool? initialIsSaved;
  final bool? initialIsMustGo;
  final bool? initialIsTodaysPlan;

  @override
  ConsumerState<SpotDetailModal> createState() => _SpotDetailModalState();
}

class _SpotDetailModalState extends ConsumerState<SpotDetailModal> {
  final PageController _imagePageController = PageController();
  int _currentImageIndex = 0;
  bool _isWishlist = false;
  bool _isMustGo = false;
  bool _isTodaysPlan = false;
  bool _isVisited = false; // Check-in status
  String? _destinationId;
  bool _hasStatusChanged = false; // Track if any status changed

  @override
  void initState() {
    super.initState();
    // If caller passes initial values, use them for first paint to avoid flicker.
    // Still fetch latest status/destinationId afterwards to stay in sync.
    if (widget.initialIsSaved != null) {
      _isWishlist = widget.initialIsSaved!;
      _isMustGo = widget.initialIsMustGo ?? false;
      _isTodaysPlan = widget.initialIsTodaysPlan ?? false;
    }
    // Always load authoritative status in background.
    _loadWishlistStatus();
  }

  /// Load only the destinationId without updating wishlist status
  Future<void> _loadDestinationId() async {
    final auth = ref.read(authProvider);
    if (!auth.isAuthenticated) return;
    try {
      final repo = ref.read(tripRepositoryProvider);
      final trips = await repo.getMyTrips();
      for (final t in trips) {
        try {
          final detail = await repo.getTripById(t.id);
          final tripSpot = detail.tripSpots?.firstWhere(
            _matchesTripSpot,
            orElse: () => throw StateError('not found'),
          );
          if (tripSpot != null) {
            _destinationId = detail.id;
            return;
          }
        } catch (_) {
          // ignore this trip
        }
      }
      // Fallback: get/create destination by city
      final city = widget.spot.city.trim();
      if (city.isEmpty) return;
      _destinationId = await ensureDestinationForCity(ref, city);
    } catch (_) {
      // ignore errors
    }
  }

  List<String> _effectiveTags() {
    final List<String> result = [];
    final Set<String> seen = {};

    final category = widget.spot.category.trim();
    if (category.isNotEmpty) {
      result.add(category);
      seen.add(category.toLowerCase());
    }

    for (final raw in widget.spot.tags) {
      final tag = raw.toString().trim();
      if (tag.isEmpty) continue;
      final key = tag.toLowerCase();
      if (seen.add(key)) {
        result.add(tag);
      }
    }

    return result;
  }

  /// Build placeholder widget for missing images
  Widget _buildPlaceholder() => Container(
      decoration: const BoxDecoration(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(24),
        ),
        color: AppTheme.lightGray,
      ),
      child: const Center(
        child: Icon(
          Icons.image_outlined,
          size: 64,
          color: AppTheme.mediumGray,
        ),
      ),
    );

  @override
  void dispose() {
    _imagePageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Container(
        height: MediaQuery.of(context).size.height * 0.85,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: const BorderRadius.vertical(
            top: Radius.circular(24),
          ),
          border:
              Border.all(color: AppTheme.black, width: AppTheme.borderMedium),
        ),
        child: Column(
          children: [
            Stack(
              children: [
                SizedBox(
                  height: 300,
                  child: widget.spot.images.isNotEmpty
                      ? PageView.builder(
                          controller: _imagePageController,
                          onPageChanged: (index) {
                            setState(() {
                              _currentImageIndex = index;
                            });
                          },
                          itemCount: widget.spot.images.length,
                          itemBuilder: (context, index) {
                            final imageSource = widget.spot.images[index];
                            // Handle data URI images
                            if (imageSource.startsWith('data:')) {
                              try {
                                final base64Data = imageSource.split(',').last;
                                final bytes = base64Decode(base64Data);
                                return ClipRRect(
                                  borderRadius: const BorderRadius.vertical(
                                    top: Radius.circular(24),
                                  ),
                                  child: Image.memory(
                                    bytes,
                                    fit: BoxFit.cover,
                                    width: double.infinity,
                                    height: double.infinity,
                                    errorBuilder: (_, __, ___) =>
                                        _buildPlaceholder(),
                                  ),
                                );
                              } catch (e) {
                                return _buildPlaceholder();
                              }
                            }
                            // Handle network URLs
                            return Container(
                              decoration: BoxDecoration(
                                borderRadius: const BorderRadius.vertical(
                                  top: Radius.circular(24),
                                ),
                                image: DecorationImage(
                                  image: NetworkImage(imageSource),
                                  fit: BoxFit.cover,
                                ),
                              ),
                            );
                          },
                        )
                      : _buildPlaceholder(),
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
                    onPressed: () => Navigator.pop(context, _hasStatusChanged),
                    backgroundColor: Colors.white,
                  ),
                ),
                // Check-in button in bottom right corner
                Positioned(
                  bottom: 16,
                  right: 16,
                  child: _buildCheckInButton(),
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
                      children: _effectiveTags()
                          .map(
                            (tag) => Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 6,
                              ),
                              decoration: BoxDecoration(
                                color: AppTheme.primaryYellow.withOpacity(0.3),
                                borderRadius: BorderRadius.circular(
                                  AppTheme.radiusSmall,
                                ),
                                border: Border.all(
                                  color: AppTheme.black,
                                  width: AppTheme.borderMedium,
                                ),
                              ),
                              child: Text(
                                tag,
                                style: AppTheme.labelMedium(context),
                              ),
                            ),
                          )
                          .toList(),
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
                        ...List.generate(
                          5,
                          (index) => Icon(
                            index < widget.spot.rating.floor()
                                ? Icons.star
                                : (index < widget.spot.rating
                                    ? Icons.star_half
                                    : Icons.star_border),
                            color: AppTheme.primaryYellow,
                            size: 24,
                          ),
                        ),
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
                    // 根据收藏状态显示不同的按钮
                    if (!_isWishlist)
                      // 未收藏状态：显示大的收藏按钮
                      GestureDetector(
                        onTap: () async {
                                // Optimistic UI: update state immediately
                                setState(() {
                                  _isWishlist = true;
                                  _hasStatusChanged = true;
                                });
                                CustomToast.showSuccess(context, 'Saved');
                                // Then do API call in background
                                final success = await _handleAddWishlist();
                                if (!success && mounted) {
                                  // Revert on failure
                                  setState(() {
                                    _isWishlist = false;
                                    _hasStatusChanged = true;
                                  });
                                  CustomToast.showError(context, 'Failed to save');
                                }
                              },
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          decoration: BoxDecoration(
                            color: AppTheme.primaryYellow,
                            borderRadius:
                                BorderRadius.circular(AppTheme.radiusSmall),
                            border: Border.all(color: AppTheme.black, width: 2),
                            boxShadow: AppTheme.cardShadow,
                          ),
                          child: Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    const Icon(
                                      Icons.favorite_border,
                                      color: AppTheme.black,
                                      size: 24,
                                    ),
                                    const SizedBox(width: 12),
                                    Text(
                                      'Save',
                                      style:
                                          AppTheme.labelLarge(context).copyWith(
                                        color: AppTheme.black,
                                        fontWeight: FontWeight.bold,
                                        fontSize: 18,
                                      ),
                                    ),
                                  ],
                                ),
                        ),
                      )
                    else
                      // 已收藏状态：显示完整的 SaveSpotButton
                      SaveSpotButton(
                        isSaved: true,
                        isMustGo: _isMustGo,
                        isTodaysPlan: _isTodaysPlan,
                        onSave: () async => true,
                        onUnsave: () async {
                          // Optimistic UI: update state immediately
                          final prevMustGo = _isMustGo;
                          final prevTodaysPlan = _isTodaysPlan;
                          setState(() {
                            _isWishlist = false;
                            _isMustGo = false;
                            _isTodaysPlan = false;
                            _hasStatusChanged = true;
                          });
                          CustomToast.showSuccess(context, 'Removed');
                          // Then do API call in background
                          final ok = await _handleRemoveWishlist();
                          if (!ok && mounted) {
                            // Revert on failure
                            setState(() {
                              _isWishlist = true;
                              _isMustGo = prevMustGo;
                              _isTodaysPlan = prevTodaysPlan;
                              _hasStatusChanged = true;
                            });
                            CustomToast.showError(context, 'Failed to remove');
                          }
                          return ok;
                        },
                        onToggleMustGo: (isChecked) async {
                          // Optimistic UI: update state immediately
                          setState(() {
                            _isMustGo = isChecked;
                            _hasStatusChanged = true;
                          });
                          CustomToast.showSuccess(
                            context,
                            isChecked ? 'Added to MustGo' : 'Removed from MustGo',
                          );
                          // Then do API call in background
                          final ok = await _handleToggleMustGo(isChecked);
                          if (!ok && mounted) {
                            // Revert on failure
                            setState(() {
                              _isMustGo = !isChecked;
                              _hasStatusChanged = true;
                            });
                            CustomToast.showError(context, 'Failed to update');
                          }
                          return ok;
                        },
                        onToggleTodaysPlan: (isChecked) async {
                          // Optimistic UI: update state immediately
                          setState(() {
                            _isTodaysPlan = isChecked;
                            _hasStatusChanged = true;
                          });
                          CustomToast.showSuccess(
                            context,
                            isChecked ? "Added to Today's Plan" : "Removed from Today's Plan",
                          );
                          // Then do API call in background
                          final ok = await _handleToggleTodaysPlan(isChecked);
                          if (!ok && mounted) {
                            // Revert on failure
                            setState(() {
                              _isTodaysPlan = !isChecked;
                              _hasStatusChanged = true;
                            });
                            CustomToast.showError(context, 'Failed to update');
                          }
                          return ok;
                        },
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      );

  Future<bool> _handleAddWishlist() async {
    try {
      final authed = await requireAuth(context, ref);
      if (!authed) return false;
      final destId = await ensureDestinationForCity(ref, widget.spot.city);
      if (destId == null) {
        _showError('Failed to create destination');
        return false;
      }
      _destinationId = destId;
      await ref.read(tripRepositoryProvider).manageTripSpot(
            tripId: destId,
            spotId: widget.spot.id,
            status: TripSpotStatus.wishlist,
            spotPayload: _spotPayload(),
          );
      // 立即更新同步缓存，避免下次打开时闪烁
      WishlistStatusCache.update(widget.spot.id, destId);
      ref.invalidate(tripsProvider);
      ref.invalidate(wishlistStatusProvider);
      return true;
    } catch (e) {
      _showError('Error: $e');
      return false;
    }
  }

  Future<bool> _handleRemoveWishlist() async {
    try {
      final authed = await requireAuth(context, ref);
      if (!authed) return false;

      final destId = _destinationId ?? await ensureDestinationForCity(ref, widget.spot.city);
      if (destId == null) {
        _showError('Failed to load destination');
        return false;
      }

      await ref.read(tripRepositoryProvider).manageTripSpot(
            tripId: destId,
            spotId: widget.spot.id,
            remove: true,
          );
      // 立即更新同步缓存，避免下次打开时闪烁
      WishlistStatusCache.update(widget.spot.id, null);
      ref.invalidate(tripsProvider);
      ref.invalidate(wishlistStatusProvider);
      return true;
    } catch (e) {
      _showError('Error: $e');
      return false;
    }
  }

  Future<void> _handleAddStatus({
    required TripSpotStatus status,
    SpotPriority? priority,
  }) async {
    try {
      final authed = await requireAuth(context, ref);
      if (!authed) return;
      final destId =
          _destinationId ?? await ensureDestinationForCity(ref, widget.spot.city);
      if (destId == null) {
        _showError('Failed to create destination');
        return;
      }
      _destinationId = destId;
      await ref.read(tripRepositoryProvider).manageTripSpot(
            tripId: destId,
            spotId: widget.spot.id,
            status: status,
            priority: priority,
            spotPayload: _spotPayload(),
          );
      if (mounted) {
        CustomToast.showSuccess(
          context,
          status == TripSpotStatus.todaysPlan
              ? "Added to Today's Plan"
              : 'Added to MustGo',
        );
      }
    } catch (e) {
      _showError('Error: $e');
    }
  }

  Future<bool> _handleToggleMustGo(bool isChecked) async {
    try {
      final authed = await requireAuth(context, ref);
      if (!authed) return false;
      
      final destId = _destinationId ?? await ensureDestinationForCity(ref, widget.spot.city);
      if (destId == null) {
        _showError('Failed to create destination');
        return false;
      }
      _destinationId = destId;
      
      await ref.read(tripRepositoryProvider).manageTripSpot(
        tripId: destId,
        spotId: widget.spot.id,
        status: TripSpotStatus.wishlist,
        priority: isChecked ? SpotPriority.mustGo : SpotPriority.optional,
        spotPayload: _spotPayload(),
      );
      
      ref.invalidate(tripsProvider);
      return true;
    } catch (e) {
      _showError('Error: $e');
      return false;
    }
  }

  Future<bool> _handleToggleTodaysPlan(bool isChecked) async {
    try {
      final authed = await requireAuth(context, ref);
      if (!authed) return false;
      
      final destId = _destinationId ?? await ensureDestinationForCity(ref, widget.spot.city);
      if (destId == null) {
        _showError('Failed to create destination');
        return false;
      }
      _destinationId = destId;
      
      await ref.read(tripRepositoryProvider).manageTripSpot(
        tripId: destId,
        spotId: widget.spot.id,
        status: isChecked ? TripSpotStatus.todaysPlan : TripSpotStatus.wishlist,
        spotPayload: _spotPayload(),
      );
      
      ref.invalidate(tripsProvider);
      return true;
    } catch (e) {
      _showError('Error: $e');
      return false;
    }
  }

  /// Check if a TripSpot matches the current spot by googlePlaceId or name
  bool _matchesTripSpot(TripSpot ts) {
    final spot = ts.spot;
    if (spot == null) return false;
    // Compare by googlePlaceId (widget.spot.id is the googlePlaceId in this context)
    if (spot.googlePlaceId == widget.spot.id) return true;
    // Fallback: compare by name (case-insensitive)
    if (spot.name.toLowerCase() == widget.spot.name.toLowerCase()) return true;
    return false;
  }

  Future<void> _loadWishlistStatus() async {
    final auth = ref.read(authProvider);
    if (!auth.isAuthenticated) return;
    try {
      void updateFromTripSpot(TripSpot ts) {
        if (!mounted) return;
        setState(() {
          _isWishlist = true;
          _isMustGo = ts.priority == SpotPriority.mustGo;
          _isTodaysPlan = ts.status == TripSpotStatus.todaysPlan;
        });
      }

      // 如果已有 destinationId，先查一次
      if (_destinationId != null) {
        final trip = await ref.read(tripRepositoryProvider).getTripById(_destinationId!);
        final tripSpot = trip.tripSpots?.firstWhere(
          _matchesTripSpot,
          orElse: () => throw StateError('not found'),
        );
        if (tripSpot != null) {
          _destinationId = trip.id;
          updateFromTripSpot(tripSpot);
          return;
        }
      }

      // 遍历所有 trips，查找包含该 spot 的记录
      final repo = ref.read(tripRepositoryProvider);
      final trips = await repo.getMyTrips();
      for (final t in trips) {
        try {
          final detail = await repo.getTripById(t.id);
          final tripSpot = detail.tripSpots?.firstWhere(
            _matchesTripSpot,
            orElse: () => throw StateError('not found'),
          );
          if (tripSpot != null) {
            _destinationId = detail.id;
            updateFromTripSpot(tripSpot);
            return;
          }
        } catch (_) {
          // ignore this trip
        }
      }

      // 最后再按城市兜底创建/获取 destination
      final city = widget.spot.city.trim();
      if (city.isEmpty) return;
      final destId = await ensureDestinationForCity(ref, city);
      if (destId == null) return;
      _destinationId = destId;
      final trip = await ref.read(tripRepositoryProvider).getTripById(destId);
      final tripSpot = trip.tripSpots?.firstWhere(
        _matchesTripSpot,
        orElse: () => throw StateError('not found'),
      );
      if (tripSpot != null && mounted) {
        updateFromTripSpot(tripSpot);
      }
    } catch (_) {
      // ignore preload errors
    }
  }

  Widget _buildCheckInButton() => GestureDetector(
      onTap: _isVisited ? null : _handleCheckIn,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: _isVisited ? AppTheme.background : AppTheme.primaryYellow,
          borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
          border: Border.all(
            color: AppTheme.black,
            width: AppTheme.borderMedium,
          ),
          boxShadow: _isVisited ? null : AppTheme.cardShadow,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_isVisited) ...[
              const Text('✓', style: TextStyle(fontSize: 16)),
              const SizedBox(width: 6),
            ],
            Text(
              _isVisited ? 'Checked in' : 'Check in',
              style: AppTheme.labelMedium(context).copyWith(
                color: AppTheme.black,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      ),
    );

  Future<void> _handleCheckIn() async {
    // Check authentication first
    final authed = await requireAuth(context, ref);
    if (!authed) return; // User not logged in, already navigated to login page
    
    // User is logged in, show check-in dialog
    if (!context.mounted) return;
    
    // Convert Spot to spot_model.Spot for CheckInDialog
    final now = DateTime.now();
    final spotModel = spot_model.Spot(
      id: widget.spot.id,
      googlePlaceId: widget.spot.id,
      name: widget.spot.name,
      city: widget.spot.city,
      latitude: widget.spot.latitude,
      longitude: widget.spot.longitude,
      tags: widget.spot.tags,
      images: widget.spot.images,
      rating: widget.spot.rating,
      ratingCount: widget.spot.ratingCount,
      category: widget.spot.category,
      createdAt: now,
      updatedAt: now,
    );
    
    showDialog<void>(
      context: context,
      builder: (context) => CheckInDialog(
        spot: spotModel,
        onCheckIn: (visitDate, rating, notes) async {
          // TODO: Implement check-in API call
          if (mounted) {
            setState(() {
              _isVisited = true;
            });
            CustomToast.showSuccess(context, 'Checked in to ${widget.spot.name}');
          }
        },
      ),
    );
  }

  void _showError(String message) {
    if (!mounted) return;
    CustomToast.showError(context, message);
  }

  Map<String, dynamic> _spotPayload() => {
        'name': widget.spot.name,
        'city': widget.spot.city,
        'country': widget.spot.city,
        'latitude': widget.spot.latitude,
        'longitude': widget.spot.longitude,
        'address': null,
        'description': widget.spot.aiSummary,
        'openingHours': null,
        'rating': widget.spot.rating,
        'ratingCount': widget.spot.ratingCount,
        'category': widget.spot.category,
        'aiSummary': widget.spot.aiSummary,
        'tags': widget.spot.tags.isNotEmpty ? widget.spot.tags : <String>[],
        'coverImage': widget.spot.coverImage,
        'images':
            widget.spot.images.isNotEmpty ? widget.spot.images : <String>[],
        'priceLevel': null,
        'website': null,
        'phoneNumber': null,
        'googlePlaceId': widget.spot.id, // 添加 googlePlaceId 用于匹配
        'source': 'app_wishlist',
      };
}
