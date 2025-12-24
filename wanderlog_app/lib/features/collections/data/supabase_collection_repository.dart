import 'package:wanderlog/core/supabase/supabase_config.dart';

/// Supabase 版本的合集仓库
class SupabaseCollectionRepository {
  final _client = SupabaseConfig.client;

  /// 获取合集列表
  Future<List<Map<String, dynamic>>> listCollections({bool includeAll = false}) async {
    var query = _client.from('collections').select();
    
    if (!includeAll) {
      query = query.eq('is_published', true);
    }
    
    final response = await query.order('sort_order');
    return List<Map<String, dynamic>>.from(response);
  }

  /// 获取单个合集详情（含地点）- 单次查询优化
  Future<Map<String, dynamic>> getCollection(String id) async {
    // 单次查询获取合集及其关联的地点
    final collection = await _client
        .from('collections')
        .select('*, collection_spots(*, place:places(*))')
        .eq('id', id)
        .single();

    final spots = collection['collection_spots'] as List<dynamic>? ?? [];
    
    // 按 sort_order 排序
    spots.sort((a, b) {
      final aOrder = (a['sort_order'] as num?) ?? 999;
      final bOrder = (b['sort_order'] as num?) ?? 999;
      return aOrder.compareTo(bOrder);
    });

    // 转换字段名 - 注意：前端期望 spotId 和 spot，而不是 placeId 和 place
    final convertedSpots = spots.map((spot) {
      final place = spot['place'] as Map<String, dynamic>?;
      return {
        'id': spot['id'],
        'collectionId': spot['collection_id'],
        'spotId': spot['place_id'],  // 前端期望 spotId
        'placeId': spot['place_id'],
        'city': spot['city'],
        'sortOrder': spot['sort_order'],
        'spot': place != null ? _convertPlaceToSpot(place) : null,  // 前端期望 spot
        'place': place != null ? _convertPlaceFields(place) : null,
      };
    }).toList();

    return {
      'id': collection['id'],
      'name': collection['name'],
      'coverImage': collection['cover_image'],
      'description': collection['description'],
      'people': collection['people'],
      'works': collection['works'],
      'isPublished': collection['is_published'],
      'collectionSpots': convertedSpots,
    };
  }

  /// 转换 place 为 spot 格式（前端 Spot 模型期望的格式）
  Map<String, dynamic> _convertPlaceToSpot(Map<String, dynamic> place) {
    // 封面图 fallback: cover_image -> images[0] -> 空
    String? coverImage = place['cover_image']?.toString();
    final images = place['images'];
    if ((coverImage == null || coverImage.isEmpty) && images is List && images.isNotEmpty) {
      coverImage = images[0]?.toString();
    }
    
    return {
      'id': place['id'],
      'name': place['name'],
      'city': place['city'],
      'country': place['country'],
      'latitude': place['latitude'],
      'longitude': place['longitude'],
      'address': place['address'],
      'description': place['description'],
      'coverImage': coverImage ?? '',
      'images': place['images'],
      'rating': place['rating'],
      'ratingCount': place['rating_count'],
      'category': place['category'],
      'tags': place['tags'] ?? place['ai_tags'] ?? [],
      'aiTags': place['ai_tags'],
      'aiSummary': place['ai_summary'],
      'aiDescription': place['ai_description'],
      'googlePlaceId': place['google_place_id'],
    };
  }

  /// 获取合集推荐列表
  Future<List<Map<String, dynamic>>> listRecommendations() async {
    try {
      print('📡 Fetching recommendations from Supabase');
      
      // 获取活跃的推荐分组，按 sort_order 升序排列
      final recommendations = await _client
          .from('collection_recommendations')
          .select()
          .eq('is_active', true)
          .order('sort_order', ascending: true);

      print('📊 Found ${recommendations.length} recommendation groups');

      // 为每个推荐分组获取关联的合集
      final result = <Map<String, dynamic>>[];
      
      for (final rec in recommendations) {
        final items = await _client
            .from('collection_recommendation_items')
            .select('*, collection:collections(*, collectionSpots:collection_spots(*, place:places(*)))')
            .eq('recommendation_id', rec['id'])
            .order('sort_order', ascending: true);

        // 过滤出已发布的合集并转换字段名
        final filteredItems = items
            .where((item) => item['collection']?['is_published'] == true)
            .map((item) {
              final collection = item['collection'] as Map<String, dynamic>?;
              if (collection == null) return item;
              
              // 转换 collection 字段名
              final convertedCollection = _convertCollectionFields(collection);
              return {
                ...item,
                'collection': convertedCollection,
              };
            })
            .toList();

        result.add({
          'id': rec['id'],
          'name': rec['name'],
          'order': rec['sort_order'],
          'items': filteredItems,
        });
      }

      print('✅ Returning ${result.length} recommendations');
      return result;
    } catch (e, stackTrace) {
      print('❌ Error in listRecommendations: $e');
      print('📋 Stack trace: $stackTrace');
      rethrow;
    }
  }

