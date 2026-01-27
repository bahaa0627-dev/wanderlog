import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:wanderlog/core/providers/dio_provider.dart';

/// 城市数据（带地点数量）
class CityStats {
  const CityStats({
    required this.name,
    required this.placeCount,
  });

  final String name;
  final int placeCount;

  factory CityStats.fromJson(Map<String, dynamic> json) => CityStats(
        name: json['name'] as String,
        placeCount: json['placeCount'] as int,
      );
}

/// 国家数据（带地点数量和城市列表）
class CountryStats {
  const CountryStats({
    required this.name,
    required this.placeCount,
    required this.cities,
  });

  final String name;
  final int placeCount;
  final List<CityStats> cities;

  factory CountryStats.fromJson(String name, Map<String, dynamic> json) =>
      CountryStats(
        name: name,
        placeCount: json['placeCount'] as int,
        cities: (json['cities'] as List)
            .map((c) => CityStats.fromJson(c as Map<String, dynamic>))
            .toList(),
      );
}

/// 国家城市统计数据状态
class CountriesCitiesStatsState {
  const CountriesCitiesStatsState({
    this.countries = const [],
    this.isLoading = false,
    this.error,
    this.lastLoadedAt,
  });

  final List<CountryStats> countries;
  final bool isLoading;
  final String? error;
  final DateTime? lastLoadedAt;

  CountriesCitiesStatsState copyWith({
    List<CountryStats>? countries,
    bool? isLoading,
    String? error,
    DateTime? lastLoadedAt,
  }) =>
      CountriesCitiesStatsState(
        countries: countries ?? this.countries,
        isLoading: isLoading ?? this.isLoading,
        error: error,
        lastLoadedAt: lastLoadedAt ?? this.lastLoadedAt,
      );

  bool get hasData => countries.isNotEmpty;

  /// 缓存是否过期（5分钟）
  bool get isStale {
    if (lastLoadedAt == null) return true;
    return DateTime.now().difference(lastLoadedAt!).inMinutes > 5;
  }

  /// 获取所有国家名称
  List<String> get countryNames => countries.map((c) => c.name).toList();

  /// 获取指定国家的城市列表
  List<CityStats> getCities(String country) {
    final countryStats = countries.firstWhere(
      (c) => c.name == country,
      orElse: () => const CountryStats(name: '', placeCount: 0, cities: []),
    );
    return countryStats.cities;
  }

  /// 获取指定国家的城市名称列表
  List<String> getCityNames(String country) =>
      getCities(country).map((c) => c.name).toList();
}

/// 国家城市统计数据 Notifier
class CountriesCitiesStatsNotifier
    extends StateNotifier<CountriesCitiesStatsState> {
  CountriesCitiesStatsNotifier(this._ref)
      : super(const CountriesCitiesStatsState()) {
    // 立即从本地缓存加载数据
    _loadFromLocalCache();
  }

  final Ref _ref;
  static const String _cacheKey = 'countries_cities_stats_cache';
  static const String _cacheTimestampKey = 'countries_cities_stats_timestamp';

  /// 获取 Dio 实例
  Dio get _dio => _ref.read(dioProvider);

  /// 从本地缓存加载（同步显示，避免白屏）
  Future<void> _loadFromLocalCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final cachedData = prefs.getString(_cacheKey);
      final cachedTimestamp = prefs.getInt(_cacheTimestampKey);
      
      if (cachedData != null && cachedTimestamp != null) {
        final lastLoadedAt = DateTime.fromMillisecondsSinceEpoch(cachedTimestamp);
        final data = jsonDecode(cachedData) as Map<String, dynamic>;
        final countries = <CountryStats>[];
        
        for (final entry in data.entries) {
          countries.add(CountryStats.fromJson(
            entry.key,
            entry.value as Map<String, dynamic>,
          ));
        }
        countries.sort((a, b) => a.name.compareTo(b.name));
        
        state = state.copyWith(
          countries: countries,
          lastLoadedAt: lastLoadedAt,
        );
        print('💾 [CountriesCitiesStats] 从本地缓存加载: ${countries.length} 个国家');
      }
    } catch (e) {
      print('⚠️ [CountriesCitiesStats] 本地缓存加载失败: $e');
    }
  }

  /// 保存到本地缓存
  Future<void> _saveToLocalCache(Map<String, dynamic> data) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_cacheKey, jsonEncode(data));
      await prefs.setInt(_cacheTimestampKey, DateTime.now().millisecondsSinceEpoch);
      print('💾 [CountriesCitiesStats] 已保存到本地缓存');
    } catch (e) {
      print('⚠️ [CountriesCitiesStats] 保存本地缓存失败: $e');
    }
  }

  /// 加载数据（从后端 API）
  Future<void> load({bool forceRefresh = false}) async {
    if (!forceRefresh && state.hasData && !state.isStale) return;
    if (state.isLoading) return;

    // 如果已有缓存数据，不显示 loading 状态，后台静默刷新
    final hasExistingData = state.hasData;
    if (!hasExistingData) {
      state = state.copyWith(isLoading: true, error: null);
    }
    
    print('📍 [CountriesCitiesStats] 开始从 API 加载国家城市统计数据...');

    try {
      final response = await _dio.get<Map<String, dynamic>>(
        'public-places/countries-cities-stats',
      );

      if (response.statusCode != 200) {
        throw Exception('API 请求失败: ${response.statusCode}');
      }

      final json = response.data!;
      if (json['success'] != true) {
        throw Exception(json['error'] ?? 'Unknown error');
      }

      final data = json['data'] as Map<String, dynamic>;
      final countries = <CountryStats>[];

      for (final entry in data.entries) {
        countries.add(CountryStats.fromJson(
          entry.key,
          entry.value as Map<String, dynamic>,
        ));
      }

      // 按国家名称字母排序
      countries.sort((a, b) => a.name.compareTo(b.name));

      state = state.copyWith(
        countries: countries,
        isLoading: false,
        lastLoadedAt: DateTime.now(),
      );

      // 保存到本地缓存
      _saveToLocalCache(data);

      print('✅ [CountriesCitiesStats] 加载完成: ${countries.length} 个国家');
    } catch (e) {
      print('❌ [CountriesCitiesStats] 加载失败: $e');
      // 如果有缓存数据，不覆盖，只标记加载结束
      if (hasExistingData) {
        state = state.copyWith(isLoading: false);
      } else {
        state = state.copyWith(
          isLoading: false,
          error: e.toString(),
        );
      }
    }
  }

  /// 强制刷新
  Future<void> refresh() => load(forceRefresh: true);
}

/// 国家城市统计数据 Provider
final countriesCitiesStatsProvider = StateNotifierProvider<
    CountriesCitiesStatsNotifier, CountriesCitiesStatsState>(
  (ref) => CountriesCitiesStatsNotifier(ref),
);
