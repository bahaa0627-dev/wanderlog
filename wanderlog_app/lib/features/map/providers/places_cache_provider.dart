import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:wanderlog/features/map/data/models/public_place_dto.dart';
import 'package:wanderlog/features/map/providers/public_place_providers.dart';

const String _lastSelectedCityKey = 'last_selected_city';

/// 地点数据缓存状态
class PlacesCacheState {
  final Map<String, List<PublicPlaceDto>> placesByCity;
  final List<String> cities;
  final bool isLoading;
  final bool isInitialLoading; // 首次快速加载
  final String? error;
  final DateTime? lastLoadedAt;
  final String? lastSelectedCity; // 用户上次选择的城市

  const PlacesCacheState({
    this.placesByCity = const {},
    this.cities = const [],
    this.isLoading = false,
    this.isInitialLoading = false,
    this.error,
    this.lastLoadedAt,
    this.lastSelectedCity,
  });

  PlacesCacheState copyWith({
    Map<String, List<PublicPlaceDto>>? placesByCity,
    List<String>? cities,
    bool? isLoading,
    bool? isInitialLoading,
    String? error,
    DateTime? lastLoadedAt,
    String? lastSelectedCity,
  }) {
    return PlacesCacheState(
      placesByCity: placesByCity ?? this.placesByCity,
      cities: cities ?? this.cities,
      isLoading: isLoading ?? this.isLoading,
      isInitialLoading: isInitialLoading ?? this.isInitialLoading,
      error: error,
      lastLoadedAt: lastLoadedAt ?? this.lastLoadedAt,
      lastSelectedCity: lastSelectedCity ?? this.lastSelectedCity,
    );
  }

  bool get hasData => placesByCity.isNotEmpty;
  
  /// 检查缓存是否过期（1分钟，更频繁刷新以获取最新数据）
  bool get isStale {
    if (lastLoadedAt == null) return true;
    return DateTime.now().difference(lastLoadedAt!).inMinutes > 1;
  }
}

/// 地点数据缓存 Notifier
class PlacesCacheNotifier extends StateNotifier<PlacesCacheState> {
  final Ref _ref;
  bool _lastCityLoaded = false;
  Completer<void>? _lastCityCompleter;

  PlacesCacheNotifier(this._ref) : super(const PlacesCacheState()) {
    _loadLastSelectedCity();
  }

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

  /// 快速预加载：只加载第一个城市的前10个地点
  Future<void> preloadPlaces({bool force = false}) async {
    print('📍 [PlacesCache] preloadPlaces 被调用, force=$force');
    
    // 确保上次选择的城市已加载
    await _ensureLastCityLoaded();
    
    print('📍 [PlacesCache] 当前状态: isLoading=${state.isLoading}, isInitialLoading=${state.isInitialLoading}, hasData=${state.hasData}, lastSelectedCity=${state.lastSelectedCity}');
    
    // 如果已经在加载或数据未过期，跳过
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
      
      // 1. 快速获取城市列表
      List<String> cities;
      try {
        print('📍 [PlacesCache] 正在获取城市列表...');
        cities = await repository.fetchCities().timeout(
          const Duration(seconds: 15),
        );
        cities.sort(); // 按字母排序
        print('📍 [PlacesCache] 获取到 ${cities.length} 个城市 (${stopwatch.elapsedMilliseconds}ms)');
      } catch (e) {
        print('⚠️ [PlacesCache] 获取城市失败: $e');
        state = state.copyWith(
          isInitialLoading: false,
          error: 'Failed to load cities: $e',
        );
        return;
      }
      
      if (cities.isEmpty) {
        print('⚠️ [PlacesCache] 没有找到城市');
        state = state.copyWith(
          isInitialLoading: false,
          error: 'No cities found',
        );
        return;
      }

      // 2. 优先加载用户上次选择的城市，否则加载第一个城市
      final targetCity = (state.lastSelectedCity != null && cities.contains(state.lastSelectedCity))
          ? state.lastSelectedCity!
          : cities.first;
      
      final Map<String, List<PublicPlaceDto>> placesByCity = {};
      
      try {
        print('📍 [PlacesCache] 正在加载 $targetCity 的地点...');
        final places = await repository.fetchPlacesByCity(
          city: targetCity,
          limit: 10, // 只加载10个
          minRating: 0.0,
        ).timeout(const Duration(seconds: 15));
        
        if (places.isNotEmpty) {
          placesByCity[targetCity] = places;
          print('✅ [PlacesCache] 快速加载完成: $targetCity (${places.length} 个地点, ${stopwatch.elapsedMilliseconds}ms)');
        } else {
          print('⚠️ [PlacesCache] $targetCity 没有地点数据');
        }
      } catch (e) {
        print('⚠️ [PlacesCache] 加载 $targetCity 失败: $e');
      }

      // 3. 更新状态，标记初始加载完成
      state = state.copyWith(
        placesByCity: placesByCity,
        cities: cities,
        isInitialLoading: false,
        lastLoadedAt: DateTime.now(),
      );
      
      print('✅ [PlacesCache] 初始加载完成 (${stopwatch.elapsedMilliseconds}ms)');

      // 4. 后台继续加载其他城市和更多数据
      _loadRemainingCitiesInBackground(cities, placesByCity);
      
    } catch (e) {
      print('❌ [PlacesCache] 预加载失败: $e');
      state = state.copyWith(
        isInitialLoading: false,
        error: e.toString(),
      );
    }
  }

  /// 后台加载剩余城市数据
  Future<void> _loadRemainingCitiesInBackground(
    List<String> cities,
    Map<String, List<PublicPlaceDto>> initialPlaces,
  ) async {
    if (state.isLoading) return;
    
    state = state.copyWith(isLoading: true);
    print('📍 [PlacesCache] 后台加载剩余城市...');

    try {
      final repository = _ref.read(publicPlaceRepositoryProvider);
      final Map<String, List<PublicPlaceDto>> placesByCity = Map.from(initialPlaces);
      
      // 加载所有城市的完整数据
      for (final city in cities) {
        try {
          final places = await repository.fetchPlacesByCity(
            city: city,
            limit: 200,
            minRating: 0.0,
          ).timeout(const Duration(seconds: 10));
          
          if (places.isNotEmpty) {
            placesByCity[city] = places;
          }
        } catch (e) {
          print('⚠️ [PlacesCache] 后台加载 $city 失败: $e');
        }
      }

      state = state.copyWith(
        placesByCity: placesByCity,
        cities: placesByCity.keys.toList()..sort(),
        isLoading: false,
        lastLoadedAt: DateTime.now(),
      );
      
      print('✅ [PlacesCache] 后台加载完成: ${placesByCity.length} 个城市');
    } catch (e) {
      print('❌ [PlacesCache] 后台加载失败: $e');
      state = state.copyWith(isLoading: false);
    }
  }

  /// 刷新数据
  Future<void> refresh() => preloadPlaces(force: true);
}

/// 全局地点缓存 Provider
final placesCacheProvider = StateNotifierProvider<PlacesCacheNotifier, PlacesCacheState>((ref) {
  return PlacesCacheNotifier(ref);
});
