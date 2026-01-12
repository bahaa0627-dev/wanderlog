import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:wanderlog/core/supabase/supabase_config.dart';
import 'package:wanderlog/features/map/data/models/public_place_dto.dart';
import 'package:wanderlog/features/map/providers/places_cache_provider.dart';

/// Supabase 版本的地点仓库
class SupabasePlaceRepository {
  final _client = SupabaseConfig.client;
  final _dio = Dio();
  
  /// 获取后端 API 基础 URL
  String get _apiBaseUrl =>
      dotenv.env['API_BASE_URL'] ?? 'http://127.0.0.1:3000/api';

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
      // 使用分页获取所有城市，避免默认 1000 行限制
      final allCities = <String>{};
      int offset = 0;
      const batchSize = 1000;
      
      while (true) {
        final response = await _client
            .from('places')
            .select('city')
            .not('city', 'is', null)
            .range(offset, offset + batchSize - 1);

        final batch = (response as List)
            .map((e) => e['city'] as String?)
            .where((c) => c != null && c.isNotEmpty)
            .cast<String>();
        
        allCities.addAll(batch);
        
        if ((response).length < batchSize) {
          break;  // 没有更多数据了
        }
        offset += batchSize;
      }

      print('📍 [SupabasePlaceRepo] fetchCities 完成: ${allCities.length} 个城市');
      
      var cities = allCities.toList();

      if (query != null && query.isNotEmpty) {
        final lowerQuery = query.toLowerCase();
        return cities.where((c) => c.toLowerCase().contains(lowerQuery)).toList();
      }

