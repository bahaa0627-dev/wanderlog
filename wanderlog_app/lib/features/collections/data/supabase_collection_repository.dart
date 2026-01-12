import 'package:wanderlog/core/supabase/supabase_config.dart';

/// Supabase 版本的合集仓库
class SupabaseCollectionRepository {
  final _client = SupabaseConfig.client;

  /// 获取合集列表
  /// [includeAll] = true: 返回所有已发布的合集（用于 explore 页面）
  /// [includeAll] = false: 返回当前用户收藏的合集（用于 MyLand 页面）
  Future<List<Map<String, dynamic>>> listCollections({bool includeAll = false}) async {
    if (includeAll) {
      // 返回所有已发布的合集
      final response = await _client
          .from('collections')
          .select('*, collection_spots(*, place:places(*))')
          .eq('is_published', true)
          .order('sort_order');
      
      return _convertCollectionsList(response, isFavorited: false);
    } else {
      // 返回当前用户收藏的合集
      final userId = SupabaseConfig.currentUser?.id;
      if (userId == null) {
        print('📭 No user logged in, returning empty collections');
        return [];
      }
      
      print('📡 Loading favorites for user: $userId');
      
      // 先获取用户收藏的合集 ID
      final favorites = await _client
          .from('user_collection_favorites')
          .select('collection_id')
          .eq('user_id', userId);
      
      if (favorites.isEmpty) {
        print('📭 User has no favorites');
        return [];
      }
      
      final collectionIds = favorites.map((f) => f['collection_id'] as String).toList();
      print('📦 Found ${collectionIds.length} favorite collection IDs');
      
      // 获取这些合集的详细信息
      final response = await _client
          .from('collections')
          .select('*, collection_spots(*, place:places(*))')
          .inFilter('id', collectionIds)
          .order('sort_order');
      
      // 用户收藏的合集，isFavorited 为 true
      return _convertCollectionsList(response, isFavorited: true);
    }
  }
  
