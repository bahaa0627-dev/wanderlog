import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/place_model.dart';
import '../supabase_config.dart';

/// 地点数据仓库
class PlaceRepository {
  final SupabaseClient _client;

  PlaceRepository([SupabaseClient? client])
      : _client = client ?? SupabaseConfig.client;

  /// 获取地点列表 (分页)
  Future<List<PlaceModel>> getPlaces({
    String? city,
    String? category,
    int page = 1,
    int pageSize = 20,
  }) async {
    var query = _client.from('places').select();

    if (city != null && city.isNotEmpty) {
      query = query.eq('city', city);
    }
    if (category != null && category.isNotEmpty) {
      query = query.eq('category', category);
    }

    final start = (page - 1) * pageSize;
    final end = start + pageSize - 1;

    final response = await query
        .order('rating', ascending: false)
        .range(start, end);
    return (response as List).map((e) => PlaceModel.fromJson(e)).toList();
  }

  /// 获取单个地点详情
  Future<PlaceModel?> getPlace(String id) async {
    final response = await _client
        .from('places')
        .select()
        .eq('id', id)
        .maybeSingle();

    if (response == null) return null;
    return PlaceModel.fromJson(response);
  }

  /// 搜索地点
  Future<List<PlaceModel>> searchPlaces(String keyword, {int limit = 20}) async {
    final response = await _client.rpc('search_places', params: {
      'search_term': keyword,
      'limit_count': limit,
    });

    return (response as List).map((e) => PlaceModel.fromJson(e)).toList();
  }

  /// 获取附近地点
  Future<List<PlaceModel>> getNearbyPlaces({
    required double latitude,
    required double longitude,
    double radiusKm = 5,
    int limit = 50,
  }) async {
    final response = await _client.rpc('get_nearby_places', params: {
      'lat': latitude,
      'lng': longitude,
      'radius_km': radiusKm,
      'limit_count': limit,
    });

    return (response as List).map((e) => PlaceModel.fromJson(e)).toList();
  }

  /// 按城市获取地点
  Future<List<PlaceModel>> getPlacesByCity(String city, {int limit = 50}) async {
    final response = await _client
        .from('places')
        .select()
        .eq('city', city)
        .order('rating', ascending: false)
        .limit(limit);

    return (response as List).map((e) => PlaceModel.fromJson(e)).toList();
  }

  /// 按分类获取地点
  Future<List<PlaceModel>> getPlacesByCategory(
    String category, {
    String? city,
    int limit = 50,
  }) async {
    var query = _client
        .from('places')
        .select()
        .eq('category', category);

    if (city != null) {
      query = query.eq('city', city);
    }

    final response = await query
        .order('rating', ascending: false)
        .limit(limit);

    return (response as List).map((e) => PlaceModel.fromJson(e)).toList();
  }

  /// 获取热门地点
  Future<List<PlaceModel>> getPopularPlaces({int limit = 20}) async {
    final response = await _client
        .from('places')
        .select()
        .not('rating', 'is', null)
        .order('rating', ascending: false)
        .order('rating_count', ascending: false)
        .limit(limit);

    return (response as List).map((e) => PlaceModel.fromJson(e)).toList();
  }

  /// 获取所有城市列表
  Future<List<String>> getCities() async {
    final response = await _client
        .from('places')
        .select('city')
        .not('city', 'is', null);

    final cities = (response as List)
        .map((e) => e['city'] as String?)
        .where((c) => c != null && c.isNotEmpty)
        .cast<String>()
        .toSet()
        .toList();

    cities.sort();
    return cities;
  }

  /// 获取所有分类列表
  Future<List<String>> getCategories() async {
    final response = await _client
        .from('places')
        .select('category')
        .not('category', 'is', null);

    final categories = (response as List)
        .map((e) => e['category'] as String?)
        .where((c) => c != null && c.isNotEmpty)
        .cast<String>()
        .toSet()
        .toList();

    categories.sort();
    return categories;
  }
}
