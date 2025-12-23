import 'package:wanderlog/core/supabase/supabase_config.dart';
import 'package:wanderlog/features/map/data/models/public_place_dto.dart';

/// Supabase 版本的地点仓库
class SupabasePlaceRepository {
  final _client = SupabaseConfig.client;

  /// 按城市获取地点
  Future<List<PublicPlaceDto>> fetchPlacesByCity({
    required String city,
    int limit = 120,
    int page = 1,
    double? minRating,
  }) async {
    try {
      var query = _client
          .from('places')
          .select()
          .eq('city', city);

      if (minRating != null) {
        query = query.gte('rating', minRating);
      }

      final start = (page - 1) * limit;
      final end = start + limit - 1;

      final response = await query
          .order('rating', ascending: false)
          .range(start, end);

      return (response as List)
          .map((e) => PublicPlaceDto.fromSupabase(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      throw SupabasePlaceRepositoryException('Failed to load places for $city: $e');
    }
  }

  /// 获取单个地点详情
  Future<PublicPlaceDto?> getPlaceById(String placeId) async {
    try {
      final response = await _client
          .from('places')
          .select()
          .eq('id', placeId)
          .maybeSingle();

      if (response == null) return null;
      return PublicPlaceDto.fromSupabase(response);
    } catch (e) {
      throw SupabasePlaceRepositoryException('Failed to load place $placeId: $e');
    }
  }

  /// 获取城市列表
  Future<List<String>> fetchCities({String? query}) async {
    print('📍 [SupabasePlaceRepo] fetchCities 开始');
    try {
      final response = await _client
          .from('places')
          .select('city')
          .not('city', 'is', null);

      print('📍 [SupabasePlaceRepo] fetchCities 响应: ${(response as List).length} 条');
      
      final cities = (response)
          .map((e) => e['city'] as String?)
          .where((c) => c != null && c.isNotEmpty)
          .cast<String>()
          .toSet()
          .toList();

      if (query != null && query.isNotEmpty) {
        final lowerQuery = query.toLowerCase();
        return cities.where((c) => c.toLowerCase().contains(lowerQuery)).toList();
      }

      cities.sort();
      print('📍 [SupabasePlaceRepo] fetchCities 完成: ${cities.length} 个城市');
      return cities;
    } catch (e) {
      print('❌ [SupabasePlaceRepo] fetchCities 失败: $e');
      throw SupabasePlaceRepositoryException('Failed to load cities: $e');
    }
  }

  /// 搜索地点
  Future<List<PublicPlaceDto>> searchPlaces(String keyword, {int limit = 20}) async {
    try {
      final response = await _client.rpc('search_places', params: {
        'search_term': keyword,
        'limit_count': limit,
      });

      return (response as List)
          .map((e) => PublicPlaceDto.fromSupabase(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      throw SupabasePlaceRepositoryException('Failed to search places: $e');
    }
  }

  /// 获取附近地点
  Future<List<PublicPlaceDto>> fetchNearbyPlaces({
    required double latitude,
    required double longitude,
    double radiusKm = 5,
    int limit = 50,
  }) async {
    try {
      final response = await _client.rpc('get_nearby_places', params: {
        'lat': latitude,
        'lng': longitude,
        'radius_km': radiusKm,
        'limit_count': limit,
      });

      return (response as List)
          .map((e) => PublicPlaceDto.fromSupabase(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      throw SupabasePlaceRepositoryException('Failed to load nearby places: $e');
    }
  }
}

class SupabasePlaceRepositoryException implements Exception {
  SupabasePlaceRepositoryException(this.message);
  final String message;

  @override
  String toString() => message;
}
