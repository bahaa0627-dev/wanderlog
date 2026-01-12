import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:wanderlog/features/map/data/models/public_place_dto.dart';
import 'package:wanderlog/features/map/providers/public_place_providers.dart';

const String _lastSelectedCityKey = 'last_selected_city';
const String _defaultCity = 'Paris';  // 默认城市

/// 标签统计信息
class TagStat {
  const TagStat({required this.name, required this.count});
  final String name;
  final int count;
}

/// 城市标签缓存
class CityTagCache {
  const CityTagCache({
    this.topTags = const [],
    this.placesByTag = const {},
    this.isLoadingTags = false,
  });
  
  /// Top 10 标签（按出现次数排序）
  final List<TagStat> topTags;
  
  /// 每个标签对应的 Top 50 地点
  final Map<String, List<PublicPlaceDto>> placesByTag;
  
  /// 是否正在加载标签
  final bool isLoadingTags;
  
  CityTagCache copyWith({
    List<TagStat>? topTags,
    Map<String, List<PublicPlaceDto>>? placesByTag,
    bool? isLoadingTags,
  }) => CityTagCache(
    topTags: topTags ?? this.topTags,
    placesByTag: placesByTag ?? this.placesByTag,
    isLoadingTags: isLoadingTags ?? this.isLoadingTags,
  );
}

/// 地点数据缓存状态
class PlacesCacheState {
  const PlacesCacheState({
    this.placesByCity = const {},
    this.tagCacheByCity = const {},
    this.cities = const [],
    this.isLoading = false,
    this.isInitialLoading = false,
    this.error,
    this.lastLoadedAt,
    this.lastSelectedCity,
  });
  
  /// 每个城市的 Top 20 地点
  final Map<String, List<PublicPlaceDto>> placesByCity;
  
  /// 每个城市的标签缓存
  final Map<String, CityTagCache> tagCacheByCity;
  
  final List<String> cities;
  final bool isLoading;
  final bool isInitialLoading;
  final String? error;
  final DateTime? lastLoadedAt;
  final String? lastSelectedCity;

  PlacesCacheState copyWith({
    Map<String, List<PublicPlaceDto>>? placesByCity,
    Map<String, CityTagCache>? tagCacheByCity,
    List<String>? cities,
    bool? isLoading,
    bool? isInitialLoading,
    String? error,
    DateTime? lastLoadedAt,
    String? lastSelectedCity,
  }) => PlacesCacheState(
      placesByCity: placesByCity ?? this.placesByCity,
      tagCacheByCity: tagCacheByCity ?? this.tagCacheByCity,
      cities: cities ?? this.cities,
      isLoading: isLoading ?? this.isLoading,
      isInitialLoading: isInitialLoading ?? this.isInitialLoading,
      error: error,
      lastLoadedAt: lastLoadedAt ?? this.lastLoadedAt,
      lastSelectedCity: lastSelectedCity ?? this.lastSelectedCity,
    );

  bool get hasData => placesByCity.isNotEmpty;
  
  /// 检查缓存是否过期（5分钟）
  bool get isStale {
    if (lastLoadedAt == null) return true;
    return DateTime.now().difference(lastLoadedAt!).inMinutes > 5;
  }
  
  /// 获取城市的 Top 标签
  List<TagStat> getTopTags(String city) => tagCacheByCity[city]?.topTags ?? [];
  
  /// 获取城市某个标签的地点
  List<PublicPlaceDto>? getPlacesByTag(String city, String tag) => 
      tagCacheByCity[city]?.placesByTag[tag.toLowerCase()];
}

/// 地点数据缓存 Notifier
class PlacesCacheNotifier extends StateNotifier<PlacesCacheState> {
  PlacesCacheNotifier(this._ref) : super(const PlacesCacheState()) {
    _loadLastSelectedCity();
  }
  
  final Ref _ref;
  bool _lastCityLoaded = false;
  Completer<void>? _lastCityCompleter;

  /// 加载上次选择的城市
  Future<void> _loadLastSelectedCity() async {
    _lastCityCompleter = Completer<void>();
    try {
      final prefs = await SharedPreferences.getInstance();
      final lastCity = prefs.getString(_lastSelectedCityKey);
      if (lastCity != null) {
        state = state.copyWith(lastSelectedCity: lastCity);
        print('📍 [PlacesCache] 加载上次选择的城市: $lastCity');
      }
    } catch (e) {
      print('⚠️ [PlacesCache] 加载上次选择的城市失败: $e');
    } finally {
      _lastCityLoaded = true;
      _lastCityCompleter?.complete();
    }
  }
  
  /// 等待上次选择的城市加载完成
  Future<void> _ensureLastCityLoaded() async {
    if (_lastCityLoaded) return;
    await _lastCityCompleter?.future;
  }

