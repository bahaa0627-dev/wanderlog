import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/features/search/data/search_repository.dart';

/// 国家城市数据缓存 Provider
final countriesCitiesProvider = StateNotifierProvider<CountriesCitiesNotifier, Map<String, List<String>>>((ref) {
  return CountriesCitiesNotifier(ref);
});

class CountriesCitiesNotifier extends StateNotifier<Map<String, List<String>>> {
  CountriesCitiesNotifier(this._ref) : super({});

  final Ref _ref;
  bool _isLoaded = false;

  bool get isLoaded => _isLoaded;

  /// 预加载国家和城市数据
  Future<void> preload() async {
    if (_isLoaded) return;
    
    try {
      final repository = _ref.read(searchRepositoryProvider);
      final data = await repository.getCountriesAndCities();
      state = data;
      _isLoaded = true;
    } catch (e) {
      // ignore: avoid_print
      print('Error preloading countries and cities: $e');
    }
  }

  /// 获取所有国家（已排序）
  List<String> get countries => state.keys.toList()..sort();

  /// 获取指定国家的城市列表
  List<String> getCities(String country) {
    return state[country] ?? [];
  }
}
