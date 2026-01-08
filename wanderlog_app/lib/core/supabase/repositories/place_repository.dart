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
      // Support both new category_slug and old category fields
      query = query.or('category_slug.eq.$category,category.eq.$category');
    }

    final start = (page - 1) * pageSize;
    final end = start + pageSize - 1;

    final response = await query
        .order('rating', ascending: false)
        .range(start, end);
    return (response as List).map((e) => PlaceModel.fromJson(e as Map<String, dynamic>)).toList();
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
    final response = await _client.rpc<List<dynamic>>('search_places', params: {
      'search_term': keyword,
      'limit_count': limit,
    });

    return response.map((e) => PlaceModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// 获取附近地点
  Future<List<PlaceModel>> getNearbyPlaces({
    required double latitude,
    required double longitude,
    double radiusKm = 5,
    int limit = 50,
  }) async {
    final response = await _client.rpc<List<dynamic>>('get_nearby_places', params: {
      'lat': latitude,
      'lng': longitude,
      'radius_km': radiusKm,
      'limit_count': limit,
    });

    return response.map((e) => PlaceModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// 按城市获取地点
  Future<List<PlaceModel>> getPlacesByCity(String city, {int limit = 50}) async {
    final response = await _client
        .from('places')
        .select()
        .eq('city', city)
        .order('rating', ascending: false)
        .limit(limit);

    return (response as List).map((e) => PlaceModel.fromJson(e as Map<String, dynamic>)).toList();
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
        // Support both new category_slug and old category fields
        .or('category_slug.eq.$category,category.eq.$category');

    if (city != null) {
      query = query.eq('city', city);
    }

    final response = await query
        .order('rating', ascending: false)
        .limit(limit);

    return (response as List).map((e) => PlaceModel.fromJson(e as Map<String, dynamic>)).toList();
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

    return (response as List).map((e) => PlaceModel.fromJson(e as Map<String, dynamic>)).toList();
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
    // Get categories from both new and old fields
    final response = await _client
        .from('places')
        .select('category_slug, category_en, category')
        .not('category_slug', 'is', null)
        .or('category_en.not.is.null,category.not.is.null');

    final categories = <String>{};
    
    for (final item in response as List) {
      // Prefer category_en (display name), fallback to category_slug or old category
      final categoryEn = item['category_en'] as String?;
      final categorySlug = item['category_slug'] as String?;
      final oldCategory = item['category'] as String?;
      
      final category = categoryEn ?? categorySlug ?? oldCategory;
      if (category != null && category.isNotEmpty) {
        categories.add(category);
      }
    }

    final categoriesList = categories.toList();
    categoriesList.sort();
    return categoriesList;
  }
}
