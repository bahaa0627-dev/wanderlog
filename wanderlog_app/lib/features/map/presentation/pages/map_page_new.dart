import 'dart:async';
import 'dart:io' show File;
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' as picker;
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/map/data/models/public_place_dto.dart';
import 'package:wanderlog/features/map/data/public_place_repository.dart';
import 'package:wanderlog/features/map/data/sample_public_places.dart';
import 'package:wanderlog/features/map/presentation/widgets/mapbox_spot_map.dart';
import 'package:wanderlog/features/map/providers/public_place_providers.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';

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
  });

  final bool startFullscreen;
  final MapPageSnapshot? initialSnapshot;
  final Spot? initialSpotOverride;
  final ValueChanged<MapPageSnapshot>? onExitFullscreen;
  final ValueChanged<bool>? onFullscreenChanged;

  @override
  ConsumerState<MapPage> createState() => _MapPageState();
}

class _MapPageState extends ConsumerState<MapPage> {
  static const String _mapHeroTag = 'map-page-map-hero';
  static const double _nonFullscreenTopInset = 0.0;
  static const double _collapsedMapZoom = 13.0;
  static const int _spotsPerCityLimit = 10;
  static const int _minCategoriesPerCity = 3;
  static const String _fallbackCoverImage =
      'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80';
  static const List<String> _cityOrder = [
    'Chiang Mai',
    'Copenhagen',
    'Sapporo',
    'Tokyo',
  ];

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
  bool _isLoadingSpots = false;
  String? _loadingError;

  final Map<String, Position> _cityCoordinates = {
    'Chiang Mai': Position(98.9853, 18.7883),
    'Copenhagen': Position(12.5683, 55.6761),
    'Sapporo': Position(141.3545, 43.0621),
    'Tokyo': Position(139.6503, 35.6762),
  };

  @override
  void initState() {
    super.initState();
    _isOverlayInstance = widget.onExitFullscreen != null;
    _isFullscreen = widget.startFullscreen;
    _selectedCity = widget.initialSnapshot?.selectedCity ?? _cityOrder.first;
    _selectedSpot = widget.initialSnapshot?.selectedSpot;
    _selectedTags.addAll(widget.initialSnapshot?.selectedTags ?? <String>{});
    _currentMapCenter =
        widget.initialSnapshot?.currentCenter ?? _cityPosition(_selectedCity);
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
      viewportFraction: 0.85,
      initialPage: _currentCardIndex,
    );