      cities.sort();
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
      },);

      return (response as List)
          .map((e) => PublicPlaceDto.fromSupabase(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      throw SupabasePlaceRepositoryException('Failed to search places: $e');
    }
  }

  /// 按城市搜索地点（调用后端 API）
  Future<List<PublicPlaceDto>> searchPlacesByCity({
    required String query,
    required String city,
    String? country,
    int limit = 50,
  }) async {
    try {
      print('🔍 [SupabasePlaceRepo] searchPlacesByCity: query=$query, city=$city, country=$country');
      
      final queryParams = <String, dynamic>{
        'q': query,
        'city': city,
      };
      if (country != null && country.isNotEmpty) {
        queryParams['country'] = country;
      }
      
      final response = await _dio.get<Map<String, dynamic>>(
        '$_apiBaseUrl/public-places/search',
        queryParameters: queryParams,
      );
      
      if (response.data?['success'] == true) {
        final data = (response.data!['data'] as List<dynamic>?) ?? [];
        
        final result = data.map((p) {
          final place = p as Map<String, dynamic>;
          return PublicPlaceDto.fromJson(place);
        }).toList();
        
        print('✅ [SupabasePlaceRepo] searchPlacesByCity: 返回 ${result.length} 个地点');
        return result;
      }
      
      return [];
    } catch (e) {
      print('❌ [SupabasePlaceRepo] searchPlacesByCity 失败: $e');
      return [];
    }
  }

  /// 获取城市 Top N 评分人数最多的地点
  /// 按 rating_count 降序排列，然后按 rating 降序排列
  Future<List<PublicPlaceDto>> fetchTopPlacesByCity({
    required String city,
    String? country,
    int limit = 20,
  }) async {
    try {
      print('🔍 [SupabasePlaceRepo] fetchTopPlacesByCity: city=$city, country=$country, limit=$limit');
      var query = _client
          .from('places')
          .select()
          .eq('city', city);

      if (country != null && country.isNotEmpty) {
        query = query.eq('country', country);
      }

      final response = await query
          .order('rating_count', ascending: false, nullsFirst: false)
          .order('rating', ascending: false, nullsFirst: false)
          .limit(limit);

      // Debug: log first result to see raw data
      if ((response as List).isNotEmpty) {
        final first = response.first as Map<String, dynamic>;
        print('🔍 [SupabasePlaceRepo] First result name: ${first['name']}');
        print('🔍 [SupabasePlaceRepo] First result tags: ${first['tags']}');
        print('🔍 [SupabasePlaceRepo] First result ai_tags: ${first['ai_tags']}');
      }      final results = (response as List)
          .map((e) => PublicPlaceDto.fromSupabase(e as Map<String, dynamic>))
          .toList();
      print('✅ [SupabasePlaceRepo] fetchTopPlacesByCity: 返回 ${results.length} 条结果');
      return results;
    } catch (e) {
      print('❌ [SupabasePlaceRepo] fetchTopPlacesByCity 失败: $e');
      throw SupabasePlaceRepositoryException('Failed to load top places for $city: $e');
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
      },);

      return (response as List)
          .map((e) => PublicPlaceDto.fromSupabase(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      throw SupabasePlaceRepositoryException('Failed to load nearby places: $e');
    }
  }

  /// 获取城市的 Top N 标签统计（调用后端 API）
  Future<List<TagStat>> fetchCityTagStats({
    required String city,
    String? country,
    int limit = 10,
  }) async {
    try {
      print('🏷️ [SupabasePlaceRepo] fetchCityTagStats: city=$city, country=$country, limit=$limit');
      
      final queryParams = <String, dynamic>{
        'city': city,
        'limit': limit.toString(),
      };
      if (country != null && country.isNotEmpty) {
        queryParams['country'] = country;
      }
      
      final response = await _dio.get<Map<String, dynamic>>(
        '$_apiBaseUrl/public-places/city-tag-stats',
        queryParameters: queryParams,
      );
      
      if (response.data?['success'] == true) {
        final data = response.data!['data'] as Map<String, dynamic>;
        final tags = (data['tags'] as List<dynamic>?) ?? [];
        
        final result = tags.map((t) {
          final tag = t as Map<String, dynamic>;
          return TagStat(
            name: tag['name'] as String? ?? '',
            count: tag['count'] as int? ?? 0,
          );
        }).toList();
        
        print('✅ [SupabasePlaceRepo] fetchCityTagStats: 返回 ${result.length} 个标签');
        return result;
      }
      
      return [];
    } catch (e) {
      print('❌ [SupabasePlaceRepo] fetchCityTagStats 失败: $e');
      // 失败时返回空列表，不抛出异常
      return [];
    }
  }

  /// 按城市和单个标签筛选地点（调用后端 API）
  Future<List<PublicPlaceDto>> fetchPlacesByCityAndTag({
    required String city,
    String? country,
    required String tag,
    int limit = 50,
  }) async {
    try {
      print('🏷️ [SupabasePlaceRepo] fetchPlacesByCityAndTag: city=$city, tag=$tag, limit=$limit');
      
      final queryParams = <String, dynamic>{
        'city': city,
        'tag': tag,
        'limit': limit.toString(),
      };
      if (country != null && country.isNotEmpty) {
        queryParams['country'] = country;
      }
      
      final response = await _dio.get<Map<String, dynamic>>(
        '$_apiBaseUrl/public-places/places-by-tag',
        queryParameters: queryParams,
      );
      
      if (response.data?['success'] == true) {
        final data = (response.data!['data'] as List<dynamic>?) ?? [];
        
        final result = data.map((p) {
          final place = p as Map<String, dynamic>;
          return PublicPlaceDto.fromJson(place);
        }).toList();
        
        print('✅ [SupabasePlaceRepo] fetchPlacesByCityAndTag: 返回 ${result.length} 个地点');
        return result;
      }
      
      return [];
    } catch (e) {
      print('❌ [SupabasePlaceRepo] fetchPlacesByCityAndTag 失败: $e');
      // 失败时返回空列表，不抛出异常
      return [];
    }
  }
}

class SupabasePlaceRepositoryException implements Exception {
  SupabasePlaceRepositoryException(this.message);
  final String message;

  @override
  String toString() => message;
}
