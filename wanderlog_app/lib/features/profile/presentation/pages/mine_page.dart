import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:palette_generator/palette_generator.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/auth/presentation/pages/login_page.dart';
import 'package:wanderlog/features/profile/providers/mine_page_provider.dart';
import 'package:wanderlog/features/profile/presentation/widgets/settings_sheet.dart';
import 'package:wanderlog/features/profile/presentation/widgets/photo_wall.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart'
    as map_page;
import 'package:wanderlog/features/map/presentation/widgets/mapbox_spot_map.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/shared/models/trip_model.dart';
import 'package:wanderlog/shared/widgets/unified_spot_detail_modal.dart';
import 'package:wanderlog/features/ai_recognition/providers/wishlist_status_provider.dart';

/// Mine page - displays user's visited places and check-in photos
class MinePage extends ConsumerStatefulWidget {
  const MinePage({super.key});

  @override
  ConsumerState<MinePage> createState() => _MinePageState();
}

class _MinePageState extends ConsumerState<MinePage> {
  final ScrollController _scrollController = ScrollController();

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Check authentication status
    final authState = ref.watch(authProvider);

    // If not authenticated, show login page
    if (!authState.isAuthenticated) {
      return const Scaffold(
        backgroundColor: AppTheme.background,
        body: LoginPage(),
      );
    }

    final mineDataAsync = ref.watch(minePageDataProvider);

    return Scaffold(
      backgroundColor: AppTheme.background,
      body: mineDataAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(),
        ),
        error: (error, stack) {
          print('❌ [MinePage] Display error: $error');
          return SafeArea(
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline,
                      size: 48, color: AppTheme.error),
                  const SizedBox(height: 16),
                  Text(
                    'Failed to load data',
                    style: AppTheme.bodyMedium(context),
                  ),
                  const SizedBox(height: 8),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 32),
                    child: Text(
                      error.toString(),
                      style: AppTheme.bodySmall(context)
                          .copyWith(color: AppTheme.textSecondary),
                      textAlign: TextAlign.center,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextButton(
                    onPressed: () => ref.refresh(minePageDataProvider),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          );
        },
        data: (data) => SafeArea(
          child: _buildContent(context, data),
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context, MinePageData data) {
    // 调试：打印数据状态
    print('🎨 [MinePage] Building content with:');
    print('  - countries: ${data.countriesCount}, cities: ${data.citiesCount}');
    print('  - photos: ${data.photos.length}');
    print('  - markers: ${data.mapMarkers.length}');
    print('  - visitedSpots: ${data.visitedSpots.length}');

    return CustomScrollView(
      controller: _scrollController,
      slivers: [
        // Header
        SliverToBoxAdapter(
          child: _buildHeader(context),
        ),

        // Globe map section
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
            child: _GlobeMapSection(
              data: data,
              onExpandTap: () => _openFullscreenMap(context, data),
            ),
          ),
        ),

        // Photo wall section
        SliverToBoxAdapter(
          child: PhotoWall(
            photos: data.photos,
            topCategories: data.topCategories,
          ),
        ),

        // Bottom padding
        const SliverToBoxAdapter(
          child: SizedBox(height: 100),
        ),
      ],
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // Title
          Text(
            'Your flaneur',
            style: AppTheme.displayLarge(context).copyWith(
              fontSize: 32,
              fontWeight: FontWeight.w700,
            ),
          ),
          // Settings button - gear icon
          GestureDetector(
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (context) => const SettingsPage(),
                ),
              );
            },
            child: Container(
              padding: const EdgeInsets.all(8),
              child: const Icon(
                Icons.settings_outlined,
                size: 28,
                color: AppTheme.darkGray,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _openFullscreenMap(BuildContext context, MinePageData data) {
    // Convert visited spots to map_page.Spot format with cover images
    // Note: visitedSpots is already sorted by visitDate (newest first) in the provider
    final spots =
        data.visitedSpots.where((ts) => ts.spot != null).map((tripSpot) {
      final spot = tripSpot.spot!;
      // Get cover image from user photos or spot images
      String coverImage = '';
      if (tripSpot.userPhotos != null && tripSpot.userPhotos!.isNotEmpty) {
        coverImage = tripSpot.userPhotos!.first;
      } else if (spot.images.isNotEmpty) {
        coverImage = spot.images.first;
      }

      return map_page.Spot(
        id: spot.id,
        name: spot.name,
        city: spot.city ?? '',
        country: spot.country,
        category: spot.category ?? 'other',
        latitude: spot.latitude,
        longitude: spot.longitude,
        rating: spot.rating ?? 0,
        ratingCount: spot.ratingCount ?? 0,
        coverImage: coverImage,
        images: spot.images,
        tags: spot.tags,
        // Add detail page fields
        address: spot.address,
        phoneNumber: spot.phoneNumber,
        website: spot.website,
        openingHours: spot.openingHours,
      );
    }).toList();

    // Calculate center from all markers
    Position? center;
    double zoom = 3.0;

    if (data.mapMarkers.isNotEmpty) {
      double minLat = double.infinity;
      double maxLat = -double.infinity;
      double minLng = double.infinity;
      double maxLng = -double.infinity;

      for (final marker in data.mapMarkers) {
        minLat = math.min(minLat, marker.latitude);
        maxLat = math.max(maxLat, marker.latitude);
        minLng = math.min(minLng, marker.longitude);
        maxLng = math.max(maxLng, marker.longitude);
      }

      center = Position(
        (minLng + maxLng) / 2,
        (minLat + maxLat) / 2,
      );

      // Calculate appropriate zoom level based on bounds
      final latDiff = maxLat - minLat;
      final lngDiff = maxLng - minLng;
      final maxDiff = math.max(latDiff, lngDiff);

      if (maxDiff > 100) {
        zoom = 1.0;
      } else if (maxDiff > 50) {
        zoom = 2.0;
      } else if (maxDiff > 20) {
        zoom = 3.0;
      } else if (maxDiff > 10) {
        zoom = 4.0;
      } else if (maxDiff > 5) {
        zoom = 5.0;
      } else {
        zoom = 6.0;
      }
    }

    // Navigate to fullscreen map
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => _FullscreenVisitedMap(
          spots: spots,
          initialCenter: center ?? Position(0, 0),
          initialZoom: zoom,
        ),
      ),
    );
  }
}