    _loadPublicPlaces();
  }

  @override
  void dispose() {
    _cardPageController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  List<String> get _cities => _cityOrder;

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
    _animateCamera(
      Position(spot.longitude, spot.latitude),
      zoom: math.max(_currentZoom, 14.0),
    );

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
      _cityCoordinates[city] ?? _cityCoordinates[_cityOrder.first]!;

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

    return sorted.take(5).toList();
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
        _cityCoordinates[_selectedCity] ?? _cityCoordinates[_cityOrder.first]!;
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
                  height: 240,
                  child: PageView.builder(
                    controller: _cardPageController,
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
      builder: (context) => SpotDetailModal(spot: spot),
    );
  }

  Future<void> _loadPublicPlaces() async {
    setState(() {
      _isLoadingSpots = true;
      _loadingError = null;
    });

    final repository = ref.read(publicPlaceRepositoryProvider);
    final Map<String, List<Spot>> nextSpotsByCity = <String, List<Spot>>{};
    String? firstError;

    for (final city in _cityOrder) {
      try {
        final places = await repository.fetchPlacesByCity(
          city: city,
          limit: 200,
          minRating: 4.0,
        );
        nextSpotsByCity[city] = _selectTopSpotsForCity(city, places);
      } on PublicPlaceRepositoryException catch (error) {
        firstError ??= error.message;
        nextSpotsByCity[city] = _loadFallbackSpots(city);
      } catch (error) {
        firstError ??= error.toString();
        nextSpotsByCity[city] = _loadFallbackSpots(city);
      }
    }

    if (!mounted) {
      return;
    }

    final resolvedCity = _resolveCitySelection(nextSpotsByCity);
    final resolvedSpot = _resolveSelectedSpot(
      resolvedCity,
      nextSpotsByCity,
      _selectedSpot,
    );
    final nearby = resolvedSpot != null
        ? _computeNearbySpots(
            resolvedSpot,
            baseSpots: nextSpotsByCity[resolvedCity],
          )
        : const <Spot>[];
    final targetCenter = resolvedSpot != null
        ? Position(resolvedSpot.longitude, resolvedSpot.latitude)
        : _cityPosition(resolvedCity);

    setState(() {
      _spotsByCity = nextSpotsByCity;
      _selectedCity = resolvedCity;
      _selectedSpot = resolvedSpot;
      _carouselSpots = nearby;
      _currentCardIndex = 0;
      _currentMapCenter = targetCenter;
      _isLoadingSpots = false;
      _loadingError = firstError;
    });

    final mapState = _mapKey.currentState;
    if (mapState != null) {
      await mapState.jumpToPosition(
        targetCenter,
        zoom: resolvedSpot != null
            ? math.max(_currentZoom, 14.0)
            : _collapsedMapZoom,
      );
    } else {
      _jumpToCollapsedViewport(targetCenter);
    }
  }

  // Provides curated sample spots so the UI stays functional offline.
  List<Spot> _loadFallbackSpots(String city) {
    final fallback = samplePublicPlacesByCity[city];
    if (fallback == null || fallback.isEmpty) {
      return const <Spot>[];
    }
    return _selectTopSpotsForCity(city, fallback);
  }

  String _resolveCitySelection(Map<String, List<Spot>> nextSpotsByCity) {
    if ((nextSpotsByCity[_selectedCity] ?? const <Spot>[]).isNotEmpty) {
      return _selectedCity;
    }
    for (final city in _cityOrder) {
      if ((nextSpotsByCity[city] ?? const <Spot>[]).isNotEmpty) {
        return city;
      }
    }
    return _selectedCity;
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
      tags: tags.take(4).toList(),
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
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.06),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
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
                selectedCity,
                style: AppTheme.labelLarge(context),
              ),
              const SizedBox(width: 4),
              const Icon(Icons.keyboard_arrow_down, size: 20),
            ],
          ),
        ),
      );

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
            ...cities.map(
              (city) => ListTile(
                title: Text(city, style: AppTheme.bodyLarge(context)),
                trailing: city == selectedCity
                    ? const Icon(Icons.check, color: AppTheme.primaryYellow)
                    : null,
                onTap: () {
                  onCityChanged(city);
                  Navigator.pop(context);
                },
              ),
            ),
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
          child: SizedBox(
            width: 180,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ClipRRect(
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(AppTheme.radiusMedium - 1),
                  ),
                  child: Image.network(
                    spot.coverImage,
                    height: 135,
                    width: double.infinity,
                    fit: BoxFit.cover,
                  ),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Wrap(
                          spacing: 6,
                          children: spot.tags
                              .take(2)
                              .map(
                                (tag) => Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 4,
                                  ),
                                  decoration: BoxDecoration(
                                    color:
                                        AppTheme.primaryYellow.withOpacity(0.3),
                                    borderRadius: BorderRadius.circular(
                                      AppTheme.radiusSmall,
                                    ),
                                    border: Border.all(
                                      color: AppTheme.black,
                                      width: 0.5,
                                    ),
                                  ),
                                  child: Text(
                                    tag,
                                    style: AppTheme.labelSmall(context),
                                  ),
                                ),
                              )
                              .toList(),
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
                            const Icon(
                              Icons.star,
                              color: AppTheme.primaryYellow,
                              size: 16,
                            ),
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
        ),
      );
}

class SpotDetailModal extends StatefulWidget {
  const SpotDetailModal({required this.spot, super.key});

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
                  child: PageView.builder(
                    controller: _imagePageController,
                    onPageChanged: (index) {
                      setState(() {
                        _currentImageIndex = index;
                      });
                    },
                    itemCount: widget.spot.images.length,
                    itemBuilder: (context, index) => Container(
                      decoration: BoxDecoration(
                        borderRadius: const BorderRadius.vertical(
                          top: Radius.circular(24),
                        ),
                        image: DecorationImage(
                          image: NetworkImage(widget.spot.images[index]),
                          fit: BoxFit.cover,
                        ),
                      ),
                    ),
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
                      children: widget.spot.tags
                          .take(4)
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
                    SizedBox(
                      width: double.infinity,
                      child: PrimaryButton(
                        text: 'Add to Wishlist',
                        onPressed: () {
                          Navigator.pop(context);
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(
                                '${widget.spot.name} added to wishlist!',
                              ),
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
