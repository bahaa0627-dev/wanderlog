import 'dart:convert';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

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
      : super(const CountriesCitiesStatsState());

  final Ref _ref;

  /// 获取 API 基础 URL
  String get _apiBaseUrl =>
      dotenv.env['API_BASE_URL'] ?? 'http://127.0.0.1:3000/api';

  /// 加载数据（从后端 API）
  Future<void> load({bool forceRefresh = false}) async {
    if (!forceRefresh && state.hasData && !state.isStale) return;
    if (state.isLoading) return;

    state = state.copyWith(isLoading: true, error: null);
    print('📍 [CountriesCitiesStats] 开始从 API 加载国家城市统计数据...');
    print('📍 [CountriesCitiesStats] API URL: $_apiBaseUrl');

    try {
      final url = Uri.parse('$_apiBaseUrl/public-places/countries-cities-stats');
      final response = await http.get(url).timeout(const Duration(seconds: 30));

      if (response.statusCode != 200) {
        throw Exception('API 请求失败: ${response.statusCode}');
      }

      final json = jsonDecode(response.body) as Map<String, dynamic>;
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

      print('✅ [CountriesCitiesStats] 加载完成: ${countries.length} 个国家');
      for (final country in countries) {
        print(
            '   ${country.name} (${country.placeCount}): ${country.cities.map((c) => "${c.name}(${c.placeCount})").join(", ")}');
      }
    } catch (e) {
      print('❌ [CountriesCitiesStats] 加载失败: $e');
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
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
