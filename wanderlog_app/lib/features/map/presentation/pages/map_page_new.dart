import 'dart:async';
import 'dart:io' show File;
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' as picker;
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/map/presentation/widgets/mapbox_spot_map.dart';
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
  static const List<String> _cityOrder = [
    'Copenhagen',
    'Berlin',
    'Porto',
    'Paris',
    'Tokyo',
    'Barcelona',
    'Amsterdam',
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

  late final Map<String, List<Spot>> _spotsByCity;

  final Map<String, Position> _cityCoordinates = {
    'Copenhagen': Position(12.5683, 55.6761),
    'Berlin': Position(13.4050, 52.5200),
    'Porto': Position(-8.6291, 41.1579),
    'Paris': Position(2.3522, 48.8566),
    'Tokyo': Position(139.6503, 35.6762),
    'Barcelona': Position(2.1686, 41.3874),
    'Amsterdam': Position(4.9041, 52.3676),
  };

  @override
  void initState() {
    super.initState();
    _spotsByCity = _buildMockSpots();
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

    if (result == null) {
      return;
    }

    await _restoreFromSnapshot(result);
  }

  Position _cityPosition(String city) =>
      _cityCoordinates[city] ?? _cityCoordinates[_cityOrder.first]!;

  List<Spot> _computeNearbySpots(Spot anchor) {
    final spots = _filteredSpots;
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

  @override
  Widget build(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    final topPadding = mediaQuery.padding.top;
    final borderRadius = BorderRadius.circular(
      _isFullscreen ? 0 : AppTheme.radiusMedium,
    );

    final carouselSpots = _carouselSpots;
    final cityFallback =
        _cityCoordinates[_selectedCity] ?? _cityCoordinates[_cityOrder.first]!;
    const double controlsHorizontalPadding = 16.0;
    final mapSurface = _MapSurface(
      borderRadius: borderRadius,
      isFullscreen: _isFullscreen,
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
              top: _isFullscreen ? 0 : _nonFullscreenTopInset,
              left: _isFullscreen ? 0 : 16,
              right: _isFullscreen ? 0 : 16,
              bottom: _isFullscreen ? 0 : 16,
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
                    padding: EdgeInsets.symmetric(
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
              'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1451153378752-16ef2b36ad05?auto=format&fit=crop&w=1200&q=80',
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
              'https://images.unsplash.com/photo-1529429617124-aee1e8fa5d14?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1529429617124-aee1e8fa5d14?auto=format&fit=crop&w=1200&q=80',
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
              'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1475264673458-81b48b834667?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Architecture', 'History'],
            aiSummary:
                '17th-century astronomical observatory with a spiraling ramp and sweeping city views.',
          ),
        ],
        'Berlin': [
          Spot(
            id: 'berlin-brandenburg',
            name: 'Brandenburg Gate',
            city: 'Berlin',
            category: 'Landmark',
            latitude: 52.5163,
            longitude: 13.3777,
            rating: 4.7,
            ratingCount: 5124,
            coverImage:
                'https://images.unsplash.com/photo-1562619421-e3f3a0c0c5c7?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1562619421-e3f3a0c0c5c7?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1604754742629-3bdb6df56a58?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1446160657592-4782fb76fb99?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Architecture', 'History'],
            aiSummary:
                'Iconic neoclassical gate symbolizing Berlin’s reunification with a grand city square.',
          ),
          Spot(
            id: 'berlin-museum-island',
            name: 'Museum Island',
            city: 'Berlin',
            category: 'Museum',
            latitude: 52.5169,
            longitude: 13.4010,
            rating: 4.8,
            ratingCount: 2984,
            coverImage:
                'https://images.unsplash.com/photo-1507668077129-56e32842fceb?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1507668077129-56e32842fceb?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1530023367847-a683933f4177?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1543780217-f600fcec90cd?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Museum', 'History', 'Architecture'],
            aiSummary:
                'UNESCO-listed ensemble of five world-class museums on the Spree River.',
          ),
          Spot(
            id: 'berlin-coffee',
            name: 'Kreuzberg Coffee Lab',
            city: 'Berlin',
            category: 'Coffee',
            latitude: 52.4986,
            longitude: 13.4034,
            rating: 4.5,
            ratingCount: 947,
            coverImage:
                'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1529078155058-5d716f45d604?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1534040385115-33dcb3acba5e?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Coffee', 'Food'],
            aiSummary:
                'Third-wave coffee bar roasting beans on site with minimalist interiors and local pastry pairings.',
          ),
        ],
        'Porto': [
          Spot(
            id: 'porto-livraria',
            name: 'Livraria Lello',
            city: 'Porto',
            category: 'Bookstore',
            latitude: 41.1472,
            longitude: -8.6140,
            rating: 4.7,
            ratingCount: 2651,
            coverImage:
                'https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['History', 'Architecture'],
            aiSummary:
                'Neo-Gothic bookstore famed for its sculpted staircase and literary inspirations.',
          ),
          Spot(
            id: 'porto-bridge',
            name: 'Dom Luís I Bridge',
            city: 'Porto',
            category: 'Landmark',
            latitude: 41.1408,
            longitude: -8.6110,
            rating: 4.8,
            ratingCount: 4122,
            coverImage:
                'https://images.unsplash.com/photo-1555448248-2571daf6344b?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1555448248-2571daf6344b?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1518860308377-3978c859c423?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1531254725343-18b640be11d9?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Architecture', 'History'],
            aiSummary:
                'Double-deck metal arch bridge connecting Porto and Vila Nova de Gaia over the Douro River.',
          ),
          Spot(
            id: 'porto-clerigos',
            name: 'Clérigos Tower',
            city: 'Porto',
            category: 'Landmark',
            latitude: 41.1456,
            longitude: -8.6148,
            rating: 4.6,
            ratingCount: 1788,
            coverImage:
                'https://images.unsplash.com/photo-1507048331197-7d4ac70811cf?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1507048331197-7d4ac70811cf?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1534219620024-7a4f61b06abb?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1528901166007-3784c7dd3653?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Architecture', 'History'],
            aiSummary:
                'Baroque bell tower offering panoramic views after a climb up its historic staircase.',
          ),
        ],
        'Paris': [
          Spot(
            id: 'paris-louvre',
            name: 'Louvre Museum',
            city: 'Paris',
            category: 'Museum',
            latitude: 48.8606,
            longitude: 2.3376,
            rating: 4.8,
            ratingCount: 6215,
            coverImage:
                'https://images.unsplash.com/photo-1523731407965-2430cd12f5e4?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1523731407965-2430cd12f5e4?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Museum', 'History', 'Architecture'],
            aiSummary:
                'World-renowned museum housing masterpieces like the Mona Lisa inside a glass pyramid entrance.',
          ),
          Spot(
            id: 'paris-cafedeflore',
            name: 'Café de Flore',
            city: 'Paris',
            category: 'Cafe',
            latitude: 48.8553,
            longitude: 2.3332,
            rating: 4.5,
            ratingCount: 2599,
            coverImage:
                'https://images.unsplash.com/photo-1543342386-1bb0e29017c4?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1543342386-1bb0e29017c4?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1529429617124-aee1e8fa5d14?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Food', 'Coffee', 'History'],
            aiSummary:
                'Historic Left Bank cafe famous for literary patrons, classic French fare, and polished service.',
          ),
          Spot(
            id: 'paris-notredame',
            name: 'Notre-Dame Cathedral',
            city: 'Paris',
            category: 'Landmark',
            latitude: 48.8530,
            longitude: 2.3499,
            rating: 4.7,
            ratingCount: 5412,
            coverImage:
                'https://images.unsplash.com/photo-1471623320832-752e2aa2d08b?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1471623320832-752e2aa2d08b?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1528909514045-2fa4ac7a08ba?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1529429617124-aee1e8fa5d14?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['History', 'Architecture'],
            aiSummary:
                'Gothic cathedral celebrated for its stained glass, flying buttresses, and iconic twin towers.',
          ),
        ],
        'Tokyo': [
          Spot(
            id: 'tokyo-sensoji',
            name: 'Sensō-ji Temple',
            city: 'Tokyo',
            category: 'Temple',
            latitude: 35.7148,
            longitude: 139.7967,
            rating: 4.8,
            ratingCount: 4985,
            coverImage:
                'https://images.unsplash.com/photo-1581804928342-4e3405e39c91?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1581804928342-4e3405e39c91?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1539185441755-769473a23570?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['History', 'Architecture', 'Culture'],
            aiSummary:
                'Tokyo’s oldest Buddhist temple with vibrant gates, incense rituals, and Nakamise shopping street.',
          ),
          Spot(
            id: 'tokyo-teamlab',
            name: 'teamLab Planets',
            city: 'Tokyo',
            category: 'Museum',
            latitude: 35.6457,
            longitude: 139.7847,
            rating: 4.7,
            ratingCount: 2674,
            coverImage:
                'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Museum', 'Nature'],
            aiSummary:
                'Immersive digital art experience where visitors walk through water and responsive light installations.',
          ),
          Spot(
            id: 'tokyo-tsukiji',
            name: 'Tsukiji Outer Market',
            city: 'Tokyo',
            category: 'Market',
            latitude: 35.6655,
            longitude: 139.7708,
            rating: 4.6,
            ratingCount: 3894,
            coverImage:
                'https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Food', 'Culture'],
            aiSummary:
                'Bustling seafood market with street-side sushi, produce vendors, and kitchenware boutiques.',
          ),
        ],
        'Barcelona': [
          Spot(
            id: 'barcelona-sagrada',
            name: 'Sagrada Família',
            city: 'Barcelona',
            category: 'Landmark',
            latitude: 41.4036,
            longitude: 2.1744,
            rating: 4.8,
            ratingCount: 6376,
            coverImage:
                'https://images.unsplash.com/photo-1523475472560-d2df97ec485c?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1523475472560-d2df97ec485c?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1529429617124-aee1e8fa5d14?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Architecture', 'History'],
            aiSummary:
                'Gaudí’s unfinished basilica blending Gothic and Art Nouveau with soaring spires and organic forms.',
          ),
          Spot(
            id: 'barcelona-parkguell',
            name: 'Park Güell',
            city: 'Barcelona',
            category: 'Park',
            latitude: 41.4145,
            longitude: 2.1527,
            rating: 4.7,
            ratingCount: 4211,
            coverImage:
                'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1526481280695-3c469d3b0835?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Nature', 'Architecture'],
            aiSummary:
                'Whimsical park with mosaic benches, serpent fountains, and panoramic views of Barcelona.',
          ),
          Spot(
            id: 'barcelona-boqueria',
            name: 'La Boqueria Market',
            city: 'Barcelona',
            category: 'Market',
            latitude: 41.3826,
            longitude: 2.1722,
            rating: 4.6,
            ratingCount: 3524,
            coverImage:
                'https://images.unsplash.com/photo-1584305574647-0ada08d59c11?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1584305574647-0ada08d59c11?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1523475472560-d2df97ec485c?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Food', 'Culture'],
            aiSummary:
                'Historic covered market brimming with fresh seafood, Iberian delicacies, and tapas bars.',
          ),
        ],
        'Amsterdam': [
          Spot(
            id: 'ams-rijksmuseum',
            name: 'Rijksmuseum',
            city: 'Amsterdam',
            category: 'Museum',
            latitude: 52.3600,
            longitude: 4.8852,
            rating: 4.8,
            ratingCount: 4891,
            coverImage:
                'https://images.unsplash.com/photo-1504977402025-6b7a5bca8151?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1504977402025-6b7a5bca8151?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1529429617124-aee1e8fa5d14?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Museum', 'History', 'Architecture'],
            aiSummary:
                'Dutch national museum showcasing masterpieces by Rembrandt and Vermeer in a monumental building.',
          ),
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
              'https://images.unsplash.com/photo-1470137430626-983a37b8ea46?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['History', 'Museum'],
            aiSummary:
                'House and museum preserving the wartime hiding place of Anne Frank with poignant exhibits.',
          ),
          Spot(
            id: 'ams-vondelpark',
            name: 'Vondelpark',
            city: 'Amsterdam',
            category: 'Park',
            latitude: 52.3584,
            longitude: 4.8686,
            rating: 4.7,
            ratingCount: 4185,
            coverImage:
                'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=1200&q=80',
              'https://images.unsplash.com/photo-1455906876003-298dd8c44dd9?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Nature', 'History'],
            aiSummary:
                'Expansive urban park with lakes, bike paths, open-air theatre, and shaded lawns popular with locals.',
          ),
        ],
      };
}

