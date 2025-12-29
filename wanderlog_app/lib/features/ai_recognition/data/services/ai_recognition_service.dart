import 'dart:io';
import 'dart:math';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:google_generative_ai/google_generative_ai.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:wanderlog/features/ai_recognition/data/models/ai_recognition_result.dart';
import 'package:wanderlog/core/supabase/repositories/place_repository.dart';
import 'package:wanderlog/core/supabase/supabase_config.dart';
import 'package:wanderlog/core/supabase/services/image_service.dart';
import 'package:wanderlog/core/supabase/services/quota_service.dart';
import 'dart:convert';
import 'package:uuid/uuid.dart';

/// HTTP代理覆盖类
class _ProxyHttpOverrides extends HttpOverrides {
  _ProxyHttpOverrides(this.proxyUrl);
  
  final String proxyUrl;

  @override
  HttpClient createHttpClient(SecurityContext? context) {
    final client = super.createHttpClient(context);
    client.findProxy = (uri) {
      final proxy = proxyUrl
          .replaceAll('http://', '')
          .replaceAll('https://', '')
          .replaceAll('socks5://', '');
      return 'PROXY $proxy';
    };
    client.connectionTimeout = const Duration(seconds: 60);
    client.badCertificateCallback = (cert, host, port) => true;
    return client;
  }
}

/// 用户查询意图解析结果
class QueryIntent {
  final String? city;
  final String? country;
  final String? category;
  final List<String> tags;
  final int? limit;
  final bool wantsPopular;
  final bool wantsRandom;
  final String? specificPlaceName;
  final String? nearbyLocation; // 附近搜索的地点名称
  final bool wantsNearMe; // 用户说"我附近"

  QueryIntent({
    this.city,
    this.country,
    this.category,
    this.tags = const [],
    this.limit,
    this.wantsPopular = false,
    this.wantsRandom = false,
    this.specificPlaceName,
    this.nearbyLocation,
    this.wantsNearMe = false,
  });

  factory QueryIntent.fromJson(Map<String, dynamic> json) {
    return QueryIntent(
      city: json['city'] as String?,
      country: json['country'] as String?,
      category: json['category'] as String?,
      tags: (json['tags'] as List?)?.map((e) => e.toString()).toList() ?? [],
      limit: json['limit'] as int?,
      wantsPopular: json['wants_popular'] as bool? ?? false,
      wantsRandom: json['wants_random'] as bool? ?? false,
      specificPlaceName: json['specific_place_name'] as String?,
      nearbyLocation: json['nearby_location'] as String?,
      wantsNearMe: json['wants_near_me'] as bool? ?? false,
    );
  }

  @override
  String toString() => 'QueryIntent(city: $city, category: $category, tags: $tags, limit: $limit, nearbyLocation: $nearbyLocation, wantsNearMe: $wantsNearMe)';
}

/// AI识别服务
class AIRecognitionService {
  AIRecognitionService({required Dio dio}) : _dio = dio;

  /// 允许的 ai_tags 列表（限定范围）
  static const List<String> _allowedTags = [
    'Museum', 'Attractions', 'Park', 'Cemetery', 'Hiking', 
    'Cafe', 'Bakery', 'Vintage', 'Secondhand', 'Store', 
    'Brunch', 'Restaurant', 'Knitting', 'Art', 'Architecture', 
    'Historical', 'Landmark', 'Vegetarian', 'Buddhism', 'Church', 
    'Temple', 'Shopping', 'Poet', 'Musician', 'Philosopher', 'Entertainment',
  ];

  /// 过滤 AI 生成的 tags，只保留允许的标签，最多 3 个，且不能与 category 重复
  List<String> _filterAiTags(List<dynamic>? rawTags, String category) {
    if (rawTags == null || rawTags.isEmpty) return [];
    
    final categoryLower = category.toLowerCase();
    final result = <String>[];
    
    for (final tag in rawTags) {
      if (result.length >= 3) break;
      
      final tagStr = tag.toString();
      // 查找匹配的允许标签（不区分大小写）
      final matchedTag = _allowedTags.firstWhere(
        (allowed) => allowed.toLowerCase() == tagStr.toLowerCase(),
        orElse: () => '',
      );
      
      if (matchedTag.isNotEmpty) {
        // 检查是否与 category 重复
        if (matchedTag.toLowerCase() != categoryLower && 
            !categoryLower.contains(matchedTag.toLowerCase()) &&
            !matchedTag.toLowerCase().contains(categoryLower)) {
          result.add(matchedTag);
        }
      }
    }
    
    return result;
  }

  /// 将 Google Maps types 转换为可读的分类名称
  String _parseGoogleCategory(List<dynamic> types) {
    // Google Maps types 到可读分类的映射
    const typeMapping = {
      // 餐饮
      'restaurant': 'Restaurant',
      'cafe': 'Cafe',
      'bar': 'Bar',
      'bakery': 'Bakery',
      'food': 'Restaurant',
      'meal_takeaway': 'Restaurant',
      'meal_delivery': 'Restaurant',
      
      // 景点
      'tourist_attraction': 'Tourist Attraction',
      'point_of_interest': 'Point of Interest',
      'natural_feature': 'Natural Feature',
      'park': 'Park',
      'amusement_park': 'Amusement Park',
      'zoo': 'Zoo',
      'aquarium': 'Aquarium',
      
      // 文化
      'museum': 'Museum',
      'art_gallery': 'Art Gallery',
      'church': 'Church',
      'hindu_temple': 'Temple',
      'mosque': 'Mosque',
      'synagogue': 'Synagogue',
      'place_of_worship': 'Place of Worship',
      
      // 历史
      'historical_place': 'Historical Place',
      'historical_landmark': 'Historical Landmark',
      'monument': 'Monument',
      'castle': 'Castle',
      
      // 购物
      'shopping_mall': 'Shopping Mall',
      'store': 'Store',
      'clothing_store': 'Clothing Store',
      'book_store': 'Book Store',
      
      // 住宿
      'lodging': 'Hotel',
      'hotel': 'Hotel',
      
      // 娱乐
      'movie_theater': 'Movie Theater',
      'night_club': 'Night Club',
      'stadium': 'Stadium',
      'gym': 'Gym',
      'spa': 'Spa',
      
      // 交通
      'airport': 'Airport',
      'train_station': 'Train Station',
      'bus_station': 'Bus Station',
      'subway_station': 'Subway Station',
      
      // 其他
      'establishment': 'Place',
      'premise': 'Place',
    };
    
    // 按优先级查找第一个匹配的类型
    for (final type in types) {
      final typeStr = type.toString();
      if (typeMapping.containsKey(typeStr)) {
        return typeMapping[typeStr]!;
      }
    }
    
    return 'Place';
  }