  /// 保存选择的城市
  Future<void> saveSelectedCity(String city) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_lastSelectedCityKey, city);
      state = state.copyWith(lastSelectedCity: city);
      print('📍 [PlacesCache] 保存选择的城市: $city');
    } catch (e) {
      print('⚠️ [PlacesCache] 保存选择的城市失败: $e');
    }
  }

  /// 快速预加载：只加载第一个城市的 Top 20 地点
  Future<void> preloadPlaces({bool force = false}) async {
    print('📍 [PlacesCache] preloadPlaces 被调用, force=$force');
    
    await _ensureLastCityLoaded();
    
    if (state.isLoading || state.isInitialLoading) {
      print('📍 [PlacesCache] 已在加载中，跳过');
      return;
    }
    if (!force && state.hasData && !state.isStale) {
      print('📍 [PlacesCache] 数据未过期，跳过');
      return;
    }

    state = state.copyWith(isInitialLoading: true, error: null);
    print('📍 [PlacesCache] 开始快速预加载...');
    final stopwatch = Stopwatch()..start();

    try {
      final repository = _ref.read(publicPlaceRepositoryProvider);
      
      // 1. 获取城市列表
      List<String> cities;
      try {
        cities = await repository.fetchCities().timeout(const Duration(seconds: 15));
        cities.sort();
        print('📍 [PlacesCache] 获取到 ${cities.length} 个城市 (${stopwatch.elapsedMilliseconds}ms)');
      } catch (e) {
        print('⚠️ [PlacesCache] 获取城市失败: $e');
        state = state.copyWith(isInitialLoading: false, error: 'Failed to load cities: $e');
        return;
      }
      
      if (cities.isEmpty) {
        state = state.copyWith(isInitialLoading: false, error: 'No cities found');
        return;
      }

      // 2. 确定目标城市
      String targetCity;
      if (state.lastSelectedCity != null && cities.contains(state.lastSelectedCity)) {
        targetCity = state.lastSelectedCity!;
      } else if (cities.contains(_defaultCity)) {
        targetCity = _defaultCity;
      } else {
        targetCity = cities.first;
      }
      
      // 3. 加载 Top 20 地点
      final placesByCity = <String, List<PublicPlaceDto>>{};
      try {
        print('📍 [PlacesCache] 正在加载 $targetCity 的 Top 20 地点...');
        final places = await repository.fetchTopPlacesByCity(
          city: targetCity,
          limit: 20,
        ).timeout(const Duration(seconds: 15));
        
        if (places.isNotEmpty) {
          placesByCity[targetCity] = places;
          print('✅ [PlacesCache] 快速加载完成: $targetCity (${places.length} 个地点, ${stopwatch.elapsedMilliseconds}ms)');
        }
      } catch (e) {
        print('⚠️ [PlacesCache] 加载 $targetCity 失败: $e');
      }

      // 4. 更新状态
      state = state.copyWith(
        placesByCity: placesByCity,
        cities: cities,
        isInitialLoading: false,
        lastLoadedAt: DateTime.now(),
      );
      
      print('✅ [PlacesCache] 初始加载完成 (${stopwatch.elapsedMilliseconds}ms)');

      // 5. 后台加载标签统计和标签地点
      _loadCityTagsInBackground(targetCity);
      
    } catch (e) {
      print('❌ [PlacesCache] 预加载失败: $e');
      state = state.copyWith(isInitialLoading: false, error: e.toString());
    }
  }

  /// 按需加载指定城市的数据
  Future<List<PublicPlaceDto>> loadCityOnDemand(String city, {String? country}) async {
    // 如果已有数据，直接返回
    final existing = state.placesByCity[city];
    if (existing != null && existing.isNotEmpty) {
      // 后台加载标签（如果还没加载）
      if (state.tagCacheByCity[city] == null) {
        _loadCityTagsInBackground(city, country: country);
      }
      return existing;
    }

    try {
      print('📍 [PlacesCache] 按需加载: $city (country: $country)');
      final repository = _ref.read(publicPlaceRepositoryProvider);
      
      // 加载 Top 20 地点
      final places = await repository.fetchTopPlacesByCity(
        city: city,
        country: country,
        limit: 20,
      ).timeout(const Duration(seconds: 15));

      if (places.isNotEmpty) {
        final updatedPlaces = Map<String, List<PublicPlaceDto>>.from(state.placesByCity);
        updatedPlaces[city] = places;
        state = state.copyWith(placesByCity: updatedPlaces);
        print('✅ [PlacesCache] 按需加载完成: $city (${places.length} 个地点)');
      }
      
      // 后台加载标签
      _loadCityTagsInBackground(city, country: country);
      
      return places;
    } catch (e) {
      print('❌ [PlacesCache] 按需加载失败: $city - $e');
      return [];
    }
  }

  /// 后台加载城市的标签统计和 Top 5 标签的地点
  Future<void> _loadCityTagsInBackground(String city, {String? country}) async {
    // 如果已经在加载或已有数据，跳过
    final existingCache = state.tagCacheByCity[city];
    if (existingCache != null && (existingCache.isLoadingTags || existingCache.topTags.isNotEmpty)) {
      return;
    }
    
    // 标记正在加载
    final updatedTagCache = Map<String, CityTagCache>.from(state.tagCacheByCity);
    updatedTagCache[city] = const CityTagCache(isLoadingTags: true);
    state = state.copyWith(tagCacheByCity: updatedTagCache);
    
    try {
      print('🏷️ [PlacesCache] 后台加载 $city 的标签统计...');
      final repository = _ref.read(publicPlaceRepositoryProvider);
      
      // 1. 获取 Top 10 标签统计
      final tagStats = await repository.fetchCityTagStats(
        city: city,
        country: country,
        limit: 10,
      ).timeout(const Duration(seconds: 10));
      
      print('🏷️ [PlacesCache] $city 的 Top 标签: ${tagStats.map((t) => '${t.name}(${t.count})').join(', ')}');
      
      // 2. 更新标签统计
      final cache = CityTagCache(
        topTags: tagStats,
        placesByTag: const {},
        isLoadingTags: false,
      );
      final updatedCache = Map<String, CityTagCache>.from(state.tagCacheByCity);
      updatedCache[city] = cache;
      state = state.copyWith(tagCacheByCity: updatedCache);
      
      // 3. 后台逐步加载 Top 5 标签的地点
      final top5Tags = tagStats.take(5).toList();
      for (final tagStat in top5Tags) {
        await _loadTagPlacesInBackground(city, tagStat.name, country: country);
        // 每个标签之间稍微延迟，避免请求过于密集
        await Future<void>.delayed(const Duration(milliseconds: 100));
      }
      
      print('✅ [PlacesCache] $city 的标签缓存加载完成');
      
    } catch (e) {
      print('⚠️ [PlacesCache] 加载 $city 标签失败: $e');
      // 标记加载完成（即使失败）
      final updatedCache = Map<String, CityTagCache>.from(state.tagCacheByCity);
      updatedCache[city] = const CityTagCache(isLoadingTags: false);
      state = state.copyWith(tagCacheByCity: updatedCache);
    }
  }

  /// 后台加载某个标签的地点
  Future<void> _loadTagPlacesInBackground(String city, String tag, {String? country}) async {
    final tagKey = tag.toLowerCase();
    
    // 如果已有数据，跳过
    final existingPlaces = state.tagCacheByCity[city]?.placesByTag[tagKey];
    if (existingPlaces != null && existingPlaces.isNotEmpty) {
      return;
    }
    
    try {
      print('🏷️ [PlacesCache] 加载 $city 的 "$tag" 标签地点...');
      final repository = _ref.read(publicPlaceRepositoryProvider);
      
      final places = await repository.fetchPlacesByCityAndTag(
        city: city,
        country: country,
        tag: tag,
        limit: 50,
      ).timeout(const Duration(seconds: 10));
      
      if (places.isNotEmpty) {
        final currentCache = state.tagCacheByCity[city] ?? const CityTagCache();
        final updatedPlacesByTag = Map<String, List<PublicPlaceDto>>.from(currentCache.placesByTag);
        updatedPlacesByTag[tagKey] = places;
        
        final updatedCache = Map<String, CityTagCache>.from(state.tagCacheByCity);
        updatedCache[city] = currentCache.copyWith(placesByTag: updatedPlacesByTag);
        state = state.copyWith(tagCacheByCity: updatedCache);
        
        print('✅ [PlacesCache] $city 的 "$tag" 标签: ${places.length} 个地点');
      }
    } catch (e) {
      print('⚠️ [PlacesCache] 加载 $city 的 "$tag" 标签失败: $e');
    }
  }

  /// 获取城市某个标签的地点（如果缓存中没有，则按需加载）
  Future<List<PublicPlaceDto>> getPlacesByTag(String city, String tag, {String? country}) async {
    final tagKey = tag.toLowerCase();
    
    // 先检查缓存
    final cached = state.tagCacheByCity[city]?.placesByTag[tagKey];
    if (cached != null && cached.isNotEmpty) {
      return cached;
    }
    
    // 按需加载
    try {
      print('🏷️ [PlacesCache] 按需加载 $city 的 "$tag" 标签地点...');
      final repository = _ref.read(publicPlaceRepositoryProvider);
      
      final places = await repository.fetchPlacesByCityAndTag(
        city: city,
        country: country,
        tag: tag,
        limit: 50,
      ).timeout(const Duration(seconds: 10));
      
      if (places.isNotEmpty) {
        final currentCache = state.tagCacheByCity[city] ?? const CityTagCache();
        final updatedPlacesByTag = Map<String, List<PublicPlaceDto>>.from(currentCache.placesByTag);
        updatedPlacesByTag[tagKey] = places;
        
        final updatedCache = Map<String, CityTagCache>.from(state.tagCacheByCity);
        updatedCache[city] = currentCache.copyWith(placesByTag: updatedPlacesByTag);
        state = state.copyWith(tagCacheByCity: updatedCache);
      }
      
      return places;
    } catch (e) {
      print('⚠️ [PlacesCache] 按需加载 $city 的 "$tag" 标签失败: $e');
      return [];
    }
  }

  /// 刷新数据
  Future<void> refresh() => preloadPlaces(force: true);
}

/// 全局地点缓存 Provider
final placesCacheProvider = StateNotifierProvider<PlacesCacheNotifier, PlacesCacheState>(
  (ref) => PlacesCacheNotifier(ref),
);
