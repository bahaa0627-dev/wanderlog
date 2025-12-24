import 'dart:async';
import 'dart:convert';
import 'dart:io' show File;
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' as picker;
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/map/data/models/public_place_dto.dart';
import 'package:wanderlog/features/map/data/supabase_place_repository.dart';
import 'package:wanderlog/features/map/data/sample_public_places.dart';
import 'package:wanderlog/features/map/presentation/widgets/mapbox_spot_map.dart';
import 'package:wanderlog/features/map/providers/public_place_providers.dart';
import 'package:wanderlog/features/map/providers/places_cache_provider.dart';
import 'package:wanderlog/features/search/providers/countries_cities_provider.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart';
import 'package:wanderlog/shared/utils/destination_utils.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';
import 'package:wanderlog/shared/widgets/save_spot_button.dart';
import 'package:wanderlog/features/trips/presentation/widgets/myland/check_in_dialog.dart';
import 'package:wanderlog/shared/models/spot_model.dart' as spot_model;
import 'package:wanderlog/shared/widgets/unified_spot_detail_modal.dart';

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
    this.aiSummary,
    this.isFromAI = false,
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
  final String? aiSummary;
  final bool isFromAI;
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

  static const List<String> _tagOptions = [
    'Architecture',
    'Museum',
    'Coffee',
    'Food',
    'Nature',
    'History',
    'Culture',
  ];

  final GlobalKey<MapboxSpotMapState> _mapKey = GlobalKey<MapboxSpotMapState>();
  late String _selectedCity;
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

    _loadPublicPlaces();
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
    _cardPageController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  List<String> get _cities => _availableCities;

  List<Spot> get _currentCitySpots => _spotsByCity[_selectedCity] ?? const [];

  List<Spot> get _filteredSpots {
    final spots = _currentCitySpots;
    if (_selectedTags.isEmpty) {
      return spots;
    }
    return spots
        .where((spot) => spot.tags.any(_selectedTags.contains))
        .toList();
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
      selectedSpot: _selectedSpot,
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
                          onCityChanged: (city) {
                            setState(() {
                              _selectedCity = city;
                              _selectedSpot = null;
                              _carouselSpots = const [];
                              _currentCardIndex = 0;
                              _currentMapCenter = _cityCoordinates[city];
                            });
                            _jumpToPage(0);
                            _animateCamera(_cityCoordinates[city]!);
                            // 保存用户选择的城市
                            ref.read(placesCacheProvider.notifier).saveSelectedCity(city);
                          },
                        ),
                        if (_isFullscreen) ...[
                          const SizedBox(width: 12),
                          Expanded(child: _buildFullscreenSearchBar(context)),
                        ],
                        if (!_isFullscreen) const Spacer(),
                        if (_isFullscreen) const SizedBox(width: 12),
                        IconButtonCustom(
                          icon: _isFullscreen
                              ? Icons.fullscreen_exit
                              : Icons.fullscreen,
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
                    const SizedBox(height: 12),
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
                child: SizedBox(
                  height: 250, // 增加高度避免 overflow
                  child: PageView.builder(
                    controller: _cardPageController,
                    clipBehavior: Clip.none, // 允许卡片超出边界
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
                        child: _BottomSpotCard(
                          spot: spot,
                          onTap: () => _showSpotDetail(spot),
                        ),
                      );
                    },
                  ),
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
                  hintText: 'Find your interest',
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
              onPressed: () async {
                try {
                  final picked = await picker.ImagePicker().pickImage(
                    source: picker.ImageSource.gallery,
                  );
                  if (picked != null) {
                    setState(() => _searchPickedImage = picked);
                  }
                } catch (_) {}
              },
            ),
            if (_searchPickedImage != null) ...[
              const SizedBox(width: 4),
              ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: Image.file(
                  File(_searchPickedImage!.path),
                  width: 36,
                  height: 36,
                  fit: BoxFit.cover,
                ),
              ),
              const SizedBox(width: 12),
            ] else ...[
              const SizedBox(width: 12),
            ],
          ],
        ),
      );

  Widget _buildTagBar() {
    const tags = _tagOptions;
    return SizedBox(
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
                  Text(
                    tag,
                    style: AppTheme.labelMedium(context),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  void _toggleTag(String tag) {
    setState(() {
      if (_selectedTags.contains(tag)) {
        _selectedTags.remove(tag);
      } else {
        _selectedTags.add(tag);
      }
      _selectedSpot = null;
      _carouselSpots = const [];
      _currentCardIndex = 0;
    });
    _jumpToPage(0);
    // 共享组件会自动更新
  }

  String _tagEmoji(String tag) {
    switch (tag.toLowerCase()) {
      case 'architecture':
        return '🏛️';
      case 'museum':
        return '🎨';
      case 'coffee':
        return '☕';
      case 'food':
        return '🍽️';
      case 'nature':
        return '🌿';
      case 'history':
        return '📜';
      case 'culture':
        return '🎭';
      default:
        return '📍';
    }
  }

  void _showSpotDetail(Spot spot) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => UnifiedSpotDetailModal(spot: spot),
    );
  }

  Future<void> _loadPublicPlaces() async {
    print('📍 [MapPage] _loadPublicPlaces 开始');
    
    // 优先使用缓存数据
    final cacheState = ref.read(placesCacheProvider);
    print('📍 [MapPage] 缓存状态: hasData=${cacheState.hasData}, isLoading=${cacheState.isLoading}, isInitialLoading=${cacheState.isInitialLoading}');
    
    if (cacheState.hasData) {
      // 使用缓存数据
      print('📍 [MapPage] 使用缓存数据');
      _loadFromCache(cacheState);
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
      
      subscription = ref.listenManual(placesCacheProvider, (previous, next) {
        print('📍 [MapPage] 缓存状态变化: hasData=${next.hasData}, isLoading=${next.isLoading}, error=${next.error}');
        if (next.hasData) {
          timeoutTimer?.cancel();
          subscription.close();
          _loadFromCache(next);
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
    
    subscription = ref.listenManual(placesCacheProvider, (previous, next) {
      print('📍 [MapPage] 预加载状态变化: hasData=${next.hasData}, isLoading=${next.isLoading}, error=${next.error}');
      if (next.hasData) {
        timeoutTimer?.cancel();
        subscription.close();
        _loadFromCache(next);
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

  /// 从缓存加载数据
  void _loadFromCache(PlacesCacheState cacheState) {
    final Map<String, List<Spot>> nextSpotsByCity = <String, List<Spot>>{};
    
    for (final entry in cacheState.placesByCity.entries) {
      final spots = _selectTopSpotsForCity(entry.key, entry.value);
      if (spots.isNotEmpty) {
        nextSpotsByCity[entry.key] = spots;
        if (!_cityCoordinates.containsKey(entry.key)) {
          _cityCoordinates[entry.key] = Position(
            spots.first.longitude,
            spots.first.latitude,
          );
        }
      }
    }

    if (!mounted) return;

    final citiesWithSpots = nextSpotsByCity.keys.toList()..sort();
    final resolvedCity = _resolveCitySelection(nextSpotsByCity, citiesWithSpots);
    
    // 默认态不选中任何地点
    final Spot? resolvedSpot;
    final List<Spot> nearby;
    if (_isFullscreen) {
      resolvedSpot = _resolveSelectedSpot(resolvedCity, nextSpotsByCity, _selectedSpot);
      nearby = resolvedSpot != null
          ? _computeNearbySpots(resolvedSpot, baseSpots: nextSpotsByCity[resolvedCity])
          : const <Spot>[];
    } else {
      resolvedSpot = null;
      nearby = const <Spot>[];
    }
    
    final targetCenter = _cityPosition(resolvedCity);

    setState(() {
      _availableCities = citiesWithSpots;
      _spotsByCity = nextSpotsByCity;
      _selectedCity = resolvedCity;
      _selectedSpot = resolvedSpot;
      _carouselSpots = nearby;
      _currentCardIndex = 0;
      _currentMapCenter = targetCenter;
      _isLoadingSpots = false;
      _loadingError = null;
    });

    _updateMapPosition(targetCenter, resolvedSpot);
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
          // Calculate city center from the first spot
          if (!_cityCoordinates.containsKey(city)) {
            _cityCoordinates[city] = Position(
              spots.first.longitude,
              spots.first.latitude,
            );
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

    // Only include cities that have spots, sorted alphabetically
    final citiesWithSpots = cities
        .where((city) => (nextSpotsByCity[city] ?? const <Spot>[]).isNotEmpty)
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
    
    final targetCenter = _cityPosition(resolvedCity);

    setState(() {
      _availableCities = citiesWithSpots;
      _spotsByCity = nextSpotsByCity;
      _selectedCity = resolvedCity;
      _selectedSpot = resolvedSpot;
      _carouselSpots = nearby;
      _currentCardIndex = 0;
      _currentMapCenter = targetCenter;
      _isLoadingSpots = false;
      _loadingError = firstError;
    });

    _updateMapPosition(targetCenter, _selectedSpot);
  }

  void _updateMapPosition(Position targetCenter, [Spot? spot]) async {
    final mapState = _mapKey.currentState;
    if (mapState != null) {
      await mapState.jumpToPosition(
        targetCenter,
        zoom: spot != null
            ? math.max(_currentZoom, 14.0)
            : _collapsedMapZoom,
      );
    } else {
      _jumpToCollapsedViewport(targetCenter);
    }
  }

  String _resolveCitySelection(
    Map<String, List<Spot>> nextSpotsByCity,
    List<String> citiesWithSpots,
  ) {
    // If we have a previously selected city that still has spots, keep it
    if (_selectedCity.isNotEmpty &&
        (nextSpotsByCity[_selectedCity] ?? const <Spot>[]).isNotEmpty) {
      return _selectedCity;
    }
    
    // 尝试使用缓存中保存的上次选择的城市
    final cacheState = ref.read(placesCacheProvider);
    final lastSelectedCity = cacheState.lastSelectedCity;
    if (lastSelectedCity != null &&
        lastSelectedCity.isNotEmpty &&
        (nextSpotsByCity[lastSelectedCity] ?? const <Spot>[]).isNotEmpty) {
      return lastSelectedCity;
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

    final tags = place.aiTags.isNotEmpty
        ? place.aiTags
        : <String>[place.category ?? 'Hidden Gem'];

    return Spot(
      id: place.placeId,
      name: place.name,
      city: (place.city ?? '').isNotEmpty ? place.city! : fallbackCity,
      category: (place.category ?? '').isNotEmpty
          ? place.category!
          : 'Point of Interest',
      latitude: place.latitude,
      longitude: place.longitude,
      rating: place.rating ?? 4.0,
      ratingCount: place.ratingCount ?? 0,
      coverImage: images.isNotEmpty ? images.first : _fallbackCoverImage,
      images: images.isNotEmpty ? images : <String>[_fallbackCoverImage],
      tags: tags,
      aiSummary: place.aiSummary ?? place.aiDescription,
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
  final ValueChanged<String> onCityChanged;

  @override
  ConsumerState<_CitySelector> createState() => _CitySelectorState();
}

class _CitySelectorState extends ConsumerState<_CitySelector> {
  @override
  Widget build(BuildContext context) => GestureDetector(
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
                widget.selectedCity,
                style: AppTheme.labelLarge(context),
              ),
              const SizedBox(width: 4),
              const Icon(Icons.keyboard_arrow_down, size: 20),
            ],
          ),
        ),
      );

  void _showCityPicker(BuildContext context) {
    // 获取国家城市数据
    final countriesCitiesState = ref.read(countriesCitiesProvider);
    final notifier = ref.read(countriesCitiesProvider.notifier);
    
    // 如果数据还没加载，先加载
    if (!notifier.isLoaded) {
      notifier.preload();
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
        countriesCities: countriesCitiesState,
        allCities: widget.cities,
        onCitySelected: (city) {
          Navigator.pop(sheetContext); // 先关闭半层
          widget.onCityChanged(city);  // 再触发回调
        },
      ),
    );
  }
}

/// 国家城市选择器底部弹窗
class _CountryCityPickerSheet extends StatefulWidget {
  const _CountryCityPickerSheet({
    required this.selectedCity,
    required this.countriesCities,
    required this.allCities,
    required this.onCitySelected,
  });

  final String selectedCity;
  final Map<String, List<String>> countriesCities;
  final List<String> allCities;
  final ValueChanged<String> onCitySelected;

  @override
  State<_CountryCityPickerSheet> createState() => _CountryCityPickerSheetState();
}

class _CountryCityPickerSheetState extends State<_CountryCityPickerSheet> {
  String? _selectedCountry;
  
  @override
  void initState() {
    super.initState();
    // 根据当前选中的城市找到对应的国家
    _selectedCountry = _findCountryForCity(widget.selectedCity);
  }
  
  String? _findCountryForCity(String city) {
    for (final entry in widget.countriesCities.entries) {
      if (entry.value.contains(city)) {
        return entry.key;
      }
    }
    return widget.countriesCities.keys.isNotEmpty 
        ? widget.countriesCities.keys.first 
        : null;
  }
  
  List<String> get _countries => widget.countriesCities.keys.toList()..sort();
  
  List<String> get _citiesForSelectedCountry {
    if (_selectedCountry == null) return widget.allCities;
    return widget.countriesCities[_selectedCountry] ?? [];
  }

  @override
  Widget build(BuildContext context) {
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
              child: widget.countriesCities.isEmpty
                  ? _buildSimpleCityList(scrollController)
                  : _buildCountryCityColumns(scrollController),
            ),
          ],
        ),
      ),
    );
  }
  
  /// 简单城市列表（没有国家数据时使用）
  Widget _buildSimpleCityList(ScrollController scrollController) {
    return ListView.builder(
      controller: scrollController,
      itemCount: widget.allCities.length,
      itemBuilder: (context, index) {
        final city = widget.allCities[index];
        return ListTile(
          title: Text(city, style: AppTheme.bodyLarge(context)),
          trailing: city == widget.selectedCity
              ? const Icon(Icons.check, color: AppTheme.primaryYellow)
              : null,
          onTap: () => widget.onCitySelected(city),
        );
      },
    );
  }
  
  /// 国家城市两列选择
  Widget _buildCountryCityColumns(ScrollController scrollController) {
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
              itemCount: _countries.length,
              itemBuilder: (context, index) {
                final country = _countries[index];
                final isSelected = country == _selectedCountry;
                return GestureDetector(
                  onTap: () {
                    setState(() {
                      _selectedCountry = country;
                    });
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                    color: isSelected ? AppTheme.primaryYellow.withOpacity(0.2) : Colors.transparent,
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            country,
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
            itemCount: _citiesForSelectedCountry.length,
            itemBuilder: (context, index) {
              final city = _citiesForSelectedCountry[index];
              final isSelected = city == widget.selectedCity;
              return ListTile(
                title: Text(
                  city,
                  style: AppTheme.bodyLarge(context).copyWith(
                    fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                  ),
                ),
                trailing: isSelected
                    ? const Icon(Icons.check, color: AppTheme.primaryYellow)
                    : null,
                onTap: () => widget.onCitySelected(city),
              );
            },
          ),
        ),
      ],
    );
  }
}

/// 底部地点卡片组件 - 全图+渐变覆盖样式（无收藏按钮，收藏在详情页）
class _BottomSpotCard extends StatelessWidget {
  const _BottomSpotCard({
    required this.spot,
    required this.onTap,
  });

  final Spot spot;
  final VoidCallback onTap;

  /// Build image widget that handles both data URIs and network URLs
  Widget _buildCover() {
    final placeholder = ColoredBox(
      color: AppTheme.lightGray,
      child: const Icon(
        Icons.place,
        size: 52,
        color: AppTheme.mediumGray,
      ),
    );

    if (spot.coverImage.isEmpty) return placeholder;

    // Handle data URI format (data:image/jpeg;base64,...)
    if (spot.coverImage.startsWith('data:')) {
      try {
        final base64Data = spot.coverImage.split(',').last;
        final bytes = base64Decode(base64Data);
        return Image.memory(
          bytes,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => placeholder,
        );
      } catch (e) {
        return placeholder;
      }
    }
    // Handle regular network URLs
    return Image.network(
      spot.coverImage,
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => placeholder,
    );
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
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
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
      ref.invalidate(tripsProvider);
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
      ref.invalidate(tripsProvider);
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
