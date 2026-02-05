import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/features/trips/services/spot_cache_service.dart';
import 'package:wanderlog/shared/models/spot_model.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart';

/// Spots 页面全局缓存状态
/// 用于在页面切换时保持 spots 数据，避免重新加载
class SpotsCacheState {
  const SpotsCacheState({
    this.entries = const [],
    this.isLoading = true,
    this.hasError = false,
    this.errorMessage,
    this.hasCompletedInitialLoad = false,
    this.isBackgroundRefreshing = false,
    this.lastLoadedAt,
    this.selectedCitySlug = '__all__',
    this.userCityHistory = const [],
    this.extraCitySlugs = const {},
  });

  final List<SpotCacheEntry> entries;
  final bool isLoading;
  final bool hasError;
  final String? errorMessage;
  final bool hasCompletedInitialLoad;
  final bool isBackgroundRefreshing;
  final DateTime? lastLoadedAt;
  final String selectedCitySlug;
  final List<String> userCityHistory;
  final Map<String, String> extraCitySlugs;

  /// 是否有缓存数据可显示
  bool get hasData => entries.isNotEmpty;

  /// 缓存是否过期（超过5分钟强制刷新）
  bool get isStale {
    if (lastLoadedAt == null) return true;
    return DateTime.now().difference(lastLoadedAt!) >
        const Duration(minutes: 5);
  }

  SpotsCacheState copyWith({
    List<SpotCacheEntry>? entries,
    bool? isLoading,
    bool? hasError,
    String? errorMessage,
    bool? hasCompletedInitialLoad,
    bool? isBackgroundRefreshing,
    DateTime? lastLoadedAt,
    String? selectedCitySlug,
    List<String>? userCityHistory,
    Map<String, String>? extraCitySlugs,
  }) {
    return SpotsCacheState(
      entries: entries ?? this.entries,
      isLoading: isLoading ?? this.isLoading,
      hasError: hasError ?? this.hasError,
      errorMessage: errorMessage ?? this.errorMessage,
      hasCompletedInitialLoad:
          hasCompletedInitialLoad ?? this.hasCompletedInitialLoad,
      isBackgroundRefreshing:
          isBackgroundRefreshing ?? this.isBackgroundRefreshing,
      lastLoadedAt: lastLoadedAt ?? this.lastLoadedAt,
      selectedCitySlug: selectedCitySlug ?? this.selectedCitySlug,
      userCityHistory: userCityHistory ?? this.userCityHistory,
      extraCitySlugs: extraCitySlugs ?? this.extraCitySlugs,
    );
  }
}

/// Spot 缓存条目
class SpotCacheEntry {
  const SpotCacheEntry({
    required this.spot,
    required this.city,
    required this.citySlug,
    required this.isSaved,
    required this.isMustGo,
    required this.isTodaysPlan,
    required this.isVisited,
    this.destinationId,
    required this.addedAt,
    this.visitDate,
    this.userRating,
    this.userNotes,
    this.userPhotos = const [],
  });

  final Spot spot;
  final String city;
  final String citySlug;
  final bool isSaved;
  final bool isMustGo;
  final bool isTodaysPlan;
  final bool isVisited;
  final String? destinationId;
  final DateTime addedAt;
  final DateTime? visitDate;
  final int? userRating;
  final String? userNotes;
  final List<String> userPhotos;

  SpotCacheEntry copyWith({
    Spot? spot,
    String? city,
    String? citySlug,
    bool? isSaved,
    bool? isMustGo,
    bool? isTodaysPlan,
    bool? isVisited,
    String? destinationId,
    DateTime? addedAt,
    DateTime? visitDate,
    int? userRating,
    String? userNotes,
    List<String>? userPhotos,
  }) {
    return SpotCacheEntry(
      spot: spot ?? this.spot,
      city: city ?? this.city,
      citySlug: citySlug ?? this.citySlug,
      isSaved: isSaved ?? this.isSaved,
      isMustGo: isMustGo ?? this.isMustGo,
      isTodaysPlan: isTodaysPlan ?? this.isTodaysPlan,
      isVisited: isVisited ?? this.isVisited,
      destinationId: destinationId ?? this.destinationId,
      addedAt: addedAt ?? this.addedAt,
      visitDate: visitDate ?? this.visitDate,
      userRating: userRating ?? this.userRating,
      userNotes: userNotes ?? this.userNotes,
      userPhotos: userPhotos ?? this.userPhotos,
    );
  }
}