  final Dio _dio;
  final PlaceRepository _placeRepository = PlaceRepository();
  final QuotaService _quotaService = QuotaService();

  /// 每次对话最多返回 5 个地点
  static const int _maxLimit = 5;
  
  /// 附近搜索的最大距离（10km）
  static const double _nearbyMaxDistanceKm = 10.0;

  /// 获取后端 API 基础 URL
  String get _apiBaseUrl => dotenv.env['API_BASE_URL'] ?? 'http://localhost:3000/api';

  /// 通过后端代理搜索 Google Maps
  Future<Map<String, dynamic>?> _searchGoogleMapsViaBackend(String query, {String? city, CancelToken? cancelToken}) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '$_apiBaseUrl/places/google/search',
        data: {
          'query': query,
          'city': city,
        },
        cancelToken: cancelToken,
      );

      if (response.data?['success'] == true) {
        return response.data?['place'] as Map<String, dynamic>?;
      }
      return null;
    } catch (e) {
      print('❌ Backend Google Maps search failed: $e');
      return null;
    }
  }

  /// 通过后端代理获取 Google Maps 地点详情
  Future<Map<String, dynamic>?> _getGooglePlaceDetailsViaBackend(String placeId, {CancelToken? cancelToken}) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '$_apiBaseUrl/places/google/details',
        data: {
          'placeId': placeId,
        },
        cancelToken: cancelToken,
      );

      if (response.data?['success'] == true) {
        return response.data?['place'] as Map<String, dynamic>?;
      }
      return null;
    } catch (e) {
      print('❌ Backend Google Maps details failed: $e');
      return null;
    }
  }

  /// 通过文本查询搜索地点
  /// 1. 用 AI 解析用户意图
  /// 2. 处理"我附近"场景（引导开启定位）
  /// 3. 处理"xx附近"场景（基于地点坐标搜索）
  /// 4. 根据意图智能查询数据库
  /// 5. 数据库不够时用 AI + Google Maps 补齐
  /// 6. 每次对话最多返回 5 个地点
  Future<AIRecognitionResult> searchByQuery(String query, {double? userLat, double? userLng, CancelToken? cancelToken}) async {
    if (query.trim().isEmpty) {
      return AIRecognitionResult(
        message: 'Please enter a search query.',
        spots: [],
        imageUrls: [],
      );
    }

    // 辅助函数：检查是否已取消
    void checkCancelled() {
      if (cancelToken?.isCancelled ?? false) {
        throw Exception('Request cancelled');
      }
    }

    try {
      // 步骤1：用 AI 解析用户查询意图
      print('🧠 Parsing query intent: $query');
      checkCancelled();
      final intent = await _parseQueryIntent(query, cancelToken: cancelToken);
      print('📋 Parsed intent: $intent');
      checkCancelled();

      // 步骤2：只有用户明确说"我附近"时才需要定位
      if (intent.wantsNearMe && (userLat == null || userLng == null)) {
        return AIRecognitionResult(
          message: 'To find places near you, I need access to your location. Tap the button below to enable it! 📍',
          spots: [],
          imageUrls: [],
          needsLocationPermission: true,
        );
      }
      
      if (userLat != null && userLng != null) {
        print('📍 User location available: $userLat, $userLng');
      }

      // 步骤3：处理"xx附近"场景
      double? searchLat;
      double? searchLng;
      String? nearbyLocationName;
      
      if (intent.nearbyLocation != null && intent.nearbyLocation!.isNotEmpty) {
        print('📍 Searching for nearby location: ${intent.nearbyLocation}');
        checkCancelled();
        final coords = await _getLocationCoordinates(intent.nearbyLocation!, cancelToken: cancelToken);
        checkCancelled();
        if (coords != null) {
          searchLat = coords['lat'];
          searchLng = coords['lng'];
          nearbyLocationName = intent.nearbyLocation;
          print('📍 Found coordinates: $searchLat, $searchLng');
        } else {
          return AIRecognitionResult(
            message: 'I couldn\'t find the location "${intent.nearbyLocation}". Could you be more specific or try a different landmark?',
            spots: [],
            imageUrls: [],
          );
        }
      } else if (intent.wantsNearMe && userLat != null && userLng != null) {
        // "我附近"场景，使用用户位置
        searchLat = userLat;
        searchLng = userLng;
        nearbyLocationName = 'your location';
      }

      // 限制用户请求的数量，每次对话最多 5 个
      final requestedLimit = intent.limit ?? 5;
      int effectiveLimit = requestedLimit > _maxLimit ? _maxLimit : requestedLimit;
      
      // 如果用户要求超过 5 个，提示他们
      String? limitWarning;
      if (requestedLimit > _maxLimit) {
        limitWarning = 'I\'ll recommend $_maxLimit places first. If you want more, just let me know!';
        print('⚠️ User requested $requestedLimit, limiting to $_maxLimit');
      }
      
      print('📊 Requested: $requestedLimit, Effective limit: $effectiveLimit');

      checkCancelled();
      
      // 步骤4：根据意图智能查询数据库
      print('🔍 Searching database with intent...');
      List<Map<String, dynamic>> dbResults;
      
      if (searchLat != null && searchLng != null) {
        // 附近搜索模式
        dbResults = await _searchNearbyPlaces(
          lat: searchLat,
          lng: searchLng,
          maxDistanceKm: _nearbyMaxDistanceKm,
          category: intent.category,
          tags: intent.tags,
          limit: effectiveLimit,
        );
      } else {
        dbResults = await _searchDatabaseWithIntent(intent, effectiveLimit);
      }
      final dbCount = dbResults.length;
      print('✅ Found $dbCount places in database');

      final allSpots = <dynamic>[];

      // 转换数据库结果为 Spot (isFromAI: false)
      if (dbResults.isNotEmpty) {
        final dbSpots = dbResults.map((place) {
          // 解析 ai_tags - 支持对象数组格式 [{en, zh, kind, id, priority}]
          final rawAiTags = place['ai_tags'] as List?;
          final parsedAiTags = <String>[];
          if (rawAiTags != null) {
            for (final item in rawAiTags) {
              if (item is Map<String, dynamic>) {
                final en = item['en'] as String?;
                if (en != null && en.isNotEmpty) {
                  parsedAiTags.add(en);
                }
              } else if (item is String) {
                parsedAiTags.add(item);
              }
            }
          }
          
          return {
            'id': place['id'],
            'name': place['name'],
            'city': place['city'] ?? '',
            'category': place['category'] ?? 'Place',
            'latitude': place['latitude'] ?? 0.0,
            'longitude': place['longitude'] ?? 0.0,
            'rating': place['rating'] ?? 0.0,
            'ratingCount': place['rating_count'] ?? 0,
            'coverImage': place['cover_image'] ?? '',
            'images': place['images'] ?? [place['cover_image'] ?? ''],
            'tags': (place['tags'] as List?)?.cast<String>() ?? parsedAiTags,
            'aiSummary': place['ai_summary'] ?? place['description'],
            'isFromAI': false, // 数据库结果不显示 AI 标签
          };
        }).map(AIRecognitionResult.spotFromJson).toList();
        
        allSpots.addAll(dbSpots);
      }

      // 步骤3：如果数据库结果不够，用 AI 推荐补齐（不调用 Google Maps API）
      final remaining = effectiveLimit - dbCount;
      if (remaining > 0) {
        print('📡 Database has $dbCount, need $remaining more from AI...');
        
        // 获取用户所在城市（用于 AI 推荐时限定地理范围）
        String? userCity = intent.city;
        String? userCountry = intent.country;
        
        // 如果 intent 中没有城市信息，尝试从用户位置获取
        if (userCity == null && userLat != null && userLng != null) {
          final geoResult = await _reverseGeocode(userLat, userLng, cancelToken: cancelToken);
          checkCancelled();
          if (geoResult != null) {
            userCity = geoResult['city'];
            userCountry = geoResult['country'];
            print('📍 User location: $userCity, $userCountry');
          }
        }
        
        // 获取已有地点的名称，避免重复
        final existingNames = dbResults.map((p) => (p['name'] as String?)?.toLowerCase() ?? '').toSet();
        
        checkCancelled();
        print('🤖 Fetching AI recommendations...');
        final aiRecommendations = await _getAIRecommendations(
          query, 
          intent, 
          remaining,
          userCity: userCity,
          userCountry: userCountry,
          cancelToken: cancelToken,
        );
        checkCancelled();
        
        if (aiRecommendations.isNotEmpty) {
          // 过滤掉已存在的地点
          final filteredRecommendations = aiRecommendations.where((loc) {
            final name = (loc['name'] as String?)?.toLowerCase() ?? '';
            return !existingNames.contains(name);
          }).toList();
          
          if (filteredRecommendations.isNotEmpty) {
            print('✅ Got ${filteredRecommendations.length} AI recommendations');
            // 将 AI 推荐转换为 Spot（标记为 isFromAI: true）
            final aiSpots = filteredRecommendations.map((loc) => {
              'id': 'ai_${DateTime.now().millisecondsSinceEpoch}_${loc['name'].hashCode}',
              'name': loc['name'] ?? 'Unknown Place',
              'city': loc['city'] ?? userCity ?? '',
              'country': loc['country'] ?? userCountry ?? '',
              'category': loc['category'] ?? intent.category ?? 'Place',
              'latitude': loc['latitude'] ?? 0.0,
              'longitude': loc['longitude'] ?? 0.0,
              'rating': loc['rating'] ?? 0.0,
              'ratingCount': loc['ratingCount'] ?? 0,
              'coverImage': loc['coverImage'] ?? '',
              'images': loc['images'] ?? [],
              'tags': loc['tags'] ?? intent.tags ?? [],
              'aiSummary': loc['description'] ?? loc['aiSummary'] ?? '',
              'isFromAI': true, // AI 推荐显示 AI 标签
            }).map(AIRecognitionResult.spotFromJson).toList();
            
            allSpots.addAll(aiSpots);
            print('✅ Added ${aiSpots.length} AI-generated places');
          }
        } else {
          print('⚠️ No AI recommendations received');
        }
        
        /* 
        // === 以下代码暂时禁用 ===
        checkCancelled();
        
        // 🔒 检查深度搜索配额
        final quotaStatus = await _quotaService.getQuotaStatus();
        print('📊 Quota status: deep_search=${quotaStatus.deepSearchRemaining}/${QuotaService.deepSearchLimit}');
        
        if (!quotaStatus.canDeepSearch) {
          // 配额用完，降级处理
          print('⚠️ Deep search quota exceeded, using fallback...');
          
          if (dbCount > 0) {
            // 有缓存结果，只返回缓存卡片
            final finalSpots = allSpots.take(effectiveLimit).toList();
            return AIRecognitionResult(
              message: 'I found ${finalSpots.length} places from our database! (Daily search limit reached, resets at midnight UTC)',
              spots: finalSpots.cast(),
              imageUrls: [],
              quotaExceeded: true,
              quotaStatus: quotaStatus,
            );
          } else {
            // 无缓存结果，返回纯文本推荐
            final textRecommendations = await _getTextOnlyRecommendations(query, intent, effectiveLimit, cancelToken: cancelToken);
            return AIRecognitionResult(
              message: textRecommendations.isNotEmpty 
                ? 'Here are some suggestions (card generation unavailable - daily limit reached):\n\n${textRecommendations.join('\n')}'
                : 'Daily search limit reached. Try again tomorrow or search for places we already have in our database!',
              spots: [],
              imageUrls: [],
              quotaExceeded: true,
              quotaStatus: quotaStatus,
              textFallback: textRecommendations,
            );
          }
        }
        
        // 获取用户所在城市（用于 AI 推荐时限定地理范围）
        String? userCity;
        String? userCountry;
        
        // 优先使用搜索位置，其次使用用户位置
        final geoLat = searchLat ?? userLat;
        final geoLng = searchLng ?? userLng;
        
        if (geoLat != null && geoLng != null) {
          final geoResult = await _reverseGeocode(geoLat, geoLng, cancelToken: cancelToken);
          checkCancelled();
          if (geoResult != null) {
            userCity = geoResult['city'];
            userCountry = geoResult['country'];
            print('📍 User location: $userCity, $userCountry');
          }
        }
        
        // 获取已有地点的名称，避免重复
        final existingNames = dbResults.map((p) => (p['name'] as String?)?.toLowerCase() ?? '').toSet();
        
        checkCancelled();
        final aiRecommendations = await _getAIRecommendations(
          query, 
          intent, 
          remaining,
          userCity: userCity,
          userCountry: userCountry,
          cancelToken: cancelToken,
        );
        checkCancelled();
        
        if (aiRecommendations.isNotEmpty) {
          // 过滤掉已存在的地点
          final filteredRecommendations = aiRecommendations.where((loc) {
            final name = (loc['name'] as String?)?.toLowerCase() ?? '';
            return !existingNames.contains(name);
          }).toList();
          
          if (filteredRecommendations.isNotEmpty) {
            checkCancelled();
            print('🗺️ Fetching ${filteredRecommendations.length} places from Google Maps...');
            final spotsData = await _fetchSpotDetailsFromGoogleMaps(filteredRecommendations, cancelToken: cancelToken);
            checkCancelled();
            
            if (spotsData.isNotEmpty) {
              // ✅ 成功调用 Google API，消耗配额
              await _quotaService.consumeDeepSearch();
              print('📊 Deep search quota consumed');
              
              final aiSpots = spotsData.map(AIRecognitionResult.spotFromJson).toList();
              allSpots.addAll(aiSpots);
              print('✅ Added ${aiSpots.length} places from AI');
            }
          }
        }
        // === 禁用代码结束 ===
        */
      }

      // 确保不超过上限
      final finalSpots = allSpots.take(effectiveLimit).toList();

      if (finalSpots.isEmpty) {
        String emptyMessage;
        if (nearbyLocationName != null) {
          emptyMessage = 'I couldn\'t find any places within ${_nearbyMaxDistanceKm.toInt()}km of $nearbyLocationName. Try searching for a different area or category.';
        } else {
          emptyMessage = 'I couldn\'t find any places matching your request. Try being more specific or search for a different location.';
        }
        return AIRecognitionResult(
          message: emptyMessage,
          spots: [],
          imageUrls: [],
        );
      }

      // 生成响应消息
      String message;
      if (limitWarning != null) {
        // 用户要求超过 5 个
        if (nearbyLocationName != null) {
          message = 'Here are $_maxLimit places near $nearbyLocationName! $limitWarning';
        } else {
          message = 'Here are $_maxLimit places for you! $limitWarning';
        }
      } else if (nearbyLocationName != null) {
        // 附近搜索
        message = 'I found ${finalSpots.length} places within ${_nearbyMaxDistanceKm.toInt()}km of $nearbyLocationName!';
      } else if (dbCount >= effectiveLimit) {
        message = _generateResponseMessage(intent, finalSpots.length);
      } else if (dbCount > 0) {
        message = 'I found ${finalSpots.length} places for you!';
      } else {
        message = 'I found ${finalSpots.length} places for you!';
      }

      return AIRecognitionResult(
        message: message,
        spots: finalSpots.cast(),
        imageUrls: [],
      );
    } catch (e) {
      print('❌ Search failed: $e');
      throw Exception('Search failed: $e');
    }
  }

  /// 获取地点的经纬度坐标（通过 Google Maps API）
  Future<Map<String, double>?> _getLocationCoordinates(String locationName, {CancelToken? cancelToken}) async {
    final apiKey = dotenv.env['GOOGLE_MAPS_API_KEY'] ?? '';
    if (apiKey.isEmpty) return null;

    try {
      final response = await _dio.get<Map<String, dynamic>>(
        'https://maps.googleapis.com/maps/api/place/findplacefromtext/json',
        queryParameters: {
          'input': locationName,
          'inputtype': 'textquery',
          'fields': 'geometry',
          'key': apiKey,
        },
        cancelToken: cancelToken,
      );

      final candidates = response.data?['candidates'] as List?;
      if (candidates == null || candidates.isEmpty) return null;

      final geometry = candidates.first['geometry'] as Map<String, dynamic>?;
      final location = geometry?['location'] as Map<String, dynamic>?;
      
      if (location == null) return null;

      return {
        'lat': (location['lat'] as num).toDouble(),
        'lng': (location['lng'] as num).toDouble(),
      };
    } catch (e) {
      print('❌ Failed to get coordinates for $locationName: $e');
      return null;
    }
  }

  /// 搜索附近的地点（基于经纬度，限制距离）
  Future<List<Map<String, dynamic>>> _searchNearbyPlaces({
    required double lat,
    required double lng,
    required double maxDistanceKm,
    String? category,
    List<String>? tags,
    required int limit,
  }) async {
    final client = SupabaseConfig.client;

    try {
      // 计算经纬度范围（粗略估算：1度纬度 ≈ 111km）
      final latDelta = maxDistanceKm / 111.0;
      final lngDelta = maxDistanceKm / (111.0 * cos(lat * pi / 180));

      var query = client
          .from('places')
          .select()
          .gte('latitude', lat - latDelta)
          .lte('latitude', lat + latDelta)
          .gte('longitude', lng - lngDelta)
          .lte('longitude', lng + lngDelta);

      // 添加分类过滤
      if (category != null && category.isNotEmpty) {
        query = query.ilike('category', '%$category%');
      }

      final response = await query
          .order('rating', ascending: false)
          .limit(limit * 3); // 多取一些用于距离过滤

      var results = List<Map<String, dynamic>>.from(response as List);

      // 精确计算距离并过滤
      results = results.where((place) {
        final placeLat = (place['latitude'] as num?)?.toDouble() ?? 0;
        final placeLng = (place['longitude'] as num?)?.toDouble() ?? 0;
        final distance = _calculateDistance(lat, lng, placeLat, placeLng);
        place['_distance'] = distance; // 临时存储距离
        return distance <= maxDistanceKm;
      }).toList();

      // 按距离排序
      results.sort((a, b) => (a['_distance'] as double).compareTo(b['_distance'] as double));

      // 如果有标签过滤
      if (tags != null && tags.isNotEmpty && results.isNotEmpty) {
        final taggedResults = results.where((place) {
          // 解析 ai_tags - 支持对象数组格式 [{en, zh, kind, id, priority}]
          final rawAiTags = place['ai_tags'] as List?;
          final aiTags = <String>[];
          if (rawAiTags != null) {
            for (final item in rawAiTags) {
              if (item is Map<String, dynamic>) {
                final en = item['en'] as String?;
                if (en != null && en.isNotEmpty) {
                  aiTags.add(en.toLowerCase());
                }
              } else if (item is String) {
                aiTags.add(item.toLowerCase());
              }
            }
          }
          final placeTags = (place['tags'] as List?)?.map((e) => e.toString().toLowerCase()).toList() ?? [];
          final allTags = [...aiTags, ...placeTags];
          return tags.any((t) => allTags.any((tag) => tag.contains(t.toLowerCase())));
        }).toList();
        
        if (taggedResults.isNotEmpty) {
          results = taggedResults;
        }
      }

      return results.take(limit).toList();
    } catch (e) {
      print('Nearby search error: $e');
      return [];
    }
  }

  /// 计算两点之间的距离（Haversine 公式，返回 km）
  double _calculateDistance(double lat1, double lng1, double lat2, double lng2) {
    const earthRadius = 6371.0; // km
    final dLat = _toRadians(lat2 - lat1);
    final dLng = _toRadians(lng2 - lng1);
    final a = sin(dLat / 2) * sin(dLat / 2) +
        cos(_toRadians(lat1)) * cos(_toRadians(lat2)) *
        sin(dLng / 2) * sin(dLng / 2);
    final c = 2 * atan2(sqrt(a), sqrt(1 - a));
    return earthRadius * c;
  }

  double _toRadians(double degree) => degree * pi / 180;

  /// 从经纬度反向解析城市名称（使用 Google Geocoding API）
  Future<Map<String, String>?> _reverseGeocode(double lat, double lng, {CancelToken? cancelToken}) async {
    final apiKey = dotenv.env['GOOGLE_MAPS_API_KEY'] ?? '';
    if (apiKey.isEmpty) return null;

    try {
      final response = await _dio.get<Map<String, dynamic>>(
        'https://maps.googleapis.com/maps/api/geocode/json',
        queryParameters: {
          'latlng': '$lat,$lng',
          'key': apiKey,
          'result_type': 'locality|administrative_area_level_1',
          'language': 'en',
        },
        cancelToken: cancelToken,
      );

      final results = response.data?['results'] as List?;
      if (results == null || results.isEmpty) return null;

      String? city;
      String? country;

      for (final result in results) {
        final components = result['address_components'] as List?;
        if (components == null) continue;

        for (final component in components) {
          final types = component['types'] as List?;
          if (types == null) continue;

          if (types.contains('locality')) {
            city ??= component['long_name'] as String?;
          } else if (types.contains('administrative_area_level_1') && city == null) {
            city ??= component['long_name'] as String?;
          }
          if (types.contains('country')) {
            country ??= component['long_name'] as String?;
          }
        }
      }

      if (city != null) {
        print('📍 Reverse geocoded: $city, $country');
        return {'city': city, 'country': country ?? ''};
      }
      return null;
    } catch (e) {
      print('❌ Reverse geocode failed: $e');
      return null;
    }
  }

  /// 用 AI 解析用户查询意图（通过后端 API 代理）
  Future<QueryIntent> _parseQueryIntent(String query, {CancelToken? cancelToken}) async {
    final apiBaseUrl = dotenv.env['API_BASE_URL'] ?? '';
    
    if (apiBaseUrl.isEmpty) {
      debugPrint('⚠️ No API_BASE_URL, using simple parsing');
      return QueryIntent(tags: [query]);
    }

    try {
      debugPrint('🚀 Calling backend API for intent parsing...');
      final response = await _dio.post<Map<String, dynamic>>(
        '$apiBaseUrl/places/ai/parse-intent',
        data: {'query': query},
        cancelToken: cancelToken,
        options: Options(
          sendTimeout: const Duration(seconds: 30),
          receiveTimeout: const Duration(seconds: 30),
        ),
      );
      
      if (response.data?['success'] == true && response.data?['intent'] != null) {
        final intent = response.data!['intent'] as Map<String, dynamic>;
        debugPrint('✅ AI intent response received: $intent');
        return QueryIntent.fromJson(intent);
      }
      
      debugPrint('⚠️ Backend API returned no intent, using simple parsing');
      return QueryIntent(tags: [query]);
    } catch (e, stackTrace) {
      print('❌ Intent parsing failed: $e');
      print('📋 Stack trace: $stackTrace');
      return QueryIntent(tags: [query]);
    }
  }

  /// 根据解析的意图智能查询数据库
  Future<List<Map<String, dynamic>>> _searchDatabaseWithIntent(QueryIntent intent, int limit) async {
    final client = SupabaseConfig.client;

    try {
      // 场景1：查找特定地点
      if (intent.specificPlaceName != null && intent.specificPlaceName!.isNotEmpty) {
        final response = await client
            .from('places')
            .select()
            .ilike('name', '%${intent.specificPlaceName}%')
            .limit(limit);
        if ((response as List).isNotEmpty) return List<Map<String, dynamic>>.from(response);
      }

      // 场景2：按城市 + 分类/标签查询
      if (intent.city != null && intent.city!.isNotEmpty) {
        // 构建基础查询
        var baseQuery = client.from('places').select().ilike('city', '%${intent.city}%');
        
        // 添加分类过滤
        if (intent.category != null && intent.category!.isNotEmpty) {
          baseQuery = baseQuery.ilike('category', '%${intent.category}%');
        }
        
        // 执行查询（排序放在最后）
        final response = await baseQuery
            .order('rating', ascending: false)
            .order('rating_count', ascending: false)
            .limit(limit * 2); // 多取一些用于随机和标签过滤
        
        var results = List<Map<String, dynamic>>.from(response as List);
        
        // 如果有标签过滤
        if (intent.tags.isNotEmpty && results.isNotEmpty) {
          results = results.where((place) {
            // 解析 ai_tags - 支持对象数组格式 [{en, zh, kind, id, priority}]
            final rawAiTags = place['ai_tags'] as List?;
            final aiTags = <String>[];
            if (rawAiTags != null) {
              for (final item in rawAiTags) {
                if (item is Map<String, dynamic>) {
                  final en = item['en'] as String?;
                  if (en != null && en.isNotEmpty) {
                    aiTags.add(en.toLowerCase());
                  }
                } else if (item is String) {
                  aiTags.add(item.toLowerCase());
                }
              }
            }
            final tags = (place['tags'] as List?)?.map((e) => e.toString().toLowerCase()).toList() ?? [];
            final allTags = [...aiTags, ...tags];
            return intent.tags.any((t) => allTags.any((tag) => tag.contains(t.toLowerCase())));
          }).toList();
        }
        
        // 随机打乱（如果用户想要 interesting/random）
        if (intent.wantsRandom && results.length > limit) {
          results.shuffle();
        }
        
        return results.take(limit).toList();
      }

      // 场景3：只有标签（如电影名）
      if (intent.tags.isNotEmpty) {
        for (final tag in intent.tags) {
          // 用名称模糊搜索（最可靠的方式）
          var response = await client
              .from('places')
              .select()
              .ilike('name', '%$tag%')
              .order('rating', ascending: false)
              .limit(limit);
          
          if ((response as List).isNotEmpty) {
            return List<Map<String, dynamic>>.from(response);
          }
          
          // 搜索描述
          response = await client
              .from('places')
              .select()
              .ilike('description', '%$tag%')
              .order('rating', ascending: false)
              .limit(limit);
          
          if ((response as List).isNotEmpty) {
            return List<Map<String, dynamic>>.from(response);
          }
        }
      }

      return [];
    } catch (e) {
      print('Database search error: $e');
      return [];
    }
  }

  /// 生成响应消息
  String _generateResponseMessage(QueryIntent intent, int count) {
    if (intent.city != null) {
      if (intent.category != null) {
        return 'I found $count ${intent.category}s in ${intent.city} for you!';
      }
      return 'I found $count places in ${intent.city} for you!';
    }
    if (intent.tags.isNotEmpty) {
      return 'I found $count places matching your search!';
    }
    return 'I found $count places for you!';
  }

  /// 获取 AI 推荐的地点（通过后端 API 代理）
  /// [userCity] 用户所在城市（从位置反向解析或从查询中提取）
  Future<List<Map<String, dynamic>>> _getAIRecommendations(
    String query, 
    QueryIntent intent, 
    int count, 
    {String? userCity, String? userCountry, CancelToken? cancelToken}
  ) async {
    final apiBaseUrl = dotenv.env['API_BASE_URL'] ?? '';
    if (apiBaseUrl.isEmpty) return [];

    // 检查是否已取消
    if (cancelToken?.isCancelled ?? false) return [];

    // 确定搜索的城市：优先使用 intent 中的城市，其次是用户位置的城市
    String? searchCity = intent.city ?? userCity;
    String? searchCountry = intent.country ?? userCountry;

    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '$apiBaseUrl/places/ai/recommend',
        data: {
          'query': query,
          'city': searchCity,
          'country': searchCountry,
          'category': intent.category,
          'tags': intent.tags,
          'limit': count > 5 ? 5 : count,
        },
        cancelToken: cancelToken,
        options: Options(
          sendTimeout: const Duration(seconds: 30),
          receiveTimeout: const Duration(seconds: 30),
        ),
      );
      
      if (response.data?['success'] == true && response.data?['locations'] != null) {
        final locations = response.data!['locations'] as List;
        return locations.map((loc) => loc as Map<String, dynamic>).toList();
      }
      
      return [];
    } catch (e) {
      print('AI recommendations failed: $e');
      return [];
    }
  }

  /// 获取纯文本推荐（配额用完时的降级方案）
  /// 通过后端 API 代理调用
  Future<List<String>> _getTextOnlyRecommendations(
    String query,
    QueryIntent intent,
    int count,
    {CancelToken? cancelToken}
  ) async {
    // 简化实现：直接返回空列表，因为主要的 AI 推荐已经通过后端代理
    // 如果需要纯文本推荐，可以在后端添加相应的接口
    return [];
  }

  /// 识别图片中的地点
  Future<AIRecognitionResult> recognizeLocations(
    List<File> images,
  ) async {
    if (images.isEmpty) {
      throw ArgumentError('至少需要一张图片');
    }
    if (images.length > 5) {
      throw ArgumentError('最多只能上传5张图片');
    }

    try {
      // 1. 调用Gemini AI分析图片
      final geminiResult = await _analyzeImagesWithGemini(images);
      
      // 2. 解析AI返回的地点信息
      final locations = _parseLocationFromGemini(geminiResult);
      
      // 如果没有识别到地点，返回提示信息
      if (locations.isEmpty) {
        return AIRecognitionResult(
          message: geminiResult['message'] as String? ?? 
            'I couldn\'t identify specific locations in these images. Try uploading clearer images of recognizable landmarks or places.',
          spots: [],
          imageUrls: images.map((f) => f.path).toList(),
        );
      }
      
      // 3. 调用Google Maps API获取详细信息
      final spotsData = await _fetchSpotDetailsFromGoogleMaps(locations);
      
      // 如果Google Maps也没找到结果
      if (spotsData.isEmpty) {
        return AIRecognitionResult(
          message: 'I identified some places but couldn\'t find detailed information for them. The places might be too new or not well-documented on Google Maps.',
          spots: [],
          imageUrls: images.map((f) => f.path).toList(),
        );
      }
      
      // 4. 转换为Spot对象
      final spots = spotsData.map(AIRecognitionResult.spotFromJson).toList();
      
      return AIRecognitionResult(
        message: geminiResult['message'] as String? ?? 'I found these amazing places for you!',
        spots: spots,
        imageUrls: images.map((f) => f.path).toList(),
      );
    } catch (e) {
      print('识别失败详情: $e');
      throw Exception('Recognition failed: $e');
    }
  }

  /// 使用Gemini AI分析图片
  Future<Map<String, dynamic>> _analyzeImagesWithGemini(
    List<File> images,
  ) async {
    final apiKey = dotenv.env['GEMINI_API_KEY'] ?? '';
    if (apiKey.isEmpty) {
      throw Exception('GEMINI_API_KEY not configured');
    }

    // 设置系统代理（如果配置了）
    final proxyUrl = dotenv.env['HTTP_PROXY'] ?? '';
    if (proxyUrl.isNotEmpty) {
      print('检测到代理配置: $proxyUrl');
      print('请确保系统已设置代理环境变量 HTTP_PROXY 和 HTTPS_PROXY');
      // 设置环境变量供HttpClient使用
      HttpOverrides.global = _ProxyHttpOverrides(proxyUrl);
    }

    final model = GenerativeModel(
      model: 'gemini-1.5-flash',
      apiKey: apiKey,
    );

    // 准备图片数据
    final imageParts = <DataPart>[];
    for (final image in images) {
      final bytes = await image.readAsBytes();
      imageParts.add(DataPart('image/jpeg', bytes));
    }

    // 构建提示词
    const prompt = '''
Analyze these images and identify the tourist attractions, landmarks, restaurants, or places shown in them.
Please be very specific and accurate. Only identify places that you can clearly see or recognize in the images.

For each place you identify, provide:
1. The exact name of the place/landmark/attraction
2. The city where it's located
3. The country
4. The type (restaurant, museum, landmark, park, waterfall, monument, etc.)
5. 2-3 relevant tags from this list ONLY: Museum, Attractions, Park, Cemetery, Hiking, Cafe, Bakery, Vintage, Secondhand, Store, Brunch, Restaurant, Knitting, Art, Architecture, Historical, Landmark, Vegetarian, Buddhism, Church, Temple, Shopping, Poet, Musician, Philosopher, Entertainment

Return the result in JSON format:
{
  "message": "A brief, friendly introduction about the places found (max 50 words)",
  "locations": [
    {
      "name": "Exact place name",
      "city": "City name",
      "country": "Country name",
      "type": "Place type",
      "tags": ["tag1", "tag2", "tag3"]
    }
  ]
}

Important rules:
- Only identify places you can actually see or clearly recognize in the images
- If you cannot identify specific places, return an empty locations array
- Be precise with place names - don't make up or guess locations
- If the image shows nature (waterfall, mountain, etc.), try to identify the specific natural landmark
- Tags MUST be from the allowed list above, maximum 3 tags
- Do NOT include tags that match the place type
''';

    // 调用Gemini API
    final content = [
      Content.multi([
        TextPart(prompt),
        ...imageParts,
      ]),
    ];

    final response = await model.generateContent(content);
    final text = response.text ?? '';
    
    print('Gemini响应: $text');
    
    // 解析JSON响应
    try {
      // 提取JSON部分（可能包含markdown代码块）
      var jsonText = text.trim();
      
      // 移除可能的markdown代码块标记
      if (jsonText.contains('```json')) {
        final start = jsonText.indexOf('```json') + 7;
        final end = jsonText.lastIndexOf('```');
        if (end > start) {
          jsonText = jsonText.substring(start, end).trim();
        }
      } else if (jsonText.contains('```')) {
        final start = jsonText.indexOf('```') + 3;
        final end = jsonText.lastIndexOf('```');
        if (end > start) {
          jsonText = jsonText.substring(start, end).trim();
        }
      }
      
      // 尝试找到JSON对象的开始和结束
      final jsonStart = jsonText.indexOf('{');
      final jsonEnd = jsonText.lastIndexOf('}');
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
      }
      
      print('解析的JSON: $jsonText');
      
      final parsed = jsonDecode(jsonText) as Map<String, dynamic>;
      print('解析成功: ${parsed['locations']?.length ?? 0} 个地点');
      return parsed;
    } catch (e) {
      print('JSON解析失败: $e');
      // 如果解析失败，返回默认结构
      return {
        'message': 'I analyzed the images but couldn\'t identify specific locations. The images might show general scenery or landmarks I don\'t recognize.',
        'locations': <Map<String, dynamic>>[],
      };
    }
  }

  /// 从Gemini结果中解析地点信息
  List<Map<String, dynamic>> _parseLocationFromGemini(
    Map<String, dynamic> geminiResult,
  ) {
    final locations = geminiResult['locations'] as List?;
    if (locations == null || locations.isEmpty) {
      return [];
    }
    
    return locations
        .map((loc) => loc as Map<String, dynamic>)
        .toList();
  }

  /// 调用 Google Maps API 获取地点基础信息（省钱版）
  /// 只获取列表页需要的数据：place_id, 名称, 经纬度, 城市, 国家, 封面图(1张), 评分, 评分人数
  /// 详细信息（地址、营业时间、额外图片等）在用户点击时再获取
  Future<List<Map<String, dynamic>>> _fetchSpotDetailsFromGoogleMaps(
    List<Map<String, dynamic>> locations,
    {CancelToken? cancelToken}
  ) async {
    if (locations.isEmpty) {
      return [];
    }

    final spots = <Map<String, dynamic>>[];
    final client = SupabaseConfig.client;

    for (final location in locations) {
      if (cancelToken?.isCancelled ?? false) {
        print('🛑 Request cancelled');
        break;
      }
      
      try {
        final name = location['name'] as String;
        final city = location['city'] as String? ?? '';
        final country = location['country'] as String? ?? '';
        final searchQuery = '$name ${city.isNotEmpty ? city : ''}';
        
        print('🔍 [Basic] Searching: $searchQuery');
        
        // 通过后端代理获取基础信息（省钱版）
        final searchResult = await _searchGoogleMapsViaBackend(searchQuery, city: city, cancelToken: cancelToken);
        
        if (searchResult == null || searchResult['googlePlaceId'] == null) {
          print('⚠️ No result for: $searchQuery');
          continue;
        }
        
        final placeId = searchResult['googlePlaceId'] as String;
        
        // 检查数据库是否已存在
        try {
          final existingPlace = await client
              .from('places')
              .select()
              .eq('google_place_id', placeId)
              .maybeSingle();
          
          if (existingPlace != null) {
            print('📍 Found in database: ${existingPlace['name']}');
            
            // 解析 ai_tags - 支持对象数组格式 [{en, zh, kind, id, priority}]
            final rawAiTags = existingPlace['ai_tags'] as List?;
            final parsedAiTags = <String>[];
            if (rawAiTags != null) {
              for (final item in rawAiTags) {
                if (item is Map<String, dynamic>) {
                  final en = item['en'] as String?;
                  if (en != null && en.isNotEmpty) {
                    parsedAiTags.add(en);
                  }
                } else if (item is String) {
                  parsedAiTags.add(item);
                }
              }
            }
            
            spots.add({
              'id': existingPlace['id'],
              'googlePlaceId': placeId,
              'name': existingPlace['name'],
              'city': existingPlace['city'] ?? city,
              'country': existingPlace['country'] ?? country,
              'category': existingPlace['category'] ?? 'Place',
              'latitude': existingPlace['latitude'] ?? 0.0,
              'longitude': existingPlace['longitude'] ?? 0.0,
              'rating': existingPlace['rating'] ?? 0.0,
              'ratingCount': existingPlace['rating_count'] ?? 0,
              'coverImage': existingPlace['cover_image'] ?? '',
              'images': existingPlace['images'] ?? [],
              'tags': parsedAiTags,
              'aiSummary': existingPlace['description'],
              'isFromAI': false,
            });
            continue;
          }
        } catch (e) {
          print('⚠️ DB check error: $e');
        }
        
        // 新地点：只保存基础信息，不获取详情
        final newId = const Uuid().v4();
        
        // 上传封面图到 R2（只上传1张）
        String? r2CoverImage;
        final coverImageUrl = searchResult['coverImage'] as String?;
        if (coverImageUrl != null && coverImageUrl.isNotEmpty) {
          try {
            final uploadResult = await ImageService.uploadGooglePhotosToR2([coverImageUrl], newId);
            r2CoverImage = uploadResult['coverImage'] as String?;
            print('✅ Uploaded cover image to R2');
          } catch (e) {
            print('⚠️ R2 upload failed, using Google URL');
            r2CoverImage = coverImageUrl;
          }
        }
        
        // 过滤 tags
        final filteredTags = _filterAiTags(location['tags'] as List?, searchResult['category'] as String? ?? 'Place');
        
        // 保存基础信息到数据库（详情字段留空，用户点击时再填充）
        final dbRecord = {
          'id': newId,
          'google_place_id': placeId,
          'name': searchResult['name'] as String,
          'city': (searchResult['city'] as String?)?.isNotEmpty == true ? searchResult['city'] : city,
          'country': (searchResult['country'] as String?)?.isNotEmpty == true ? searchResult['country'] : country,
          'latitude': (searchResult['latitude'] as num?)?.toDouble() ?? 0.0,
          'longitude': (searchResult['longitude'] as num?)?.toDouble() ?? 0.0,
          'rating': (searchResult['rating'] as num?)?.toDouble(),
          'rating_count': searchResult['ratingCount'] as int?,
          'category': searchResult['category'] as String? ?? 'Place',
          'cover_image': r2CoverImage,
          'images': <String>[], // 详情图片留空，点击时再获取
          'ai_tags': filteredTags,
          'source': 'google_maps_ai',
          'is_verified': false,
          // 以下字段留空，用户点击时再获取
          // 'address': null,
          // 'opening_hours': null,
          // 'phone_number': null,
          // 'website': null,
          // 'description': null,
        };
        
        try {
          await client.from('places').insert(dbRecord);
          print('✅ Saved basic info: ${searchResult['name']}');
        } catch (e) {
          print('⚠️ DB save failed: $e');
        }
        
        spots.add({
          'id': newId,
          'googlePlaceId': placeId,
          'name': searchResult['name'] as String,
          'city': (searchResult['city'] as String?)?.isNotEmpty == true ? searchResult['city'] : city,
          'country': (searchResult['country'] as String?)?.isNotEmpty == true ? searchResult['country'] : country,
          'category': searchResult['category'] as String? ?? 'Place',
          'latitude': (searchResult['latitude'] as num?)?.toDouble() ?? 0.0,
          'longitude': (searchResult['longitude'] as num?)?.toDouble() ?? 0.0,
          'rating': (searchResult['rating'] as num?)?.toDouble() ?? 0.0,
          'ratingCount': searchResult['ratingCount'] as int? ?? 0,
          'coverImage': r2CoverImage ?? '',
          'images': <String>[],
          'tags': filteredTags,
          'aiSummary': null, // 详情页再获取
          'isFromAI': true,
        });
        
        print('✅ Added basic spot: ${searchResult['name']}');
      } catch (e) {
        print('❌ Error: $e');
        continue;
      }
    }

    return spots;
  }

  /// Mock方法：用于测试，返回模拟数据
  Future<AIRecognitionResult> recognizeLocationsMock(
    List<File> images,
  ) async {
    // 模拟网络延迟
    await Future<void>.delayed(const Duration(seconds: 2));

    // 返回模拟数据
    return AIRecognitionResult.fromJson({
      'message': '我为您找到了这些精彩的地点！这些都是小红书上很受欢迎的打卡地，每个都有独特的魅力和故事。',
      'imageUrls': images.map((f) => f.path).toList(),
      'spots': [
        {
          'id': 'mock_spot_1',
          'name': 'Noma Restaurant',
          'city': 'Copenhagen',
          'category': 'Restaurant',
          'latitude': 55.6880,
          'longitude': 12.6000,
          'rating': 4.8,
          'ratingCount': 1250,
          'coverImage':
              'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
          'images': [
            'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
          ],
          'tags': ['Restaurant', 'Fine Dining', 'Michelin'],
          'aiSummary': '世界顶级餐厅，北欧料理的标杆',
          'isFromAI': true,
        },
        {
          'id': 'mock_spot_2',
          'name': 'Tivoli Gardens',
          'city': 'Copenhagen',
          'category': 'Park',
          'latitude': 55.6739,
          'longitude': 12.5681,
          'rating': 4.6,
          'ratingCount': 3420,
          'coverImage':
              'https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?w=800',
          'images': [
            'https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?w=800',
          ],
          'tags': ['Amusement Park', 'Gardens', 'Family'],
          'aiSummary': '历史悠久的游乐园，充满童话色彩',
          'isFromAI': true,
        },
        {
          'id': 'mock_spot_3',
          'name': 'The Little Mermaid',
          'city': 'Copenhagen',
          'category': 'Landmark',
          'latitude': 55.6929,
          'longitude': 12.5993,
          'rating': 4.2,
          'ratingCount': 5600,
          'coverImage':
              'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800',
          'images': [
            'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800',
          ],
          'tags': ['Landmark', 'Sculpture', 'Photo Spot'],
          'aiSummary': '哥本哈根的标志性雕塑',
          'isFromAI': true,
        },
      ],
    });
  }
}