class _MapSurface extends StatelessWidget {
  const _MapSurface({
    required this.borderRadius,
    required this.isFullscreen,
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
  final bool isFullscreen;
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
        duration:
            animateTransitions ? const Duration(milliseconds: 350) : Duration.zero,
        curve: Curves.easeInOut,
        decoration: isFullscreen
            ? const BoxDecoration()
            : BoxDecoration(
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
              ),
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
                              .map((tag) => Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 8, vertical: 4,),
                                    decoration: BoxDecoration(
                                      color: AppTheme.primaryYellow
                                          .withOpacity(0.3),
                                      borderRadius: BorderRadius.circular(
                                          AppTheme.radiusSmall,),
                                      border: Border.all(
                                        color: AppTheme.black,
                                        width: 0.5,
                                      ),
                                    ),
                                    child: Text(
                                      tag,
                                      style: AppTheme.labelSmall(context),
                                    ),
                                  ),)
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
                          .map((tag) => Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 12, vertical: 6,),
                                decoration: BoxDecoration(
                                  color:
                                      AppTheme.primaryYellow.withOpacity(0.3),
                                  borderRadius: BorderRadius.circular(
                                      AppTheme.radiusSmall,),
                                  border: Border.all(
                                    color: AppTheme.black,
                                    width: AppTheme.borderMedium,
                                  ),
                                ),
                                child: Text(tag,
                                    style: AppTheme.labelMedium(context),),
                              ),)
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
                                ),),
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
