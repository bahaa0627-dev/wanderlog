import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/core/supabase/supabase_config.dart';

/// 城市到国家的映射（用于修正数据库中的错误数据）
const Map<String, String> _cityToCountryMap = {
  // Japan
  'Tokyo': 'Japan',
  'Sapporo': 'Japan',
  'Otaru': 'Japan',
  'Asahikawa': 'Japan',
  'Yamanashi': 'Japan',
  // France
  'Paris': 'France',
  // Denmark
  'Copenhagen': 'Denmark',
  'Aarhus': 'Denmark',
  'Billund': 'Denmark',
  'Borre': 'Denmark',
  // Thailand
  'Chiang Mai': 'Thailand',
  'Bangkok': 'Thailand',
  // Indonesia
  'Ubud': 'Indonesia',
  'Bali': 'Indonesia',
  // Austria
  'Vienna': 'Austria',
  // Germany
  'Berlin': 'Germany',
  'Munich': 'Germany',
  // Italy
  'Rome': 'Italy',
  'Milan': 'Italy',
  'Florence': 'Italy',
  // Spain
  'Barcelona': 'Spain',
  'Madrid': 'Spain',
  // UK
  'London': 'United Kingdom',
  // USA
  'New York': 'United States',
  'Los Angeles': 'United States',
  'San Francisco': 'United States',
  // China
  'Beijing': 'China',
  'Shanghai': 'China',
  // South Korea
  'Seoul': 'South Korea',
  // Singapore
  'Singapore': 'Singapore',
  // Australia
  'Sydney': 'Australia',
  'Melbourne': 'Australia',
};

/// 已知的国家列表（用于判断 country 字段是否真的是国家）
const Set<String> _knownCountries = {
  'Japan',
  'France',
  'Denmark',
  'Thailand',
  'Indonesia',
  'Austria',
  'Germany',
  'Italy',
  'Spain',
  'United Kingdom',
  'United States',
  'China',
  'South Korea',
  'Singapore',
  'Australia',
  'Netherlands',
  'Belgium',
  'Switzerland',
  'Portugal',
  'Greece',
  'Turkey',
  'Vietnam',
  'Malaysia',
  'Philippines',
  'India',
  'Canada',
  'Mexico',
  'Brazil',
  'Argentina',
};

/// 国家城市数据缓存 Provider
final countriesCitiesProvider = StateNotifierProvider<CountriesCitiesNotifier, Map<String, List<String>>>((ref) {
  return CountriesCitiesNotifier(ref);
});

class CountriesCitiesNotifier extends StateNotifier<Map<String, List<String>>> {
  CountriesCitiesNotifier(this._ref) : super({});

  final Ref _ref;
  bool _isLoaded = false;
  bool _isLoading = false;

  bool get isLoaded => _isLoaded;
  bool get isLoading => _isLoading;

  /// 强制刷新数据（忽略缓存）
  Future<void> refresh() async {
    await preload(forceRefresh: true);
  }

  /// 根据 city 或 country 字段推断真正的国家
  String? _inferCountry(String? countryField, String? cityField) {
    // 1. 如果 city 在映射表中，使用映射的国家
    if (cityField != null && _cityToCountryMap.containsKey(cityField)) {
      return _cityToCountryMap[cityField];
    }
    
    // 2. 如果 country 字段是已知国家，直接使用
    if (countryField != null && _knownCountries.contains(countryField)) {
      return countryField;
    }
    
    // 3. 如果 country 字段在城市映射表中（说明它实际是城市名），使用映射的国家
    if (countryField != null && _cityToCountryMap.containsKey(countryField)) {
      return _cityToCountryMap[countryField];
    }
    
    // 4. 无法推断，返回 null
    return null;
  }

  /// 预加载国家和城市数据（直接从 Supabase）
  /// [forceRefresh] 为 true 时强制刷新，忽略缓存
  Future<void> preload({bool forceRefresh = false}) async {
    if (!forceRefresh && (_isLoaded || _isLoading)) return;
    
    _isLoading = true;
    print('📍 [CountriesCities] 开始从 Supabase 加载国家城市数据...');
    
    try {
      final client = SupabaseConfig.client;
      
      // 从 places 表获取所有国家和城市的组合
      final response = await client
          .from('places')
          .select('country, city')
          .not('city', 'is', null);
      
      final data = <String, Set<String>>{};
      
      for (final row in response as List) {
        final countryField = row['country'] as String?;
        final city = row['city'] as String?;
        
        if (city == null || city.isEmpty) continue;
        
        // 推断真正的国家
        final country = _inferCountry(countryField, city);
        
        if (country != null && country.isNotEmpty) {
          data.putIfAbsent(country, () => <String>{});
          data[country]!.add(city);
        }
      }
      
      // 转换为 Map<String, List<String>> 并排序
      final result = <String, List<String>>{};
      final sortedCountries = data.keys.toList()..sort();
      for (final country in sortedCountries) {
        final cities = data[country]!.toList()..sort();
        result[country] = cities;
      }
      
      state = result;
      _isLoaded = true;
      _isLoading = false;
      print('✅ [CountriesCities] 加载完成: ${result.length} 个国家');
      for (final entry in result.entries) {
        print('   ${entry.key}: ${entry.value.join(", ")}');
      }
    } catch (e) {
      _isLoading = false;
      print('❌ [CountriesCities] 加载失败: $e');
    }
  }

  /// 获取所有国家（已排序）
  List<String> get countries => state.keys.toList()..sort();

  /// 获取指定国家的城市列表
  List<String> getCities(String country) {
    return state[country] ?? [];
  }
}