  /// 转换合集列表，添加 spotCount 和转换字段名
  List<Map<String, dynamic>> _convertCollectionsList(List<dynamic> collections, {bool isFavorited = false}) => collections.map((collection) {
      final spots = collection['collection_spots'] as List<dynamic>? ?? [];
      final convertedSpots = spots.map((spot) {
        final place = spot['place'] as Map<String, dynamic>?;
        return {
          'id': spot['id'],
          'collectionId': spot['collection_id'],
          'spotId': spot['place_id'],
          'placeId': spot['place_id'],
          'city': spot['city'],
          'sortOrder': spot['sort_order'],
          'spot': place != null ? _convertPlaceToSpot(place) : null,
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
        'isFavorited': isFavorited,
        'spotCount': spots.length,
        'collectionSpots': convertedSpots,
      };
    }).toList().cast<Map<String, dynamic>>();

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

    // 检查当前用户是否收藏了这个合集
    bool isFavorited = false;
    final userId = SupabaseConfig.currentUser?.id;
    if (userId != null) {
      final favorites = await _client
          .from('user_collection_favorites')
          .select('id')
          .eq('user_id', userId)
          .eq('collection_id', id)
          .maybeSingle();
      isFavorited = favorites != null;
    }

    return {
      'id': collection['id'],
      'name': collection['name'],
      'coverImage': collection['cover_image'],
      'description': collection['description'],
      'people': collection['people'],
      'works': collection['works'],
      'isPublished': collection['is_published'],
      'isFavorited': isFavorited,
      'spotCount': spots.length,
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
    
    // 安全解析 tags
    final List<String> parsedTags = [];
    final rawTags = place['tags'];
    if (rawTags is List) {
      for (final item in rawTags) {
        if (item is String) {
          parsedTags.add(item);
        } else if (item is Map<String, dynamic>) {
          final en = item['en'] as String?;
          if (en != null && en.isNotEmpty) {
            parsedTags.add(en);
          }
        }
      }
    }
    
    // 生成 displayTagsEn: category + tags + aiTags，取前 4 个，去重
    final displayTagsEn = <String>[];
    final seenTags = <String>{};
    
    // 1. 先添加 category
    final category = place['category'] as String?;
    if (category != null && category.isNotEmpty) {
      displayTagsEn.add(category);
      seenTags.add(category.toLowerCase());
    }
    
    // 2. 添加 tags
    for (final tag in parsedTags) {
      if (displayTagsEn.length >= 4) break;
      final key = tag.toLowerCase();
      if (seenTags.add(key)) {
        displayTagsEn.add(tag);
      }
    }
    
    // 3. 添加 aiTags
    for (final tag in parsedAiTags) {
      if (displayTagsEn.length >= 4) break;
      final key = tag.toLowerCase();
      if (seenTags.add(key)) {
        displayTagsEn.add(tag);
      }
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
      'tags': parsedTags.isNotEmpty ? parsedTags : parsedAiTags,
      'aiTags': parsedAiTags,
      'displayTagsEn': displayTagsEn, // category + tags + aiTags 合并后取前 4 个
      'aiSummary': place['ai_summary'],
      'aiDescription': place['ai_description'],
      'googlePlaceId': place['google_place_id'],
      // 详情页需要的额外字段
      'phoneNumber': place['phone_number'],
      'website': place['website'],
      'openingHours': place['opening_hours'],
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
        try {
          final items = await _client
              .from('collection_recommendation_items')
              .select('*, collection:collections(*, collectionSpots:collection_spots(*, place:places(*)))')
              .eq('recommendation_id', rec['id'] as Object)
              .order('sort_order', ascending: true);

          // 过滤出已发布的合集并转换字段名
          final filteredItems = items
              .where((item) => item['collection']?['is_published'] == true)
              .map((item) {
                try {
                  final collection = item['collection'] as Map<String, dynamic>?;
                  if (collection == null) return item;
                  
                  // 转换 collection 字段名
                  final convertedCollection = _convertCollectionFields(collection);
                  return {
                    ...item,
                    'collection': convertedCollection,
                  };
                } catch (e) {
                  print('⚠️ Error converting collection: $e');
                  return item;
                }
              })
              .toList();

          result.add({
            'id': rec['id'],
            'name': rec['name'],
            'order': rec['sort_order'],
            'items': filteredItems,
          });
        } catch (e) {
          print('⚠️ Error processing recommendation ${rec['id']}: $e');
        }
      }

      print('✅ Returning ${result.length} recommendations');
      return result;
    } catch (e, stackTrace) {
      print('❌ Error in listRecommendations: $e');
      print('📋 Stack trace: $stackTrace');
      return [];
    }
  }

  /// 转换 collection 字段名从 snake_case 到 camelCase
  Map<String, dynamic> _convertCollectionFields(Map<String, dynamic> collection) {
    try {
      final spots = collection['collectionSpots'] as List<dynamic>? ?? [];
      print('🔄 Converting collection ${collection['id']}, spots count: ${spots.length}');
      
      final convertedSpots = spots.map((spot) {
        try {
          final spotMap = spot as Map<String, dynamic>;
          final place = spotMap['place'] as Map<String, dynamic>?;
          if (place == null) {
            print('⚠️ Spot ${spotMap['id']} has no place data');
            return spotMap;
          }
          
          return <String, dynamic>{
            ...spotMap,
            'place': _convertPlaceFields(place),
            'spot': _convertPlaceToSpot(place),  // 添加 spot 字段
            'spotId': spotMap['place_id'],  // 添加 spotId 字段
          };
        } catch (e) {
          print('⚠️ Error converting spot: $e');
          return spot;
        }
      }).toList();

      return {
        'id': collection['id'],
        'name': collection['name'],
        'coverImage': collection['cover_image'],
        'description': collection['description'],
        'people': collection['people'],
        'works': collection['works'],
        'isPublished': collection['is_published'],
        'spotCount': spots.length,
        'collectionSpots': convertedSpots,
      };
    } catch (e, stackTrace) {
      print('❌ Error in _convertCollectionFields: $e');
      print('📋 Stack trace: $stackTrace');
      print('📦 Collection data: $collection');
      // 返回原始数据而不是抛出异常
      return collection;
    }
  }

  /// 转换 place 字段名从 snake_case 到 camelCase
  Map<String, dynamic> _convertPlaceFields(Map<String, dynamic> place) {
    // 封面图 fallback: cover_image -> images[0] -> 空
    String? coverImage = place['cover_image']?.toString();
    final images = place['images'];
    if ((coverImage == null || coverImage.isEmpty) && images is List && images.isNotEmpty) {
      coverImage = images[0]?.toString();
    }
    
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
    
    // 安全解析 tags
    final List<String> parsedTags = [];
    final rawTags = place['tags'];
    if (rawTags is List) {
      for (final item in rawTags) {
        if (item is String) {
          parsedTags.add(item);
        } else if (item is Map<String, dynamic>) {
          final en = item['en'] as String?;
          if (en != null && en.isNotEmpty) {
            parsedTags.add(en);
          }
        }
      }
    }
    
    // 生成 displayTagsEn: category + tags + aiTags，取前 4 个，去重
    final displayTagsEn = <String>[];
    final seenTags = <String>{};
    
    // 1. 先添加 category
    final category = place['category'] as String?;
    if (category != null && category.isNotEmpty) {
      displayTagsEn.add(category);
      seenTags.add(category.toLowerCase());
    }
    
    // 2. 添加 tags
    for (final tag in parsedTags) {
      if (displayTagsEn.length >= 4) break;
      final key = tag.toLowerCase();
      if (seenTags.add(key)) {
        displayTagsEn.add(tag);
      }
    }
    
    // 3. 添加 aiTags
    for (final tag in parsedAiTags) {
      if (displayTagsEn.length >= 4) break;
      final key = tag.toLowerCase();
      if (seenTags.add(key)) {
        displayTagsEn.add(tag);
      }
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
      'tags': parsedTags.isNotEmpty ? parsedTags : parsedAiTags,
      'aiTags': parsedAiTags,
      'displayTagsEn': displayTagsEn, // category + tags + aiTags 合并后取前 4 个
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

  /// 获取地点关联的合集列表（只返回已发布的合集）
  /// 用于在地点详情页显示合集入口，同时预加载合集详情数据
  Future<List<Map<String, dynamic>>> getCollectionsForPlace(String placeId) async {
    try {
      // 查询 collection_spots 表，获取包含该地点的所有合集，同时获取合集的完整信息
      final response = await _client
          .from('collection_spots')
          .select('collection:collections(id, name, cover_image, description, people, works, is_published, collection_spots(*, place:places(*)))')
          .eq('place_id', placeId);

      // 获取当前用户的收藏状态
      final userId = SupabaseConfig.currentUser?.id;
      Set<String> favoritedIds = {};
      if (userId != null) {
        final favorites = await _client
            .from('user_collection_favorites')
            .select('collection_id')
            .eq('user_id', userId);
        favoritedIds = favorites.map((f) => f['collection_id'] as String).toSet();
      }

      // 过滤出已发布的合集并转换格式
      final collections = <Map<String, dynamic>>[];
      for (final item in response) {
        final collection = item['collection'] as Map<String, dynamic>?;
        if (collection != null && collection['is_published'] == true) {
          final collectionId = collection['id'] as String;
          
          // 转换 spots 数据
          final spots = collection['collection_spots'] as List<dynamic>? ?? [];
          final convertedSpots = spots.map((spot) {
            final place = spot['place'] as Map<String, dynamic>?;
            return {
              'id': spot['id'],
              'collectionId': spot['collection_id'],
              'spotId': spot['place_id'],
              'placeId': spot['place_id'],
              'city': spot['city'],
              'sortOrder': spot['sort_order'],
              'spot': place != null ? _convertPlaceToSpot(place) : null,
            };
          }).toList();

          collections.add({
            'id': collectionId,
            'name': collection['name'],
            'coverImage': collection['cover_image'],
            'description': collection['description'],
            'people': collection['people'],
            'works': collection['works'],
            'isFavorited': favoritedIds.contains(collectionId),
            'collectionSpots': convertedSpots,
          });
        }
      }

      return collections;
    } catch (e) {
      print('❌ Error getting collections for place: $e');
      return [];
    }
  }
}