/// Spots 缓存状态管理 Provider
class SpotsCacheNotifier extends StateNotifier<SpotsCacheState> {
  SpotsCacheNotifier(this._ref) : super(const SpotsCacheState()) {
    // 初始化时立即尝试从本地缓存恢复
    _initFromLocalCache();
  }

  final Ref _ref;
  final SpotCacheService _cacheService = SpotCacheService();
  static const int _maxCachedItems = 100;
  bool _isInitialized = false;

  /// 从本地缓存初始化（只恢复本地缓存，不发起网络请求）
  Future<void> _initFromLocalCache() async {
    if (_isInitialized) return;
    _isInitialized = true;

    print('🚀 [SpotsCacheProvider] Initializing from local cache...');

    try {
      final cachedData =
          await _cacheService.getCitySpots(state.selectedCitySlug);
      if (cachedData != null && cachedData.entries.isNotEmpty) {
        final entries = cachedData.entries
            .map((e) => SpotCacheEntry(
                  spot: e.spot,
                  city: e.city,
                  citySlug: e.citySlug,
                  isSaved: e.isSaved,
                  isMustGo: e.isMustGo,
                  isTodaysPlan: e.isTodaysPlan,
                  isVisited: e.isVisited,
                  destinationId: e.destinationId,
                  addedAt: e.addedAt,
                  visitDate: e.visitDate,
                  userRating: e.userRating,
                  userNotes: e.userNotes,
                  userPhotos: e.userPhotos,
                ))
            .toList();

        print(
            '💾 [SpotsCacheProvider] Restored ${entries.length} entries from local cache');

        state = state.copyWith(
          entries: entries,
          isLoading: false,
          hasCompletedInitialLoad: true,
          isBackgroundRefreshing: cachedData.isExpired,
        );

        // 注意：不在这里触发后台刷新，由 spots_tab.dart 控制
      } else {
        print('📭 [SpotsCacheProvider] No local cache found');
        // 不主动发起网络请求，由 spots_tab.dart 控制
        state = state.copyWith(
          isLoading: false,
          hasCompletedInitialLoad: false, // 标记需要加载
        );
      }
    } catch (e) {
      print('❌ [SpotsCacheProvider] Failed to init from cache: $e');
      state = state.copyWith(
        isLoading: false,
        hasCompletedInitialLoad: false, // 标记需要加载
      );
    }
  }

  /// 从服务器加载最新数据
  Future<void> _loadFreshData({bool forceRefresh = false}) async {
    final authState = _ref.read(authProvider);
    if (!authState.isAuthenticated) {
      state = state.copyWith(
        isLoading: false,
        hasCompletedInitialLoad: true,
        isBackgroundRefreshing: false,
      );
      return;
    }

    // 如果已有数据，静默后台刷新
    if (state.hasData && !forceRefresh) {
      state = state.copyWith(isBackgroundRefreshing: true);
    } else {
      state = state.copyWith(isLoading: true);
    }

    try {
      final repo = _ref.read(tripRepositoryProvider);
      final destinations = await repo.getMyTrips().timeout(
        const Duration(seconds: 10),
        onTimeout: () {
          throw TimeoutException('Request timed out');
        },
      );

      destinations.sort(
        (a, b) => (b.createdAt ?? DateTime.now())
            .compareTo(a.createdAt ?? DateTime.now()),
      );

      // 处理城市信息
      final userCityHistory = <String>[];
      final extraCitySlugs = <String, String>{};
      for (final destination in destinations) {
        final city = destination.city?.trim();
        if (city == null || city.isEmpty) continue;
        final slug = _slugify(city);
        extraCitySlugs[slug] = city;
        userCityHistory.removeWhere(
          (existing) => existing.toLowerCase() == city.toLowerCase(),
        );
        userCityHistory.insert(0, city);
      }

      // 加载详情
      final entries = <SpotCacheEntry>[];
      final limitedDests = destinations.take(_maxCachedItems).toList();
      final detailFutures =
          limitedDests.where((d) => d.city?.trim().isNotEmpty ?? false).map(
                (d) => repo
                    .getTripById(d.id)
                    .timeout(const Duration(seconds: 5))
                    .catchError((_) => d),
              );
      final details = await Future.wait(detailFutures);

      for (final detail in details) {
        final tripSpots = detail.tripSpots ?? const <TripSpot>[];
        for (final ts in tripSpots) {
          final s = ts.spot;
          if (s == null) continue;
          if (!ts.isSaved && !ts.isVisited) continue;

          final cityName =
              (s.city ?? 'Unknown').trim().isEmpty ? 'Unknown' : s.city!.trim();
          final spotSlug = _slugify(cityName);

          entries.add(SpotCacheEntry(
            spot: s,
            city: cityName,
            citySlug: spotSlug,
            isSaved: ts.isSaved,
            isMustGo: ts.isMustGo,
            isTodaysPlan: ts.isTodaysPlan,
            isVisited: ts.isVisited,
            destinationId: detail.id,
            addedAt: ts.createdAt ?? DateTime.now(),
            visitDate: ts.visitDate,
            userRating: ts.userRating,
            userNotes: ts.userNotes,
            userPhotos: ts.userPhotos ?? [],
          ));
        }
      }

      print(
          '✅ [SpotsCacheProvider] Loaded ${entries.length} entries from server');

      state = state.copyWith(
        entries: entries,
        isLoading: false,
        hasError: false,
        hasCompletedInitialLoad: true,
        isBackgroundRefreshing: false,
        lastLoadedAt: DateTime.now(),
        userCityHistory: userCityHistory,
        extraCitySlugs: extraCitySlugs,
      );

      // 保存到本地缓存
      unawaited(_saveToLocalCache(entries));
    } catch (e) {
      print('❌ [SpotsCacheProvider] Failed to load: $e');
      state = state.copyWith(
        isLoading: false,
        hasError: state.entries.isEmpty,
        errorMessage: e.toString(),
        hasCompletedInitialLoad: true,
        isBackgroundRefreshing: false,
      );
    }
  }

