import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:palette_generator/palette_generator.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/core/utils/color_utils.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';
import 'package:wanderlog/features/search/data/search_repository.dart';
import 'package:wanderlog/features/map/presentation/widgets/mapbox_spot_map.dart';
import 'package:wanderlog/shared/widgets/unified_spot_detail_modal.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart';
import 'package:wanderlog/features/collections/providers/collection_providers.dart';
import 'package:wanderlog/features/map/presentation/widgets/tag_type_filter_bar.dart';
import 'package:wanderlog/features/search/providers/countries_cities_stats_provider.dart';
import 'package:wanderlog/shared/utils/number_format_utils.dart';
import 'package:wanderlog/features/ai_recognition/presentation/pages/ai_assistant_page.dart';
import 'package:wanderlog/shared/widgets/vago_placeholder.dart';
import 'package:wanderlog/features/map/providers/public_place_providers.dart';
import 'package:wanderlog/features/ai_recognition/providers/wishlist_status_provider.dart';
import 'package:wanderlog/features/map/data/models/public_place_dto.dart';
import 'package:wanderlog/shared/models/trip_model.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart';

/// 搜索结果地图页面
class SearchResultsMapPage extends ConsumerStatefulWidget {
  const SearchResultsMapPage({
    required this.city,
    required this.country,
    required this.selectedTags,
    this.categoryFilters = const [],
    this.tagFilters = const [],
    this.searchQuery,
    super.key,
  });

  final String city;
  final String country;
  final List<String> selectedTags;

  /// 后端 category 字段过滤条件
  final List<String> categoryFilters;

  /// 后端 tags/ai_tags 字段过滤条件
  final List<String> tagFilters;

  /// 文本搜索关键词（用于全局搜索）
  final String? searchQuery;

  @override
  ConsumerState<SearchResultsMapPage> createState() =>
      _SearchResultsMapPageState();
}

class _SearchResultsMapPageState extends ConsumerState<SearchResultsMapPage> {
  final GlobalKey<MapboxSpotMapState> _mapKey = GlobalKey<MapboxSpotMapState>();
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  late final PageController _cardPageController;

  late String _currentCity;
  late String _currentCountry;
  late List<String> _userSelectedTags;
  late List<String> _categoryFilters;
  late List<String> _tagFilters;
  String? _searchQuery; // 文本搜索关键词

  List<Spot> _spots = [];
  List<Spot> _cachedFilteredSpots = []; // 缓存过滤后的 spots
  Spot? _selectedSpot;
  int _currentCardIndex = 0;
  bool _isLoading = true;
  bool _isAiGenerated = false;
  bool _isAiGenerationFailed = false;
  bool _isExiting = false;
  String? _error;
  Position? _currentMapCenter;
  double _currentZoom = 12.0;

  // 所有地点的标签统计
  Map<String, int> _allTagsCounts = {};
  Set<String> _activeFilterTags = {};

  // 防抖字段
  String? _lastClickedSpotId;
  DateTime? _lastClickTime;

  /// 获取搜索显示文本（用于显示在搜索框中）
  String get _searchDisplayText {
    if (_searchQuery != null && _searchQuery!.isNotEmpty) {
      return 'Search: $_searchQuery';
    }
    if (_currentCity.isNotEmpty && _currentCountry.isNotEmpty) {
      return '$_currentCity, $_currentCountry';
    }
    if (_currentCity.isNotEmpty) {
      return _currentCity;
    }
    return 'Global Search';
  }

  @override
  void initState() {
    super.initState();
    _currentCity = widget.city;
    _currentCountry = widget.country;
    _userSelectedTags = List.from(widget.selectedTags);
    _categoryFilters = List.from(widget.categoryFilters);
    _tagFilters = List.from(widget.tagFilters);
    _searchQuery = widget.searchQuery;
    _activeFilterTags = Set.from(widget.selectedTags);
    _cardPageController = PageController(viewportFraction: 0.55);
    _currentMapCenter ??= Position(2.3522, 48.8566);
    _currentZoom = 12.0;

    // 初始化搜索框文本
    if (_searchQuery != null && _searchQuery!.isNotEmpty) {
      _searchController.text = _searchQuery!;
    }

    // 监听搜索框文本变化（用于显示/隐藏清除按钮）
    _searchController.addListener(() {
      setState(() {});
    });

    _loadPlaces();
  }