  /// 转换 collection 字段名从 snake_case 到 camelCase
  Map<String, dynamic> _convertCollectionFields(Map<String, dynamic> collection) {
    final spots = collection['collectionSpots'] as List<dynamic>? ?? [];
    final convertedSpots = spots.map((spot) {
      final place = spot['place'] as Map<String, dynamic>?;
      if (place == null) return spot;
      
      return {
        ...spot,
        'place': _convertPlaceFields(place),
      };
    }).toList();

    return {
      'id': collection['id'],
      'name': collection['name'],
      'coverImage': collection['cover_image'],
      'description': collection['description'],
      'people': collection['people'],
      'works': collection['works'],
      'isPublished': collection['is_published'],
      'collectionSpots': convertedSpots,
    };
  }

  /// 转换 place 字段名从 snake_case 到 camelCase
  Map<String, dynamic> _convertPlaceFields(Map<String, dynamic> place) {
    // 封面图 fallback: cover_image -> images[0] -> 空
    String? coverImage = place['cover_image']?.toString();
    final images = place['images'];
    if ((coverImage == null || coverImage.isEmpty) && images is List && images.isNotEmpty) {
      coverImage = images[0]?.toString();
    }
    
    return {
      'id': place['id'],
      'name': place['name'],
      'city': place['city'],
      'country': place['country'],
      'latitude': place['latitude'],
      'longitude': place['longitude'],
      'address': place['address'],
      'description': place['description'],
      'coverImage': coverImage ?? '',
      'images': place['images'],
      'rating': place['rating'],
      'ratingCount': place['rating_count'],
      'category': place['category'],
      'tags': place['tags'],
      'aiTags': place['ai_tags'],
      'aiSummary': place['ai_summary'],
      'aiDescription': place['ai_description'],
    };
  }

  /// 获取单个推荐详情
  Future<Map<String, dynamic>> getRecommendation(String id) async {
    final rec = await _client
        .from('collection_recommendations')
        .select()
        .eq('id', id)
        .single();

    // 获取关联的合集，包含 collectionSpots 和 place 信息
    final items = await _client
        .from('collection_recommendation_items')
        .select('*, collection:collections(*, collectionSpots:collection_spots(*, place:places(*)))')
        .eq('recommendation_id', id)
        .order('sort_order', ascending: true);

    // 过滤出已发布的合集并转换字段名（与 listRecommendations 保持一致）
    final filteredItems = items
        .where((item) => item['collection']?['is_published'] == true)
        .map((item) {
          final collection = item['collection'] as Map<String, dynamic>?;
          if (collection == null) return item;
          
          // 转换 collection 字段名
          final convertedCollection = _convertCollectionFields(collection);
          return {
            ...item,
            'collection': convertedCollection,
          };
        })
        .toList();

    return {
      'id': rec['id'],
      'name': rec['name'],
      'order': rec['sort_order'],
      'items': filteredItems,
    };
  }

  /// 收藏合集
  Future<void> favoriteCollection(String id) async {
    final userId = SupabaseConfig.currentUser?.id;
    if (userId == null) throw Exception('用户未登录');

    await _client.from('user_collection_favorites').insert({
      'user_id': userId,
      'collection_id': id,
    });
  }

  /// 取消收藏合集
  Future<void> unfavoriteCollection(String id) async {
    final userId = SupabaseConfig.currentUser?.id;
    if (userId == null) throw Exception('用户未登录');

    await _client
        .from('user_collection_favorites')
        .delete()
        .eq('user_id', userId)
        .eq('collection_id', id);
  }
}