  /// 保存到本地缓存
  Future<void> _saveToLocalCache(List<SpotCacheEntry> entries) async {
    try {
      final cachedEntries = entries
          .take(_maxCachedItems)
          .map((e) => CachedSpotEntry(
                spot: e.spot,
                city: e.city,
                citySlug: e.citySlug,
                isSaved: e.isSaved,
                isMustGo: e.isMustGo,
                isTodaysPlan: e.isTodaysPlan,
                isVisited: e.isVisited,
                destinationId: e.destinationId,
                addedAt: e.addedAt,
                visitDate: e.visitDate,
                userRating: e.userRating,
                userNotes: e.userNotes,
                userPhotos: e.userPhotos,
              ))
          .toList();

      await _cacheService.saveCitySpots(
        citySlug: state.selectedCitySlug,
        entries: cachedEntries,
        tabCounts: {
          'all': entries.where((e) => e.isSaved).length,
          'mustGo': entries.where((e) => e.isMustGo).length,
          'todaysPlan': entries.where((e) => e.isTodaysPlan).length,
          'visited': entries.where((e) => e.isVisited).length,
        },
      );
    } catch (e) {
      print('❌ [SpotsCacheProvider] Failed to save to local cache: $e');
    }
  }

  /// 强制刷新数据
  Future<void> refresh() async {
    await _loadFreshData(forceRefresh: true);
  }

  /// 更新单个 entry
  void updateEntry(
      String spotId, SpotCacheEntry Function(SpotCacheEntry) update) {
    final index = state.entries.indexWhere((e) => e.spot.id == spotId);
    if (index == -1) return;

    final updatedEntries = List<SpotCacheEntry>.from(state.entries);
    updatedEntries[index] = update(updatedEntries[index]);
    state = state.copyWith(entries: updatedEntries);

    // 异步保存到本地缓存
    unawaited(_saveToLocalCache(updatedEntries));
  }

  /// 添加新 entry
  void addEntry(SpotCacheEntry entry) {
    final updatedEntries = [entry, ...state.entries];
    state = state.copyWith(entries: updatedEntries);
    unawaited(_saveToLocalCache(updatedEntries));
  }

  /// 删除 entry
  void removeEntry(String spotId) {
    final updatedEntries =
        state.entries.where((e) => e.spot.id != spotId).toList();
    state = state.copyWith(entries: updatedEntries);
    unawaited(_saveToLocalCache(updatedEntries));
  }

  /// 批量更新状态（供 SpotsTab 使用，避免重复加载）
  void updateState(SpotsCacheState newState) {
    state = newState;
    if (newState.entries.isNotEmpty) {
      unawaited(_saveToLocalCache(newState.entries));
    }
  }

  /// 清空缓存
  Future<void> clear() async {
    state = const SpotsCacheState();
    await _cacheService.clearAllCache();
  }

  String _slugify(String city) {
    final base = city.toLowerCase();
    final slug = base
        .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
        .replaceAll(RegExp(r'^-+|-+$'), '');
    return slug.isEmpty ? base : slug;
  }
}

/// 全局 Spots 缓存 Provider
final spotsCacheProvider =
    StateNotifierProvider<SpotsCacheNotifier, SpotsCacheState>((ref) {
  return SpotsCacheNotifier(ref);
});