  @override
  void dispose() {
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

    _cachedFilteredSpots = _spots
        .where(
          (spot) =>
              spot.tags.any((tag) => lowerTags.contains(tag.toLowerCase())),
        )
        .toList();
  }

  Future<void> _loadPlaces() async {
    setState(() {
      _isLoading = true;
      _error = null;
      _isAiGenerationFailed = false;
    });

    try {
      final repository = ref.read(searchRepositoryProvider);
      SearchResult result;

      // 如果有搜索关键词，使用关键词搜索
      if (_searchQuery != null && _searchQuery!.isNotEmpty) {
        print('🔍 Keyword search: $_searchQuery');
        result = await repository.searchByKeyword(
          query: _searchQuery!,
          city: _currentCity.isNotEmpty ? _currentCity : null,
          country: _currentCountry.isNotEmpty ? _currentCountry : null,
          limit: 50,
        );
        print('📍 Keyword search result: ${result.places.length} places');

        // 关键词搜索没有结果时：显示 toast 提醒，保持地图页
        if (result.places.isEmpty) {
          setState(() {
            _isLoading = false;
            _isAiGenerationFailed = false;
            if (_spots.isEmpty) {
              _currentMapCenter = Position(2.3522, 48.8566);
              _currentZoom = 12.0;
            }
          });
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) {
              CustomToast.showInfo(
                  context, 'No spots found, try another search');
            }
          });
          return;
        }
      } else if (_currentCity.isEmpty) {
        // 选择了 "All" 但没有搜索关键词，显示空地图
        setState(() {
          _isLoading = false;
          _spots = [];
          _cachedFilteredSpots = [];
          _currentMapCenter = Position(2.3522, 48.8566); // 默认巴黎
          _currentZoom = 12.0;
        });
        return;
      } else {
        // 调试日志
        print('🔍 Searching: city=$_currentCity, country=$_currentCountry');
        print('🔍 Categories: $_categoryFilters, Tags: $_tagFilters');

        // 先尝试从数据库搜索，使用新的过滤参数
        result = await repository.searchPlaces(
          city: _currentCity,
          country: _currentCountry,
          categories: _categoryFilters.isEmpty ? null : _categoryFilters,
          tags: _tagFilters.isEmpty ? null : _tagFilters,
          limit: 50,
        );

        // 调试日志
        print(
            '📍 Search result: ${result.places.length} places, isAiGenerated=${result.isAiGenerated}');
        if (result.places.isNotEmpty) {
          print(
              '📍 First place: ${result.places.first.name}, category: ${result.places.first.category}, tags: ${result.places.first.tags}');
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
              _currentMapCenter =
                  _getCityDefaultCenter(_currentCity, _currentCountry);
            });
            return;
          }
        }
      }

      // 过滤掉没有封面图的地点
      final placesWithCover = result.places.where(_hasValidCoverImage).toList();
      print(
          '📍 过滤有封面图的地点: ${placesWithCover.length} / ${result.places.length}');

      final spots = placesWithCover.map(_convertToSpot).toList();
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
          _selectedSpot = _cachedFilteredSpots.isNotEmpty
              ? _cachedFilteredSpots.first
              : _spots.first;
          _currentMapCenter = Position(
            _selectedSpot!.longitude,
            _selectedSpot!.latitude,
          );
        } else {
          _currentMapCenter =
              _getCityDefaultCenter(_currentCity, _currentCountry);
        }
      });

      // 搜索完成后，自动移动地图到第一个结果位置
      if (_spots.isNotEmpty && _selectedSpot != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            _animateCamera(
              Position(_selectedSpot!.longitude, _selectedSpot!.latitude),
              zoom: 13.0,
            );
          }
        });
      }
    } catch (e) {
      print('❌ Search error: $e');
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  Spot _convertToSpot(SearchPlaceResult place) {
    // 优先使用后端计算好的 displayTagsEn（包含 category + aiTags + tags 的合并结果）
    // 如果没有，则回退到手动合并
    List<String> allTags;
    if (place.displayTagsEn.isNotEmpty) {
      allTags = place.displayTagsEn;
    } else {
      final displayCategory = place.categoryEn ?? place.category;
      allTags = <String>{
        if (displayCategory != null && displayCategory.isNotEmpty)
          displayCategory,
        ...place.tags,
      }.toList();
    }

    // 调试日志
    if (place.name.contains('Yoyogi') || place.name.contains('Ebisu')) {
      print(
          '🏷️ Converting ${place.name}: displayTagsEn=${place.displayTagsEn}, tags=${place.tags}, allTags=$allTags');
    }

    final displayCategory = place.categoryEn ?? place.category;

    return Spot(
      id: place.id,
      name: place.name,
      city: place.city ?? _currentCity,
      category: displayCategory ?? 'Place',
      latitude: place.latitude,
      longitude: place.longitude,
      rating: place.rating ?? 0.0,
      ratingCount: place.ratingCount ?? 0,
      coverImage: place.coverImage ?? '',
      images: place.images,
      tags: allTags,
      aiSummary: place.aiSummary,
    );
  }

  /// 检查是否有有效的封面图
  bool _hasValidCoverImage(SearchPlaceResult place) {
    final cover = place.coverImage;
    if (cover == null || cover.isEmpty) return false;
    // 排除占位符图片
    if (cover.contains('placeholder')) return false;
    if (cover.contains('example.com')) return false;
    return true;
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

      setState(() {
        _selectedSpot = spot;
        _currentCardIndex = index;
      });

      // 直接调用地图的方法更新 marker 样式，不触发重建
      _mapKey.currentState?.updateSelectedSpot(spot);

      // 只滚动卡片
      _cardPageController
          .animateToPage(
        index,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      )
          .then((_) {
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

  void _showSpotDetail(Spot spot) async {
    final now = DateTime.now();

    // 防抖：如果是同一个地点且点击间隔小于1秒，则忽略
    if (_lastClickedSpotId == spot.id &&
        _lastClickTime != null &&
        now.difference(_lastClickTime!).inMilliseconds < 1000) {
      print(
          '🔧 [search_results_map_page.dart] Debouncing rapid clicks for ${spot.name}');
      return;
    }

    _lastClickedSpotId = spot.id;
    _lastClickTime = now;

    // 添加调试日志
    print(
        '🔧 [search_results_map_page.dart] _showSpotDetail for spot: ${spot.name}');

    // 先从缓存读取状态，作为兜底
    bool? isSaved;
    bool? isMustGo;
    bool? isTodaysPlan;
    bool? isVisited;
    DateTime? visitDate;
    int? userRating;
    String? userNotes;
    List<String>? userPhotos;
    String? destinationId;
    Map<String, dynamic>? linkedCollection;
    Spot detailSpot = spot;

    final cachedStatus = WishlistStatusCache.getFullStatus(spot.id) ??
        (spot.name.isNotEmpty
            ? WishlistStatusCache.getFullStatus(spot.name)
            : null);
    if (cachedStatus != null) {
      isSaved = cachedStatus.isSaved;
      isMustGo = cachedStatus.isMustGo;
      isTodaysPlan = cachedStatus.isTodaysPlan;
      isVisited = cachedStatus.isVisited;
      visitDate = cachedStatus.visitDate;
      userRating = cachedStatus.userRating;
      userNotes = cachedStatus.userNotes;
      userPhotos = cachedStatus.userPhotos;
      destinationId = cachedStatus.destinationId;
    }

    // 先显示loading indicator，确保先加载数据再展示
    if (mounted) {
      showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (context) => const Center(
          child: CircularProgressIndicator(color: AppTheme.primaryYellow),
        ),
      );
    }

    try {
      final authState = ref.read(authProvider);
      // 等待可能正在进行的收藏/取消收藏操作完成
      await WishlistStatusCache.awaitPendingOperation(spot.id);
      if (spot.name.isNotEmpty) {
        await WishlistStatusCache.awaitPendingOperation(spot.name);
      }

      final detailFuture = () async {
        try {
          final repo = ref.read(publicPlaceRepositoryProvider);
          return await repo.getPlaceById(spot.id).timeout(
              const Duration(milliseconds: 1200),
              onTimeout: () => null);
        } catch (_) {
          return null;
        }
      }();

      final collectionsFuture = () async {
        try {
          final repo = ref.read(collectionRepositoryProvider);
          final collections = await repo
              .getCollectionsForPlace(spot.id)
              .timeout(const Duration(milliseconds: 1200), onTimeout: () => []);
          if (collections.isNotEmpty) {
            // 随机选择一个合集展示
            final random = math.Random();
            return collections[random.nextInt(collections.length)];
          }
        } catch (e) {
          print(
              '❌ [search_results_map_page.dart] Error loading collections: $e');
        }
        return null;
      }();

      final statusFuture = () async {
        if (!authState.isAuthenticated) return null;
        try {
          final tripRepo = ref.read(tripRepositoryProvider);
          final trips = await tripRepo.getMyTrips().timeout(
                const Duration(milliseconds: 1200),
                onTimeout: () => <Trip>[],
              );

          for (final trip in trips) {
            // 优先使用 getMyTrips 已包含的 tripSpots，避免额外请求
            List<TripSpot> tripSpots = trip.tripSpots ?? [];
            final needsDetail =
                tripSpots.isEmpty || tripSpots.any((ts) => ts.spot == null);
            if (needsDetail) {
              final tripDetail = await tripRepo
                  .getTripById(trip.id)
                  .timeout(const Duration(milliseconds: 1200));
              tripSpots = tripDetail.tripSpots ?? [];
            }
            for (final ts in tripSpots) {
              bool isMatch = false;
              if (ts.spotId == spot.id) {
                isMatch = true;
              } else if (ts.spot?.id == spot.id) {
                isMatch = true;
              } else if (ts.spot?.googlePlaceId != null &&
                  ts.spot?.googlePlaceId == spot.id) {
                isMatch = true;
              } else if (ts.spot?.name != null && spot.name.isNotEmpty) {
                final sameName = ts.spot!.name.trim().toLowerCase() ==
                    spot.name.trim().toLowerCase();
                final sameCity = (ts.spot?.city ?? '').trim().toLowerCase() ==
                    spot.city.trim().toLowerCase();
                if (sameName && (spot.city.isEmpty || sameCity)) {
                  isMatch = true;
                }
              } else if (ts.spot?.name == spot.name && spot.name.isNotEmpty) {
                isMatch = true;
              }
              if (isMatch) {
                return {
                  'isSaved': ts.isSaved == true,
                  'isMustGo': ts.isMustGo == true,
                  'isTodaysPlan': ts.isTodaysPlan == true,
                  'isVisited': ts.isVisited == true,
                  'visitDate': ts.visitDate,
                  'userRating': ts.userRating,
                  'userNotes': ts.userNotes,
                  'userPhotos': ts.userPhotos?.cast<String>(),
                  'destinationId': trip.id,
                };
              }
            }
          }
        } catch (e) {
          print('❌ [search_results_map_page.dart] Error loading status: $e');
        }
        return null;
      }();

      final results =
          await Future.wait([detailFuture, collectionsFuture, statusFuture])
              .timeout(const Duration(milliseconds: 1500));
      final detailPlace = results[0] as PublicPlaceDto?;
      linkedCollection = results[1] as Map<String, dynamic>?;
      final statusData = results[2] as Map<String, dynamic>?;

      if (detailPlace != null) {
        detailSpot = _mergeSpotWithPublicPlace(detailSpot, detailPlace);
      }

      if (statusData != null) {
        isSaved = statusData['isSaved'] as bool?;
        isMustGo = statusData['isMustGo'] as bool?;
        isTodaysPlan = statusData['isTodaysPlan'] as bool?;
        isVisited = statusData['isVisited'] as bool?;
        visitDate = statusData['visitDate'] as DateTime?;
        userRating = statusData['userRating'] as int?;
        userNotes = statusData['userNotes'] as String?;
        userPhotos = statusData['userPhotos'] as List<String>?;
        destinationId = statusData['destinationId'] as String?;
      } else if (cachedStatus != null) {
        // 若服务端未返回，使用缓存兜底
        isSaved = cachedStatus.isSaved;
        isMustGo = cachedStatus.isMustGo;
        isTodaysPlan = cachedStatus.isTodaysPlan;
        isVisited = cachedStatus.isVisited;
        visitDate = cachedStatus.visitDate;
        userRating = cachedStatus.userRating;
        userNotes = cachedStatus.userNotes;
        userPhotos = cachedStatus.userPhotos;
        destinationId = cachedStatus.destinationId;
      }
    } catch (e) {
      print('❌ [search_results_map_page.dart] Error loading data: $e');
      // 失败时使用缓存兜底
      if (cachedStatus != null) {
        isSaved = cachedStatus.isSaved;
        isMustGo = cachedStatus.isMustGo;
        isTodaysPlan = cachedStatus.isTodaysPlan;
        isVisited = cachedStatus.isVisited;
        visitDate = cachedStatus.visitDate;
        userRating = cachedStatus.userRating;
        userNotes = cachedStatus.userNotes;
        userPhotos = cachedStatus.userPhotos;
        destinationId = cachedStatus.destinationId;
      }
    } finally {
      if (mounted && Navigator.canPop(context)) {
        Navigator.pop(context);
      }
    }

    // 添加调试日志
    print('🔧 [search_results_map_page.dart] Data loaded for ${spot.name}:');
    print('🔧 [search_results_map_page.dart] isSaved: $isSaved');
    print('🔧 [search_results_map_page.dart] isMustGo: $isMustGo');
    print('🔧 [search_results_map_page.dart] isTodaysPlan: $isTodaysPlan');
    print('🔧 [search_results_map_page.dart] isVisited: $isVisited');
    print('🔧 [search_results_map_page.dart] visitDate: $visitDate');
    print('🔧 [search_results_map_page.dart] userRating: $userRating');
    print('🔧 [search_results_map_page.dart] userNotes: $userNotes');
    print(
        '🔧 [search_results_map_page.dart] userPhotos: ${userPhotos?.length ?? 0} photos');
    print('🔧 [search_results_map_page.dart] destinationId: $destinationId');

    if (!mounted) return;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => UnifiedSpotDetailModal(
        spot: detailSpot,
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
    );
  }

  Spot _mergeSpotWithPublicPlace(Spot base, PublicPlaceDto place) {
    final cover = (place.coverImage != null && place.coverImage!.isNotEmpty)
        ? place.coverImage!
        : base.coverImage;
    final images = place.images.isNotEmpty ? place.images : base.images;
    final tags =
        place.displayTagsEn.isNotEmpty ? place.displayTagsEn : base.tags;
    final displayCategory = place.categoryEn ?? place.category ?? base.category;

    return base.copyWith(
      name: place.name,
      city: place.city ?? base.city,
      country: place.country ?? base.country,
      category: displayCategory,
      latitude: place.latitude,
      longitude: place.longitude,
      rating: place.rating ?? base.rating,
      ratingCount: place.ratingCount ?? base.ratingCount,
      coverImage: cover,
      images: images,
      tags: tags,
      displayTagsEn: place.displayTagsEn.isNotEmpty
          ? place.displayTagsEn
          : base.displayTagsEn,
      description: place.description ?? base.description,
      aiSummary: place.aiSummary ?? base.aiSummary,
      address: place.address ?? base.address,
      phoneNumber: place.phoneNumber ?? base.phoneNumber,
      website: place.website ?? base.website,
      openingHours: place.openingHours ?? base.openingHours,
      customFields: place.customFields ?? base.customFields,
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
      _selectedSpot =
          _cachedFilteredSpots.isNotEmpty ? _cachedFilteredSpots.first : null;
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

  /// 执行搜索
  void _performSearch() {
    final query = _searchController.text.trim();
    if (query.isEmpty) {
      CustomToast.showInfo(context, 'Please enter a search term');
      return;
    }

    // 收起键盘
    _searchFocusNode.unfocus();

    setState(() {
      _searchQuery = query;
      // 保留城市/国家筛选，可以在特定城市内搜索
      _userSelectedTags = [];
      _categoryFilters = [];
      _tagFilters = [];
      _activeFilterTags = {};
    });
    _loadPlaces();
  }

  /// 清空搜索
  void _clearSearch() {
    _searchController.clear();
    _searchFocusNode.unfocus();
  }

  /// 城市选择器显示文本
  String get _cityDisplayText {
    if (_currentCity.isEmpty) {
      return 'All';
    }
    return _currentCity;
  }

  /// 构建城市选择器按钮
  Widget _buildCitySelector() => GestureDetector(
        onTap: _showCityPicker,
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
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 80),
                child: Text(
                  _cityDisplayText,
                  style: AppTheme.bodySmall(context)
                      .copyWith(color: AppTheme.black),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 2),
              const Icon(Icons.keyboard_arrow_down, size: 16),
            ],
          ),
        ),
      );

  /// 显示城市选择器
  void _showCityPicker() {
    // 确保数据已加载
    final statsNotifier = ref.read(countriesCitiesStatsProvider.notifier);
    final statsState = ref.read(countriesCitiesStatsProvider);
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
      builder: (sheetContext) => _SearchCityPickerSheet(
        selectedCity: _currentCity,
        selectedCountry: _currentCountry,
        onCitySelected: (city, country) {
          Navigator.pop(sheetContext);
          _handleCityChanged(city, country);
        },
      ),
    );
  }

  /// 处理城市选择变更
  void _handleCityChanged(String city, String? country) {
    setState(() {
      _currentCity = city;
      _currentCountry = country ?? '';
      // 切换城市时清除搜索词
      _searchQuery = null;
      _searchController.clear();
    });
    _loadPlaces();
  }

  @override
  Widget build(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    final topPadding = mediaQuery.padding.top;
    final filteredSpots = _filteredSpots;

    return WillPopScope(
      onWillPop: () async {
        _handleExit();
        return false;
      },
      child: Scaffold(
        resizeToAvoidBottomInset: false,
        backgroundColor: Colors.white,
        body: Stack(
          children: [
            // Map
            Positioned.fill(
              child: _MapSurface(
                mapKey: _mapKey,
                spots: filteredSpots,
                fallbackCenter: _currentMapCenter ?? Position(2.3522, 48.8566),
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
                        size: 44,
                        onPressed: _handleExit,
                        backgroundColor: Colors.white,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Container(
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
                              const Icon(Icons.search,
                                  size: 18, color: AppTheme.mediumGray),
                              const SizedBox(width: 8),
                              Expanded(
                                child: TextField(
                                  controller: _searchController,
                                  focusNode: _searchFocusNode,
                                  style: AppTheme.bodySmall(context)
                                      .copyWith(color: AppTheme.black),
                                  textInputAction: TextInputAction.search,
                                  decoration: InputDecoration(
                                    hintText: 'Search places...',
                                    hintStyle: AppTheme.bodySmall(context)
                                        .copyWith(color: AppTheme.mediumGray),
                                    border: InputBorder.none,
                                    isDense: true,
                                    contentPadding: EdgeInsets.zero,
                                  ),
                                  onSubmitted: (_) => _performSearch(),
                                ),
                              ),
                              // Clear button - before ask AI
                              if (_searchController.text.isNotEmpty)
                                GestureDetector(
                                  onTap: _clearSearch,
                                  child: const Padding(
                                    padding: EdgeInsets.only(left: 4, right: 4),
                                    child: Icon(Icons.close,
                                        size: 18, color: AppTheme.mediumGray),
                                  ),
                                ),
                              // Ask AI entry
                              GestureDetector(
                                onTap: () {
                                  Navigator.of(context).push<void>(
                                    MaterialPageRoute<void>(
                                      builder: (context) =>
                                          const AIAssistantPage(),
                                    ),
                                  );
                                },
                                child: Padding(
                                  padding:
                                      const EdgeInsets.only(left: 4, right: 10),
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
                                        style: AppTheme.bodyMedium(context)
                                            .copyWith(
                                          color: AppTheme.black,
                                          fontSize: 14,
                                          decoration: TextDecoration.underline,
                                          decorationColor:
                                              AppTheme.primaryYellow,
                                          decorationThickness: 2,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      // 城市选择器
                      _buildCitySelector(),
                    ],
                  ),
                  const SizedBox(height: 10),
                  // Tag bar - 与首页 map 样式一致，不显示标签类型筛选器
                  _buildTagBar(),
                ],
              ),
            ),

            // Loading overlay
            if (_isLoading)
              Center(
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
                    border: Border.all(color: AppTheme.black, width: 1),
                    boxShadow: const [
                      BoxShadow(
                        color: AppTheme.black,
                        offset: Offset(1, 2),
                        blurRadius: 0,
                      ),
                    ],
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          shape: BoxShape.circle,
                          boxShadow: const [
                            BoxShadow(
                              color: Colors.black12,
                              blurRadius: 6,
                              offset: Offset(0, 2),
                            ),
                          ],
                        ),
                        child: const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppTheme.primaryYellow,
                          ),
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'Finding spots for you...',
                        style: AppTheme.bodySmall(context).copyWith(
                          color: AppTheme.mediumGray,
                        ),
                      ),
                    ],
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
                        Text('Unable to load places',
                            style: AppTheme.headlineMedium(context)),
                        const SizedBox(height: 8),
                        Text(
                          _error!,
                          style: AppTheme.bodyMedium(context)
                              .copyWith(color: AppTheme.mediumGray),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 20),
                        PrimaryButton(text: 'Retry', onPressed: _loadPlaces),
                      ],
                    ),
                  ),
                ),
              ),

            if (!_isLoading &&
                _error == null &&
                filteredSpots.isNotEmpty &&
                !_isExiting)
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
                      setState(() {
                        _currentCardIndex = index;
                        _selectedSpot = spot;
                      });
                      // 到达目标 index 后才重置标记
                      if (index == _markerTapTargetIndex) {
                        _isMarkerTapScroll = false;
                        _markerTapTargetIndex = null;
                      }
                      return;
                    }

                    // 用户手动滑动卡片，移动相机并更新 marker 高亮
                    setState(() {
                      _currentCardIndex = index;
                      _selectedSpot = spot;
                    });

                    // 更新地图 marker 高亮状态
                    _mapKey.currentState?.updateSelectedSpot(spot);

                    // 移动相机到选中的地点
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
            if (_isAiGenerationFailed) _buildAiFailedOverlay(),
          ],
        ),
      ),
    );
  }

  /// 标签栏 - 与首页 map 样式一致，最多展示 10 个标签
  Widget _buildTagBar() {
    // 合并用户选择的标签和搜索结果的标签
    final allTags =
        <String>{..._userSelectedTags, ..._allTagsCounts.keys}.toList();

    // 按数量排序，用户选择的标签优先
    allTags.sort((a, b) {
      final aSelected = _userSelectedTags.contains(a);
      final bSelected = _userSelectedTags.contains(b);
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      final aCount = _allTagsCounts[a] ?? 0;
      final bCount = _allTagsCounts[b] ?? 0;
      return bCount.compareTo(aCount);
    });

    // 最多展示 10 个标签（与首页 map 一致）
    final displayTags = allTags.take(10).toList();

    if (displayTags.isEmpty) {
      return const SizedBox.shrink();
    }

    return SizedBox(
      height: 38,
      child: ListView.separated(
        padding: const EdgeInsets.only(left: 0, right: 0, bottom: 4),
        scrollDirection: Axis.horizontal,
        clipBehavior: Clip.none,
        itemCount: displayTags.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final tag = displayTags[index];
          final isSelected = _activeFilterTags.contains(tag);
          final emoji = _tagEmoji(tag);

          // 获取显示名称（去掉前缀）
          final displayName = TagTypeFilterBar.getTagDisplayName(tag);

          return GestureDetector(
            onTap: () => _toggleFilterTag(tag),
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
                    displayName,
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

  Widget _buildAiFailedOverlay() => Positioned.fill(
        child: ColoredBox(
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
                        onPressed: _handleExit,
                        backgroundColor: Colors.white,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          _searchDisplayText,
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
                              borderRadius:
                                  BorderRadius.circular(AppTheme.radiusLarge),
                              border: Border.all(
                                  color: AppTheme.black,
                                  width: AppTheme.borderMedium),
                            ),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(Icons.auto_awesome_outlined,
                                    size: 64, color: AppTheme.mediumGray),
                                const SizedBox(height: 8),
                                Text(
                                  '✨ AI',
                                  style: AppTheme.titleMedium(context)
                                      .copyWith(color: AppTheme.mediumGray),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 24),
                          Text('AI Generation Failed',
                              style: AppTheme.headlineMedium(context),
                              textAlign: TextAlign.center),
                          const SizedBox(height: 12),
                          Text(
                            _searchQuery != null && _searchQuery!.isNotEmpty
                                ? 'No results found for "$_searchQuery".\n\nPlease try a different keyword.'
                                : 'We couldn\'t generate recommendations for "${_userSelectedTags.join(', ')}" in $_currentCity.\n\nPlease try again later or choose different filters.',
                            style: AppTheme.bodyMedium(context)
                                .copyWith(color: AppTheme.mediumGray),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 32),
                          PrimaryButton(
                              text: 'Go Back', onPressed: _handleExit),
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

class _MapSurface extends StatelessWidget {
  const _MapSurface({
    required this.mapKey,
    required this.spots,
    required this.fallbackCenter,
    required this.currentZoom,
    required this.onSpotTap,
    required this.onCameraMove,
    this.currentCenter,
    this.selectedSpot,
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
  Widget build(BuildContext context) => MapboxSpotMap(
        key: mapKey,
        spots: spots,
        initialCenter: currentCenter ?? fallbackCenter,
        initialZoom: currentZoom,
        selectedSpot: selectedSpot,
        onSpotTap: onSpotTap,
        onCameraMove: onCameraMove,
      );
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

  Widget _buildCover() {
    const placeholder = VagoPlaceholderSmall();

    if (widget.spot.coverImage.isEmpty) return placeholder;

    // Handle data URI format
    if (widget.spot.coverImage.startsWith('data:')) {
      try {
        final base64Data = widget.spot.coverImage.split(',').last;
        final bytes = base64Decode(base64Data);
        return Image.memory(Uint8List.fromList(bytes),
            fit: BoxFit.cover, errorBuilder: (_, __, ___) => placeholder);
      } catch (e) {
        return placeholder;
      }
    }
    return Image.network(widget.spot.coverImage,
        fit: BoxFit.cover, errorBuilder: (_, __, ___) => placeholder);
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
                // AI 标签 - 右上角
                if (widget.isAiGenerated)
                  Positioned(
                    top: 10,
                    right: 10,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppTheme.primaryYellow,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppTheme.black, width: 1),
                      ),
                      child: const Text('✨ AI',
                          style: TextStyle(
                              fontSize: 11, fontWeight: FontWeight.w600)),
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

class _RatingRow extends StatelessWidget {
  const _RatingRow({required this.rating, required this.ratingCount});

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
        const Icon(Icons.star, size: 16, color: Colors.amber),
        const SizedBox(width: 4),
        Text(
          rating.toStringAsFixed(1),
          style: AppTheme.labelSmall(context).copyWith(color: Colors.white),
        ),
        if (ratingCount > 0) ...[
          const SizedBox(width: 4),
          Text(
            formatRatingCount(ratingCount),
            style: AppTheme.labelSmall(context).copyWith(color: Colors.white70),
          ),
        ],
      ],
    );
  }
}

/// 搜索页城市选择器底部弹窗（带 "All" 选项）
class _SearchCityPickerSheet extends ConsumerStatefulWidget {
  const _SearchCityPickerSheet({
    required this.selectedCity,
    required this.selectedCountry,
    required this.onCitySelected,
  });

  final String selectedCity;
  final String selectedCountry;
  final void Function(String city, String? country) onCitySelected;

  @override
  ConsumerState<_SearchCityPickerSheet> createState() =>
      _SearchCityPickerSheetState();
}

class _SearchCityPickerSheetState
    extends ConsumerState<_SearchCityPickerSheet> {
  String? _selectedCountry;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final statsState = ref.read(countriesCitiesStatsProvider);
      if (!statsState.hasData && !statsState.isLoading) {
        ref.read(countriesCitiesStatsProvider.notifier).load();
      }
      _updateSelectedCountry();
    });
  }

  void _updateSelectedCountry() {
    if (widget.selectedCountry.isNotEmpty) {
      setState(() {
        _selectedCountry = widget.selectedCountry;
      });
      return;
    }
    final statsState = ref.read(countriesCitiesStatsProvider);
    if (statsState.hasData && widget.selectedCity.isNotEmpty) {
      final country = _findCountryForCity(widget.selectedCity, statsState);
      if (country != null) {
        setState(() {
          _selectedCountry = country;
        });
      }
    }
  }

  String? _findCountryForCity(
      String city, CountriesCitiesStatsState statsState) {
    for (final country in statsState.countries) {
      if (country.cities.any((c) => c.name == city)) {
        return country.name;
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final statsState = ref.watch(countriesCitiesStatsProvider);

    if (_selectedCountry == null &&
        statsState.hasData &&
        statsState.countries.isNotEmpty) {
      _selectedCountry = statsState.countries.first.name;
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
            Row(
              children: [
                Text('Select City', style: AppTheme.headlineMedium(context)),
                const Spacer(),
                // "All" 选项（右上角胶囊样式）
                GestureDetector(
                  onTap: () => widget.onCitySelected('', null),
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: widget.selectedCity.isEmpty
                          ? AppTheme.primaryYellow.withOpacity(0.3)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppTheme.border),
                    ),
                    child: Text(
                      'All',
                      style: AppTheme.bodyMedium(context).copyWith(
                        fontWeight: widget.selectedCity.isEmpty
                            ? FontWeight.bold
                            : FontWeight.normal,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Expanded(
              child: statsState.isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : statsState.hasData
                      ? _buildCountryCityColumns(scrollController, statsState)
                      : const Center(child: Text('No data available')),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCountryCityColumns(
      ScrollController scrollController, CountriesCitiesStatsState statsState) {
    final countries = statsState.countries;
    final citiesForCountry = _selectedCountry != null
        ? statsState
            .getCities(_selectedCountry!)
            .where((c) => c.placeCount >= 5)
            .toList()
        : <CityStats>[];

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
                    setState(() {
                      _selectedCountry = country.name;
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
    );
  }
}