/// Globe map preview section
class _GlobeMapSection extends StatefulWidget {
  const _GlobeMapSection({
    required this.data,
    required this.onExpandTap,
  });

  final MinePageData data;
  final VoidCallback onExpandTap;

  @override
  State<_GlobeMapSection> createState() => _GlobeMapSectionState();
}

class _GlobeMapSectionState extends State<_GlobeMapSection> {
  @override
  Widget build(BuildContext context) {
    // Convert visited spots to Spot list (limit to 10 most recent)
    print(
        '🗺️ [GlobeMap] Total visitedSpots: ${widget.data.visitedSpots.length}');
    print(
        '🗺️ [GlobeMap] Spots with place: ${widget.data.visitedSpots.where((ts) => ts.spot != null).length}');

    final previewSpots = widget.data.visitedSpots
        .where((ts) => ts.spot != null)
        .take(10)
        .map((tripSpot) {
      final spot = tripSpot.spot!;
      String coverImage = '';
      if (tripSpot.userPhotos != null && tripSpot.userPhotos!.isNotEmpty) {
        coverImage = tripSpot.userPhotos!.first;
      } else if (spot.images.isNotEmpty) {
        coverImage = spot.images.first;
      }

      print(
          '🗺️ [GlobeMap] Adding spot to previewSpots: ${spot.name} at (${spot.latitude}, ${spot.longitude})');

      return map_page.Spot(
        id: spot.id,
        name: spot.name,
        city: spot.city ?? '',
        country: spot.country,
        category: spot.category ?? 'other',
        latitude: spot.latitude,
        longitude: spot.longitude,
        rating: spot.rating ?? 0,
        ratingCount: spot.ratingCount ?? 0,
        coverImage: coverImage,
        images: spot.images,
        tags: spot.tags,
        // Add detail page fields
        address: spot.address,
        phoneNumber: spot.phoneNumber,
        website: spot.website,
        openingHours: spot.openingHours,
      );
    }).toList();

    print('🗺️ [GlobeMap] Preview spots count: ${previewSpots.length}');

    // Calculate center and zoom from preview spots (10 most recent)
    Position center = Position(10, 48); // Default: Europe
    double zoom = 3.0;

    if (previewSpots.isNotEmpty) {
      // Priority: center on the most recent check-in (first spot)
      final latestSpot = previewSpots.first;
      center = Position(latestSpot.longitude, latestSpot.latitude);

      // Calculate bounds from all preview spots for zoom
      double minLat = double.infinity;
      double maxLat = -double.infinity;
      double minLng = double.infinity;
      double maxLng = -double.infinity;

      for (final spot in previewSpots) {
        minLat = math.min(minLat, spot.latitude);
        maxLat = math.max(maxLat, spot.latitude);
        minLng = math.min(minLng, spot.longitude);
        maxLng = math.max(maxLng, spot.longitude);
      }

      // Calculate appropriate zoom level
      final latDiff = maxLat - minLat;
      final lngDiff = maxLng - minLng;
      final maxDiff = math.max(latDiff, lngDiff);

      print(
          '🗺️ [GlobeMap] Latest spot: ${latestSpot.name} at (${latestSpot.latitude}, ${latestSpot.longitude})');
      print(
          '🗺️ [GlobeMap] Bounds: lat=[$minLat, $maxLat] (diff=$latDiff), lng=[$minLng, $maxLng] (diff=$lngDiff)');

      if (maxDiff > 100) {
        zoom = 2.5; // 提高基础 zoom
      } else if (maxDiff > 50) {
        zoom = 3.5;
      } else if (maxDiff > 20) {
        zoom = 4.5;
      } else if (maxDiff > 10) {
        zoom = 5.0; // 提高以便看到更多标记
      } else if (maxDiff > 5) {
        zoom = 6.0;
      } else {
        zoom = 7.0;
      }

      print(
          '🗺️ [GlobeMap] Calculated center (latest spot): (${center.lng}, ${center.lat}), zoom: $zoom');
    }

    return Container(
      height: 220,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
        border: Border.all(
          color: AppTheme.black,
          width: AppTheme.borderMedium,
        ),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppTheme.radiusLarge - 2),
        child: GestureDetector(
          // 让地图的手势优先，不被外层拦截
          behavior: HitTestBehavior.opaque,
          onPanDown: (_) {}, // 占位，让手势传递到地图
          child: Stack(
            children: [
              // Map with check-in markers
              MapboxSpotMap(
                key: const ValueKey('mine-globe-map'),
                spots: previewSpots,
                initialCenter: center,
                initialZoom: zoom,
                selectedSpot: null,
                onSpotTap: (_) {},
                markerMode: MapboxMarkerMode.checkIn,
                onMapCreated: () {},
              ),

              // Top-left badge (countries & cities count) - Neo Brutalism style
              Positioned(
                top: 12,
                left: 12,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: AppTheme.white,
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(
                      color: AppTheme.black,
                      width: AppTheme.borderMedium,
                    ),
                    boxShadow: const [
                      BoxShadow(
                        color: AppTheme.black,
                        offset: Offset(2, 2),
                        blurRadius: 0,
                      ),
                    ],
                  ),
                  child: Text(
                    '${widget.data.countriesCount} countries, ${widget.data.citiesCount} cities',
                    style: AppTheme.labelSmall(context).copyWith(
                      fontWeight: FontWeight.w600,
                      color: AppTheme.black,
                      fontSize: 12,
                    ),
                  ),
                ),
              ),

              // Top-right expand button - circular, same height as left badge
              Positioned(
                top: 12,
                right: 12,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: widget.onExpandTap,
                  child: Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: AppTheme.white,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: AppTheme.black,
                        width: AppTheme.borderMedium,
                      ),
                      boxShadow: const [
                        BoxShadow(
                          color: AppTheme.black,
                          offset: Offset(2, 2),
                          blurRadius: 0,
                        ),
                      ],
                    ),
                    child: const Center(
                      child: Icon(
                        Icons.crop_free,
                        size: 18,
                        color: AppTheme.black,
                      ),
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

  // Marker rendering handled by MapboxSpotMap in check-in mode.
}

/// Fullscreen map page for visited spots
class _FullscreenVisitedMap extends ConsumerStatefulWidget {
  const _FullscreenVisitedMap({
    required this.spots,
    required this.initialCenter,
    required this.initialZoom,
  });

  final List<map_page.Spot> spots;
  final Position initialCenter;
  final double initialZoom;

  @override
  ConsumerState<_FullscreenVisitedMap> createState() => _FullscreenVisitedMapState();
}

class _FullscreenVisitedMapState extends ConsumerState<_FullscreenVisitedMap> {
  final GlobalKey<MapboxSpotMapState> _mapKey = GlobalKey<MapboxSpotMapState>();
  final TextEditingController _searchController = TextEditingController();
  late final PageController _carouselController;

  map_page.Spot? _selectedSpot;
  List<map_page.Spot> _filteredSpots = [];
  String? _selectedCity;
  String? _selectedCountry;
  final Set<String> _selectedTags = {};
  int _currentCardIndex = 0;
  bool _isExiting = false; // 标记是否正在退出

  // 防抖字段
  String? _lastClickedSpotId;
  DateTime? _lastClickTime;

  // Get dynamic tags from filtered spots
  List<String> get _dynamicTagOptions {
    final tagCounts = <String, int>{};
    for (final spot in _filteredSpots) {
      // Count category
      if (spot.category.isNotEmpty) {
        final cat = _capitalizeTag(spot.category);
        tagCounts[cat] = (tagCounts[cat] ?? 0) + 1;
      }
      // Count tags
      for (final tag in spot.tags) {
        if (tag.isNotEmpty && !_isInvalidTag(tag)) {
          final t = _capitalizeTag(tag);
          tagCounts[t] = (tagCounts[t] ?? 0) + 1;
        }
      }
    }
    // Sort by count and take top tags
    final sorted = tagCounts.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return sorted.take(10).map((e) => e.key).toList();
  }

  @override
  void initState() {
    super.initState();
    _carouselController = PageController(viewportFraction: 0.55);
    // widget.spots is already sorted by visitDate (newest first) from the provider
    _filteredSpots = List.from(widget.spots);
    _searchController.addListener(_onSearchChanged);
  }

  @override
  void dispose() {
    _searchController.dispose();
    _carouselController.dispose();
    super.dispose();
  }

  void _onSearchChanged() {
    _applyFilters();
  }

  void _applyFilters() {
    final query = _searchController.text.toLowerCase().trim();

    setState(() {
      _filteredSpots = widget.spots.where((spot) {
        // Search filter
        if (query.isNotEmpty) {
          if (!spot.name.toLowerCase().contains(query)) {
            return false;
          }
        }

        // City filter
        if (_selectedCity != null && _selectedCity != 'All') {
          if (spot.city != _selectedCity) {
            return false;
          }
        }

        // Country filter
        if (_selectedCountry != null && _selectedCountry != 'All') {
          if (spot.country != _selectedCountry) {
            return false;
          }
        }

        // Tag filter
        if (_selectedTags.isNotEmpty) {
          final spotTags = <String>{
            if (spot.category.isNotEmpty) _capitalizeTag(spot.category),
            ...spot.tags.map(_capitalizeTag),
          };
          if (!_selectedTags.any((tag) => spotTags.contains(tag))) {
            return false;
          }
        }

        return true;
      }).toList();

      _selectedSpot = _filteredSpots.isNotEmpty ? _filteredSpots.first : null;
      _currentCardIndex = 0;
    });

    // Jump to first card
    if (_carouselController.hasClients) {
      _carouselController.jumpToPage(0);
    }
  }

  void _toggleTag(String tag) {
    setState(() {
      if (_selectedTags.contains(tag)) {
        _selectedTags.remove(tag);
      } else {
        _selectedTags.clear();
        _selectedTags.add(tag);
      }
    });
    _applyFilters();
  }

  String _capitalizeTag(String tag) {
    final lower = tag.toLowerCase().trim();
    if (lower.isEmpty) return lower;
    return lower[0].toUpperCase() + lower.substring(1);
  }

  bool _isInvalidTag(String tag) {
    const invalidTags = {
      'point_of_interest',
      'establishment',
      'premise',
      'route',
      'street_address',
      'political',
      'locality',
      'sublocality',
    };
    return invalidTags.contains(tag.toLowerCase());
  }

  String _tagEmoji(String tag) {
    switch (tag.toLowerCase()) {
      case 'cafe':
      case 'coffee':
        return '☕';
      case 'restaurant':
      case 'food':
        return '🍽️';
      case 'museum':
        return '🏛️';
      case 'architecture':
        return '🏛️';
      case 'park':
      case 'nature':
        return '🌳';
      case 'bakery':
        return '🥐';
      case 'bar':
        return '🍸';
      case 'shop':
      case 'store':
        return '🛍️';
      case 'landmark':
        return '📍';
      case 'historical':
      case 'history':
        return '📜';
      default:
        return '📍';
    }
  }

  @override
  Widget build(BuildContext context) {
    final carouselSpots = _filteredSpots;

    return Scaffold(
      backgroundColor: AppTheme.background,
      body: Stack(
        children: [
          // Map - normal markers, not grayed out
          Positioned.fill(
            child: MapboxSpotMap(
              key: _mapKey,
              spots: carouselSpots,
              initialCenter: widget.initialCenter,
              initialZoom: widget.initialZoom,
              selectedSpot: _selectedSpot,
              onSpotTap: _onSpotTap,
              onMapCreated: () {},
            ),
          ),

          // Top controls
          Positioned(
            top: MediaQuery.of(context).padding.top + 12,
            left: 16,
            right: 16,
            child: Column(
              children: [
                // Back button + Search bar row
                Row(
                  children: [
                    // Back button
                    _NeoBrutalismIconButton(
                      icon: Icons.arrow_back,
                      onTap: () {
                        // 退出时立即隐藏 carousel，避免卡片露出
                        setState(() {
                          _isExiting = true;
                        });
                        // 重置 carousel 位置
                        if (_carouselController.hasClients) {
                          _carouselController.jumpToPage(0);
                        }
                        Navigator.of(context).pop();
                      },
                    ),
                    const SizedBox(width: 8),
                    // Search bar
                    Expanded(child: _buildSearchBar()),
                    const SizedBox(width: 8),
                    // City dropdown
                    _buildCityDropdown(),
                  ],
                ),
                const SizedBox(height: 10),
                // Tag bar
                _buildTagBar(),
              ],
            ),
          ),

          // Bottom carousel - vertical cards matching map page style
          // 退出时隐藏 carousel，避免卡片露出
          if (carouselSpots.isNotEmpty && !_isExiting)
            Positioned(
              bottom: 32,
              left: 0,
              right: 0,
              height: 280,
              child: PageView.builder(
                controller: _carouselController,
                clipBehavior: Clip.none,
                onPageChanged: (index) {
                  if (index >= carouselSpots.length) return;
                  final spot = carouselSpots[index];
                  setState(() {
                    _currentCardIndex = index;
                    _selectedSpot = spot;
                  });
                  _mapKey.currentState?.jumpToPosition(
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
                        height: 280,
                        child: _VerticalSpotCard(
                          spot: spot,
                          onTap: () => _onSpotTap(spot),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),

          // Empty state
          if (carouselSpots.isEmpty)
            Positioned(
              bottom: 100,
              left: 32,
              right: 32,
              child: Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: AppTheme.white,
                  borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                  border: Border.all(color: AppTheme.black, width: 2),
                ),
                child: Text(
                  'No spots match your filters',
                  style: AppTheme.bodyMedium(context),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildSearchBar() {
    return Container(
      height: 44,
      decoration: BoxDecoration(
        color: AppTheme.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: AppTheme.black, width: AppTheme.borderMedium),
        boxShadow: AppTheme.searchBoxShadow,
      ),
      child: Row(
        children: [
          const SizedBox(width: 14),
          const Icon(Icons.search, size: 20, color: AppTheme.mediumGray),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: _searchController,
              style: AppTheme.bodyMedium(context),
              decoration: InputDecoration(
                hintText: 'Search places',
                hintStyle: AppTheme.bodySmall(context).copyWith(
                  color: AppTheme.mediumGray,
                ),
                border: InputBorder.none,
                contentPadding: EdgeInsets.zero,
                isDense: true,
              ),
            ),
          ),
          if (_searchController.text.isNotEmpty)
            GestureDetector(
              onTap: () {
                _searchController.clear();
              },
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 8),
                child: Icon(Icons.close, size: 18, color: AppTheme.mediumGray),
              ),
            ),
          const SizedBox(width: 8),
        ],
      ),
    );
  }

  Widget _buildCityDropdown() {
    final displayText = _selectedCity ?? 'All';
    return GestureDetector(
      onTap: () => _showCityPicker(),
      child: Container(
        height: 44,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: BoxDecoration(
          color: AppTheme.white,
          borderRadius: BorderRadius.circular(22),
          border:
              Border.all(color: AppTheme.black, width: AppTheme.borderMedium),
          boxShadow: AppTheme.searchBoxShadow,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              displayText,
              style: AppTheme.bodyMedium(context).copyWith(
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(width: 4),
            const Icon(Icons.arrow_drop_down, size: 20, color: AppTheme.black),
          ],
        ),
      ),
    );
  }

  void _showCityPicker() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppTheme.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => _CityPickerSheet(
        spots: widget.spots,
        selectedCity: _selectedCity,
        selectedCountry: _selectedCountry,
        onSelected: (country, city) {
          setState(() {
            _selectedCountry = country;
            _selectedCity = city;
          });
          _applyFilters();
        },
      ),
    );
  }

  Widget _buildTagBar() {
    final tags = _dynamicTagOptions;
    if (tags.isEmpty) return const SizedBox.shrink();

    return SizedBox(
      height: 38,
      child: ListView.separated(
        padding: const EdgeInsets.only(bottom: 4),
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

  void _onSpotTap(map_page.Spot spot) async {
    final now = DateTime.now();
    
    // 防抖：如果是同一个地点且点击间隔小于1秒，则忽略
    if (_lastClickedSpotId == spot.id && 
        _lastClickTime != null && 
        now.difference(_lastClickTime!).inMilliseconds < 1000) {
      print('🔧 [mine_page.dart] Debouncing rapid clicks for ${spot.name}');
      return;
    }
    
    _lastClickedSpotId = spot.id;
    _lastClickTime = now;
    
    // 添加调试日志
    print('🔧 [mine_page.dart] _onSpotTap for spot: ${spot.name}');
    
    // 加载地点的状态信息（包括 check-in 数据）
    bool? isSaved;
    bool? isMustGo;
    bool? isTodaysPlan;
    bool? isVisited;
    DateTime? visitDate;
    int? userRating;
    String? userNotes;
    List<String>? userPhotos;
    String? destinationId;

    try {
      final authState = ref.read(authProvider);
      if (authState.isAuthenticated) {
        // 显示loading indicator
        if (mounted) {
          showDialog<void>(
            context: context,
            barrierDismissible: false,
            builder: (context) => const Center(
              child: CircularProgressIndicator(color: AppTheme.primaryYellow),
            ),
          );
        }
        
        final tripRepo = ref.read(tripRepositoryProvider);
        final trips = await tripRepo.getMyTrips().timeout(
          const Duration(seconds: 2),
          onTimeout: () => <Trip>[],
        );

        // 查找包含这个 spot 的 trip
        for (final trip in trips) {
          final tripDetail = await tripRepo.getTripById(trip.id);
          final tripSpots = tripDetail.tripSpots ?? [];

          for (final ts in tripSpots) {
            if (ts.spot?.id == spot.id) {
              isSaved = ts.isSaved == true;
              isMustGo = ts.isMustGo == true;
              isTodaysPlan = ts.isTodaysPlan == true;
              isVisited = ts.isVisited == true;
              visitDate = ts.visitDate;
              userRating = ts.userRating;
              userNotes = ts.userNotes;
              userPhotos = ts.userPhotos?.cast<String>();
              destinationId = trip.id;
              break;
            }
          }
          if (isSaved != null) break;
        }
        
        // 💾 保存到缓存供后续使用
        WishlistStatusCache.updateFullStatus(
          spot.id,
          destinationId: destinationId,
          isSaved: isSaved ?? false,
          isMustGo: isMustGo,
          isTodaysPlan: isTodaysPlan,
          isVisited: isVisited,
          visitDate: visitDate,
          userRating: userRating,
          userNotes: userNotes,
          userPhotos: userPhotos,
        );
        
        // 关闭loading dialog
        if (mounted && Navigator.canPop(context)) {
          Navigator.pop(context);
        }
      }
    } catch (e) {
      print('❌ [mine_page.dart] Error loading status: $e');
      // 关闭loading dialog
      if (mounted && Navigator.canPop(context)) {
        Navigator.pop(context);
      }
      // 失败时使用缓存
      final fullStatus = WishlistStatusCache.getFullStatus(spot.id);
      isSaved = fullStatus?.isSaved ?? fullStatus?.destinationId != null;
      isMustGo = fullStatus?.isMustGo;
      isTodaysPlan = fullStatus?.isTodaysPlan;
      isVisited = fullStatus?.isVisited;
      visitDate = fullStatus?.visitDate;
      userRating = fullStatus?.userRating;
      userNotes = fullStatus?.userNotes;
      userPhotos = fullStatus?.userPhotos;
      destinationId = fullStatus?.destinationId;
    }

    // 添加调试日志
    print('🔧 [mine_page.dart] Data loaded for ${spot.name}:');
    print('🔧 [mine_page.dart] isSaved: $isSaved');
    print('🔧 [mine_page.dart] isMustGo: $isMustGo');
    print('🔧 [mine_page.dart] isTodaysPlan: $isTodaysPlan');
    print('🔧 [mine_page.dart] isVisited: $isVisited');
    print('🔧 [mine_page.dart] visitDate: $visitDate');
    print('🔧 [mine_page.dart] userRating: $userRating');
    print('🔧 [mine_page.dart] userNotes: $userNotes');
    print('🔧 [mine_page.dart] userPhotos: ${userPhotos?.length ?? 0} photos');
    print('🔧 [mine_page.dart] destinationId: $destinationId');

    if (!mounted) return;

    // Show spot detail modal
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => UnifiedSpotDetailModal(
        spot: spot,
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
    );
  }
}

/// Two-column country/city picker bottom sheet (like image 3)
class _CityPickerSheet extends StatefulWidget {
  const _CityPickerSheet({
    required this.spots,
    required this.selectedCity,
    required this.selectedCountry,
    required this.onSelected,
  });

  final List<map_page.Spot> spots;
  final String? selectedCity;
  final String? selectedCountry;
  final void Function(String? country, String? city) onSelected;

  @override
  State<_CityPickerSheet> createState() => _CityPickerSheetState();
}

class _CityPickerSheetState extends State<_CityPickerSheet> {
  String? _tempCountry;

  // Build country -> cities map from spots
  Map<String, List<String>> get _countryCitiesMap {
    final map = <String, Set<String>>{};
    for (final spot in widget.spots) {
      final country = spot.country ?? '';
      final city = spot.city;
      if (country.isNotEmpty && city.isNotEmpty) {
        map.putIfAbsent(country, () => <String>{}).add(city);
      }
    }
    // Convert to sorted lists
    return map.map((k, v) => MapEntry(k, v.toList()..sort()));
  }

  List<String> get _countries {
    final countries = _countryCitiesMap.keys.toList()..sort();
    return countries;
  }

  List<String> get _citiesForCountry {
    if (_tempCountry == null) return [];
    return _countryCitiesMap[_tempCountry] ?? [];
  }

  @override
  void initState() {
    super.initState();
    _tempCountry = widget.selectedCountry ??
        (_countries.isNotEmpty ? _countries.first : null);
  }

  @override
  Widget build(BuildContext context) {
    final isAllSelected =
        widget.selectedCity == null && widget.selectedCountry == null;

    return SafeArea(
      child: Container(
        height: 420,
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Select City', style: AppTheme.headlineMedium(context)),
            const SizedBox(height: 16),
            // All (Global Search) option
            GestureDetector(
              onTap: () {
                widget.onSelected(null, null);
                Navigator.pop(context);
              },
              child: Container(
                width: double.infinity,
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                decoration: BoxDecoration(
                  color: isAllSelected
                      ? AppTheme.primaryYellow.withOpacity(0.2)
                      : Colors.transparent,
                  border: const Border(
                    bottom: BorderSide(color: AppTheme.border, width: 1),
                  ),
                ),
                child: Row(
                  children: [
                    Text(
                      'All (Global Search)',
                      style: AppTheme.bodyMedium(context).copyWith(
                        fontWeight:
                            isAllSelected ? FontWeight.bold : FontWeight.normal,
                      ),
                    ),
                    const Spacer(),
                    if (isAllSelected)
                      const Icon(Icons.check,
                          size: 18, color: AppTheme.primaryYellow),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            // Two column layout
            Expanded(
              child: Row(
                children: [
                  // Countries column
                  Expanded(
                    flex: 2,
                    child: Container(
                      decoration: const BoxDecoration(
                        border: Border(
                          right: BorderSide(color: AppTheme.border, width: 1),
                        ),
                      ),
                      child: ListView.builder(
                        itemCount: _countries.length,
                        itemBuilder: (context, index) {
                          final country = _countries[index];
                          final isSelected = country == _tempCountry;
                          return GestureDetector(
                            onTap: () {
                              setState(() {
                                _tempCountry = country;
                              });
                            },
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 14),
                              color: isSelected
                                  ? AppTheme.primaryYellow.withOpacity(0.2)
                                  : Colors.transparent,
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      country,
                                      style:
                                          AppTheme.bodyMedium(context).copyWith(
                                        fontWeight: isSelected
                                            ? FontWeight.bold
                                            : FontWeight.normal,
                                      ),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  if (isSelected)
                                    const Icon(Icons.chevron_right,
                                        size: 18, color: AppTheme.mediumGray),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                  // Cities column
                  Expanded(
                    flex: 3,
                    child: ListView.builder(
                      itemCount: _citiesForCountry.length,
                      itemBuilder: (context, index) {
                        final city = _citiesForCountry[index];
                        final isSelected = city == widget.selectedCity &&
                            _tempCountry == widget.selectedCountry;
                        return GestureDetector(
                          onTap: () {
                            widget.onSelected(_tempCountry, city);
                            Navigator.pop(context);
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 14),
                            color: isSelected
                                ? AppTheme.primaryYellow.withOpacity(0.2)
                                : Colors.transparent,
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    city,
                                    style:
                                        AppTheme.bodyMedium(context).copyWith(
                                      fontWeight: isSelected
                                          ? FontWeight.bold
                                          : FontWeight.normal,
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                if (isSelected)
                                  const Icon(Icons.check,
                                      size: 18, color: AppTheme.primaryYellow),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Neo Brutalism styled icon button
class _NeoBrutalismIconButton extends StatelessWidget {
  const _NeoBrutalismIconButton({
    required this.icon,
    required this.onTap,
  });

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: AppTheme.white,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(
            color: AppTheme.black,
            width: AppTheme.borderMedium,
          ),
          boxShadow: const [
            BoxShadow(
              color: AppTheme.black,
              offset: Offset(2, 2),
              blurRadius: 0,
            ),
          ],
        ),
        child: Center(
          child: Icon(
            icon,
            size: 20,
            color: AppTheme.black,
          ),
        ),
      ),
    );
  }
}

/// Vertical spot card matching image 5 style - full image with gradient overlay
class _VerticalSpotCard extends StatefulWidget {
  const _VerticalSpotCard({
    required this.spot,
    required this.onTap,
  });

  final map_page.Spot spot;
  final VoidCallback onTap;

  @override
  State<_VerticalSpotCard> createState() => _VerticalSpotCardState();
}

class _VerticalSpotCardState extends State<_VerticalSpotCard> {
  Color _dominantColor = Colors.black;

  @override
  void initState() {
    super.initState();
    _extractDominantColor();
  }

  @override
  void didUpdateWidget(_VerticalSpotCard oldWidget) {
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
    const placeholder = ColoredBox(
      color: AppTheme.lightGray,
      child: Icon(
        Icons.place,
        size: 52,
        color: AppTheme.mediumGray,
      ),
    );

    if (widget.spot.coverImage.isEmpty) return placeholder;

    // Handle data URI format
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
    return GestureDetector(
      onTap: widget.onTap,
      child: Container(
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
              // Bottom gradient overlay
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: Container(
                  height: 140,
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
              // Content
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
                    if (widget.spot.rating > 0) ...[
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          const Icon(
                            Icons.star,
                            color: AppTheme.primaryYellow,
                            size: 18,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            widget.spot.rating.toStringAsFixed(1),
                            style: AppTheme.bodyMedium(context).copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          if (widget.spot.ratingCount > 0) ...[
                            Text(
                              ' (${_formatCount(widget.spot.ratingCount)})',
                              style: AppTheme.bodySmall(context).copyWith(
                                color: Colors.white70,
                              ),
                            ),
                          ],
                        ],
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

  String _formatCount(int count) {
    if (count >= 1000) {
      return '${(count / 1000).toStringAsFixed(1)}K';
    }
    return count.toString();
  }
}
