import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/features/map/data/models/public_place_dto.dart';
import 'package:wanderlog/features/map/providers/public_place_providers.dart';

/// 地点数据缓存状态
class PlacesCacheState {
  final Map<String, List<PublicPlaceDto>> placesByCity;
  final List<String> cities;
  final bool isLoading;
  final String? error;
  final DateTime? lastLoadedAt;

  const PlacesCacheState({
    this.placesByCity = const {},
    this.cities = const [],
    this.isLoading = false,
    this.error,
    this.lastLoadedAt,
  });

  PlacesCacheState copyWith({
    Map<String, List<PublicPlaceDto>>? placesByCity,
    List<String>? cities,
    bool? isLoading,
    String? error,
    DateTime? lastLoadedAt,
  }) {
    return PlacesCacheState(
      placesByCity: placesByCity ?? this.placesByCity,
      cities: cities ?? this.cities,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      lastLoadedAt: lastLoadedAt ?? this.lastLoadedAt,
    );
  }

  bool get hasData => placesByCity.isNotEmpty;
  
  /// 检查缓存是否过期（5分钟）
  bool get isStale {
    if (lastLoadedAt == null) return true;
    return DateTime.now().difference(lastLoadedAt!).inMinutes > 5;
  }
}

/// 地点数据缓存 Notifier
class PlacesCacheNotifier extends StateNotifier<PlacesCacheState> {
  final Ref _ref;

  PlacesCacheNotifier(this._ref) : super(const PlacesCacheState());

  /// 预加载所有城市的地点数据
  Future<void> preloadPlaces({bool force = false}) async {
    // 如果已经在加载或数据未过期，跳过
    if (state.isLoading) return;
    if (!force && state.hasData && !state.isStale) return;

    state = state.copyWith(isLoading: true, error: null);

    try {
      final repository = _ref.read(publicPlaceRepositoryProvider);
      
      // 获取城市列表
      List<String> cities;
      try {
        cities = await repository.fetchCities().timeout(
          const Duration(seconds: 10),
        );
      } catch (e) {
        print('⚠️ Timeout or error fetching cities: $e');
        state = state.copyWith(
          isLoading: false,
          error: 'Failed to load cities',
        );
        return;
      }
      
      if (cities.isEmpty) {
        state = state.copyWith(
          isLoading: false,
          error: 'No cities found',
        );
        return;
      }
      
      // 并行加载所有城市的数据
      final Map<String, List<PublicPlaceDto>> placesByCity = {};
      
      await Future.wait(
        cities.map((city) async {
          try {
            final places = await repository.fetchPlacesByCity(
              city: city,
              limit: 200,
              minRating: 0.0,
            ).timeout(const Duration(seconds: 15));
            if (places.isNotEmpty) {
              placesByCity[city] = places;
            }
          } catch (e) {
            print('⚠️ Failed to load places for $city: $e');
          }
        }),
      );

      state = state.copyWith(
        placesByCity: placesByCity,
        cities: placesByCity.keys.toList()..sort(),
        isLoading: false,
        lastLoadedAt: DateTime.now(),
      );
      
      print('✅ Preloaded ${placesByCity.length} cities with places');
    } catch (e) {
      print('❌ Error preloading places: $e');
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
  }

  /// 刷新数据
  Future<void> refresh() => preloadPlaces(force: true);
}

/// 全局地点缓存 Provider
final placesCacheProvider = StateNotifierProvider<PlacesCacheNotifier, PlacesCacheState>((ref) {
  return PlacesCacheNotifier(ref);
});
