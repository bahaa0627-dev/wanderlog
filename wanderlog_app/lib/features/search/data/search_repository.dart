import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// 搜索数据仓库
class SearchRepository {
  SearchRepository({Dio? dio}) : _dio = dio ?? Dio();

  final Dio _dio;

  String get _baseUrl => dotenv.env['API_BASE_URL'] ?? 'http://127.0.0.1:3000/api';

  /// 获取国家和城市列表（按国家分组）
  Future<Map<String, List<String>>> getCountriesAndCities() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('$_baseUrl/public-places/countries-cities');
      
      if (response.statusCode == 200 && response.data?['success'] == true) {
        final data = response.data!['data'] as Map<String, dynamic>;
        final result = <String, List<String>>{};
        
        data.forEach((country, cities) {
          result[country] = (cities as List).cast<String>();
        });
        
        return result;
      }
      
      throw Exception('Failed to load countries and cities');
    } catch (e) {
      // ignore: avoid_print
      print('Error fetching countries and cities: $e');
      rethrow;
    }
  }

  /// 按城市和标签搜索地点
  Future<SearchResult> searchPlaces({
    required String city,
    required String country,
    List<String>? tags,
    int limit = 50,
  }) async {
    try {
      final queryParams = <String, dynamic>{
        'city': city,
        'country': country,
        'limit': limit,
      };
      
      if (tags != null && tags.isNotEmpty) {
        queryParams['tags'] = tags.join(',');
      }

      final url = '$_baseUrl/public-places/search-by-filters';
      print('🌐 API Request: $url');
      print('🌐 Params: $queryParams');

      final response = await _dio.get<Map<String, dynamic>>(
        url,
        queryParameters: queryParams,
      );
      
      print('🌐 Response status: ${response.statusCode}');
      print('🌐 Response data keys: ${response.data?.keys}');
      
      if (response.statusCode == 200 && response.data?['success'] == true) {
        final dataList = response.data!['data'] as List;
        print('🌐 Data count: ${dataList.length}');
        
        final places = dataList
            .map((e) => SearchPlaceResult.fromJson(e as Map<String, dynamic>))
            .toList();
        
        return SearchResult(
          places: places,
          total: (response.data!['total'] as int?) ?? places.length,
          isAiGenerated: (response.data!['isAiGenerated'] as bool?) ?? false,
        );
      }
      
      throw Exception('Failed to search places: ${response.data}');
    } catch (e) {
      print('❌ API Error: $e');
      rethrow;
    }
  }

  /// 使用 AI 生成地点（当数据库没有匹配结果时）
  Future<SearchResult> generatePlacesWithAI({
    required String city,
    required String country,
    required List<String> tags,
    int maxPerCategory = 10,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '$_baseUrl/public-places/ai-generate',
        data: {
          'city': city,
          'country': country,
          'tags': tags,
          'maxPerCategory': maxPerCategory,
        },
      );
      
      if (response.statusCode == 200 && response.data?['success'] == true) {
        final places = (response.data!['data'] as List)
            .map((e) => SearchPlaceResult.fromJson(e as Map<String, dynamic>))
            .toList();
        
        return SearchResult(
          places: places,
          total: places.length,
          isAiGenerated: true,
        );
      }
      
      throw Exception('Failed to generate places with AI');
    } catch (e) {
      // ignore: avoid_print
      print('Error generating places with AI: $e');
      rethrow;
    }
  }
}

/// 搜索结果
class SearchResult {
  SearchResult({
    required this.places,
    required this.total,
    this.isAiGenerated = false,
  });

  final List<SearchPlaceResult> places;
  final int total;
  final bool isAiGenerated;
}

/// 搜索地点结果
class SearchPlaceResult {
  SearchPlaceResult({
    required this.id,
    required this.name,
    required this.latitude,
    required this.longitude,
    this.city,
    this.country,
    this.address,
    this.rating,
    this.ratingCount,
    this.category,
    this.categorySlug,
    this.categoryEn,
    this.categoryZh,
    this.coverImage,
    this.images = const [],
    this.tags = const [],
    this.aiSummary,
  });

  factory SearchPlaceResult.fromJson(Map<String, dynamic> json) {
    List<String> parseStringList(dynamic value) {
      if (value == null) return [];
      if (value is List) return value.map((e) => e.toString()).toList();
      if (value is String) {
        try {
          // 尝试解析 JSON 字符串
          if (value.startsWith('[')) {
            final decoded = List<dynamic>.from(
              (value as dynamic) is String ? [] : value as List,
            );
            return decoded.map((e) => e.toString()).toList();
          }
          return [value];
        } catch (_) {
          return [value];
        }
      }
      return [];
    }

    return SearchPlaceResult(
      id: json['id'] as String,
      name: json['name'] as String,
      city: json['city'] as String?,
      country: json['country'] as String?,
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      address: json['address'] as String?,
      rating: json['rating'] != null ? (json['rating'] as num).toDouble() : null,
      ratingCount: json['ratingCount'] as int?,
      category: json['category'] as String?,
      categorySlug: json['category_slug'] as String? ?? json['categorySlug'] as String?,
      categoryEn: json['category_en'] as String? ?? json['categoryEn'] as String?,
      categoryZh: json['category_zh'] as String? ?? json['categoryZh'] as String?,
      coverImage: json['coverImage'] as String?,
      images: parseStringList(json['images']),
      tags: parseStringList(json['aiTags'] ?? json['tags']),
      aiSummary: json['aiSummary'] as String?,
    );
  }

  final String id;
  final String name;
  final String? city;
  final String? country;
  final double latitude;
  final double longitude;
  final String? address;
  final double? rating;
  final int? ratingCount;
  final String? category;
  final String? categorySlug;
  final String? categoryEn;
  final String? categoryZh;
  final String? coverImage;
  final List<String> images;
  final List<String> tags;
  final String? aiSummary;
}

/// Provider
final searchRepositoryProvider = Provider<SearchRepository>((ref) {
  return SearchRepository();
});
