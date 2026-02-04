import 'dart:convert';

import 'package:wanderlog/core/supabase/supabase_config.dart';

// 需要过滤的旧标签（不再使用的通用标签）
const _filteredTags = {'place', 'landmark'};

/// 生成 displayTagsEn: category + tags + aiTags，取前 4 个，去重
/// 过滤掉旧的通用标签（如 "place", "landmark"）
List<String> _buildDisplayTags(
    String? category, List<String> parsedTags, List<String> parsedAiTags) {
  final displayTagsEn = <String>[];
  final seenTags = <String>{};

  // 1. 先添加 category
  if (category != null && category.isNotEmpty) {
    displayTagsEn.add(category);
    seenTags.add(category.toLowerCase());
  }

  // 2. 添加 tags（过滤掉旧的通用标签）
  for (final tag in parsedTags) {
    if (displayTagsEn.length >= 4) break;
    final key = tag.toLowerCase();
    if (seenTags.add(key) && !_filteredTags.contains(key)) {
      displayTagsEn.add(tag);
    }
  }

  // 3. 添加 aiTags（过滤掉旧的通用标签）
  for (final tag in parsedAiTags) {
    if (displayTagsEn.length >= 4) break;
    final key = tag.toLowerCase();
    if (seenTags.add(key) && !_filteredTags.contains(key)) {
      displayTagsEn.add(tag);
    }
  }

  return displayTagsEn;
}

/// Supabase 版本的合集仓库
class SupabaseCollectionRepository {
  final _client = SupabaseConfig.client;

  /// 过滤 custom_fields 中隐藏的剧照 (isHidden === true)
  Map<String, dynamic>? _filterHiddenStills(dynamic customFields) {
    if (customFields == null) return null;
    Map<String, dynamic>? parsed;
    if (customFields is Map<String, dynamic>) {
      parsed = customFields;
    } else if (customFields is String && customFields.isNotEmpty) {
      try {
        final decoded = jsonDecode(customFields);
        if (decoded is Map<String, dynamic>) {
          parsed = decoded;
        }
      } catch (_) {
        return null;
      }
    }
    if (parsed == null) return null;

    final stills = parsed['stills'];
    if (stills is! List) return parsed;

    final visibleStills = stills.where((s) {
      if (s is Map<String, dynamic>) {
        return s['isHidden'] != true;
      }
      return true;
    }).toList();

    return {
      ...parsed,
      'stills': visibleStills,
    };
  }

  /// 获取合集列表
  /// [includeAll] = true: 返回所有已发布的合集（用于 explore 页面）
  /// [includeAll] = false: 返回当前用户收藏的合集（用于 MyLand 页面）
  Future<List<Map<String, dynamic>>> listCollections(
      {bool includeAll = false}) async {
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

      final collectionIds =
          favorites.map((f) => f['collection_id'] as String).toList();
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
  List<Map<String, dynamic>> _convertCollectionsList(List<dynamic> collections,
          {bool isFavorited = false}) =>
      collections
          .map((collection) {
            final spots =
                collection['collection_spots'] as List<dynamic>? ?? [];
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
          })
          .toList()
          .cast<Map<String, dynamic>>();

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
        'spotId': spot['place_id'], // 前端期望 spotId
        'placeId': spot['place_id'],
        'city': spot['city'],
        'sortOrder': spot['sort_order'],
        'spot': place != null ? _convertPlaceToSpot(place) : null, // 前端期望 spot
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

    // Debug: Log people and works data
    // print('🔍 [getCollection] id: $id');
    // print('🔍 [getCollection] people raw: ${collection['people']} (type: ${collection['people']?.runtimeType})');
    // print('🔍 [getCollection] works raw: ${collection['works']} (type: ${collection['works']?.runtimeType})');

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
    if ((coverImage == null || coverImage.isEmpty) &&
        images is List &&
        images.isNotEmpty) {
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

    // 安全解析 tags - 支持 List 和 Map 两种格式
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
    } else if (rawTags is Map) {
      // 处理结构化标签格式: {type: ['Architecture'], architect: ['Junya Ishigami']}
      for (final entry in rawTags.entries) {
        final value = entry.value;
        if (value is List) {
          for (final v in value) {
            if (v is String && v.isNotEmpty) {
              parsedTags.add(v);
            }
          }
        } else if (value is String && value.isNotEmpty) {
          parsedTags.add(value);
        }
      }
    }

    // 获取 category（优先使用 category_en）
    final category =
        (place['category_en'] as String?) ?? (place['category'] as String?);

    // 生成 displayTagsEn: category + tags + aiTags，取前 4 个，去重
    final displayTagsEn = _buildDisplayTags(category, parsedTags, parsedAiTags);

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
      'collectionCoverImage': place['collection_cover_image'],
      'images': place['images'],
      'rating': place['rating'],
      'ratingCount': place['rating_count'],
      'category': category ?? place['category'],
      'categoryEn': place['category_en'],
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
      // 剧照数据
      'customFields': _filterHiddenStills(place['custom_fields']),
    };
  }

  /// 获取合集推荐列表 - 优化版本：包含 spot count 和 mainCity
  Future<List<Map<String, dynamic>>> listRecommendations() async {
    try {
      print('📡 [Fast] Fetching recommendations from Supabase');
      final startTime = DateTime.now();

      // 一次性获取所有需要的数据，包括 spot count
      final items =
          await _client.from('collection_recommendation_items').select('''
            id,
            recommendation_id,
            collection_id,
            sort_order,
            collection:collections(
              id,
              name,
              description,
              cover_image,
              people,
              works,
              is_published,
              created_at,
              updated_at,
              collection_spots(count)
            )
          ''').order('sort_order', ascending: true);

      print(
          '📦 Loaded ${items.length} recommendation items in ${DateTime.now().difference(startTime).inMilliseconds}ms');

      // 获取推荐组信息
      final recommendations = await _client
          .from('collection_recommendations')
          .select('id, name, sort_order, is_active')
          .eq('is_active', true)
          .order('sort_order', ascending: true);

      print('📊 Found ${recommendations.length} recommendation groups');

      // 获取所有合集ID
      final collectionIds = <String>{};
      for (final item in items) {
        final collection = item['collection'] as Map<String, dynamic>?;
        if (collection != null && collection['is_published'] == true) {
          collectionIds.add(item['collection_id'] as String);
        }
      }

      // 获取每个合集的地点数据（用于计算主要城市）
      // 注意：如果 collectionIds 为空，跳过查询避免错误
      List<dynamic> collectionSpotDetails = [];
      if (collectionIds.isNotEmpty) {
        collectionSpotDetails = await _client
            .from('collection_spots')
            .select('''
              collection_id,
              place:places(city, rating_count)
            ''')
            .inFilter('collection_id', collectionIds.toList());
      }

      // 计算每个合集的主要城市
      // 规则：
      // 1. 选择地点数量最多的城市
      // 2. 如果有多个城市地点数相同，选择其中评价人数（ratingCount）最多的地点所对应的城市
      final mainCityMap = <String, String>{};
      for (final collectionId in collectionIds) {
        final spots = collectionSpotDetails
            .where((s) => s['collection_id'] == collectionId)
            .toList();

        // 统计每个城市的地点数量和最高评价数
        final cityStats = <String, ({int count, int maxRatingCount})>{};

        for (final spot in spots) {
          final place = spot['place'] as Map<String, dynamic>?;
          final city = place?['city'] as String?;
          final ratingCount = (place?['rating_count'] as num?)?.toInt() ?? 0;

          if (city != null && city.isNotEmpty) {
            final existing = cityStats[city];
            if (existing != null) {
              cityStats[city] = (
                count: existing.count + 1,
                maxRatingCount: existing.maxRatingCount > ratingCount
                    ? existing.maxRatingCount
                    : ratingCount,
              );
            } else {
              cityStats[city] = (count: 1, maxRatingCount: ratingCount);
            }
          }
        }

        if (cityStats.isNotEmpty) {
          // 找出地点数量最多的城市（可能有多个）
          var maxCount = 0;
          for (final stats in cityStats.values) {
            if (stats.count > maxCount) {
              maxCount = stats.count;
            }
          }

          // 筛选出所有地点数量等于最大值的城市
          final topCities = <({String city, int maxRatingCount})>[];
          for (final entry in cityStats.entries) {
            if (entry.value.count == maxCount) {
              topCities.add((
                city: entry.key,
                maxRatingCount: entry.value.maxRatingCount,
              ));
            }
          }

          // 如果只有一个城市，直接使用；如果有多个，按最高评价数排序
          if (topCities.length == 1) {
            mainCityMap[collectionId] = topCities.first.city;
          } else {
            // 平局时，选择评价人数最多的地点所在的城市
            topCities.sort((a, b) => b.maxRatingCount.compareTo(a.maxRatingCount));
            mainCityMap[collectionId] = topCities.first.city;
          }
        }
      }

      // 按推荐组分组
      final Map<String, List<dynamic>> groupedItems = {};
      for (final item in items) {
        final recId = item['recommendation_id'] as String;
        final collection = item['collection'] as Map<String, dynamic>?;

        // 只包含已发布的合集
        if (collection != null && collection['is_published'] == true) {
          groupedItems.putIfAbsent(recId, () => []).add(item);
        }
      }

      // 构建结果 - 包含 spotCount 和 mainCity
      final result = <Map<String, dynamic>>[];
      for (final rec in recommendations) {
        final recId = rec['id'] as String;
        final recItems = groupedItems[recId] ?? [];

        if (recItems.isNotEmpty) {
          result.add({
            'id': recId,
            'name': rec['name'],
            'order': rec['sort_order'],
            'items': recItems.map((item) {
              final collection = item['collection'] as Map<String, dynamic>;
              final collectionId = item['collection_id'] as String;
              // 获取 spot count
              final collectionSpots =
                  collection['collection_spots'] as List<dynamic>?;
              final spotCount = collectionSpots?.isNotEmpty == true
                  ? (collectionSpots!.first['count'] as int?) ?? 0
                  : 0;

              return {
                'id': item['id'],
                'collection': {
                  'id': collection['id'],
                  'name': collection['name'],
                  'description': collection['description'],
                  'coverImage': collection['cover_image'],
                  'people': collection['people'],
                  'works': collection['works'],
                  'isPublished': collection['is_published'],
                  'createdAt': collection['created_at'],
                  'updatedAt': collection['updated_at'],
                  'spotCount': spotCount,
                  'mainCity': mainCityMap[collectionId],
                },
              };
            }).toList(),
          });
        }
      }

      final totalTime = DateTime.now().difference(startTime).inMilliseconds;
      print(
          '✅ [Fast] Returning ${result.length} recommendations in ${totalTime}ms');
      return result;
    } catch (e, stackTrace) {
      print('❌ Error in listRecommendations: $e');
      print('📋 Stack trace: $stackTrace');
      return [];
    }
  }

  /// 转换 collection 字段名从 snake_case 到 camelCase
  Map<String, dynamic> _convertCollectionFields(
      Map<String, dynamic> collection) {
    try {
      final spots = collection['collectionSpots'] as List<dynamic>? ?? [];
      print(
          '🔄 Converting collection ${collection['id']}, spots count: ${spots.length}');

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
            'spot': _convertPlaceToSpot(place), // 添加 spot 字段
            'spotId': spotMap['place_id'], // 添加 spotId 字段
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
    if ((coverImage == null || coverImage.isEmpty) &&
        images is List &&
        images.isNotEmpty) {
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

    // 安全解析 tags - 支持 List 和 Map 两种格式
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
    } else if (rawTags is Map) {
      // 处理结构化标签格式: {type: ['Architecture'], architect: ['Junya Ishigami']}
      for (final entry in rawTags.entries) {
        final value = entry.value;
        if (value is List) {
          for (final v in value) {
            if (v is String && v.isNotEmpty) {
              parsedTags.add(v);
            }
          }
        } else if (value is String && value.isNotEmpty) {
          parsedTags.add(value);
        }
      }
    }

    // 获取 category（优先使用 category_en）
    final category =
        (place['category_en'] as String?) ?? (place['category'] as String?);

    // 生成 displayTagsEn: category + tags + aiTags，取前 4 个，去重
    final displayTagsEn = _buildDisplayTags(category, parsedTags, parsedAiTags);

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
      'collectionCoverImage': place['collection_cover_image'],
      'images': place['images'],
      'rating': place['rating'],
      'ratingCount': place['rating_count'],
      'category': category ?? place['category'],
      'categoryEn': place['category_en'],
      'tags': parsedTags.isNotEmpty ? parsedTags : parsedAiTags,
      'aiTags': parsedAiTags,
      'displayTagsEn': displayTagsEn, // category + tags + aiTags 合并后取前 4 个
      'aiSummary': place['ai_summary'],
      'aiDescription': place['ai_description'],
      // 剧照数据
      'customFields': _filterHiddenStills(place['custom_fields']),
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
        .select(
            '*, collection:collections(*, collectionSpots:collection_spots(*, place:places(*)))')
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
    }).toList();

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
  Future<List<Map<String, dynamic>>> getCollectionsForPlace(
      String placeId) async {
    // 验证 placeId 是有效的 UUID 格式
    final uuidRegex = RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      caseSensitive: false,
    );
    if (!uuidRegex.hasMatch(placeId)) {
      print(
          '⚠️ [getCollectionsForPlace] Invalid UUID format, skipping: $placeId');
      return [];
    }

    try {
      // 查询 collection_spots 表，获取包含该地点的所有合集，同时获取合集的完整信息
      final response = await _client
          .from('collection_spots')
          .select(
              'collection:collections(id, name, cover_image, description, people, works, is_published, collection_spots(*, place:places(*)))')
          .eq('place_id', placeId);

      // 获取当前用户的收藏状态
      final userId = SupabaseConfig.currentUser?.id;
      Set<String> favoritedIds = {};
      if (userId != null) {
        final favorites = await _client
            .from('user_collection_favorites')
            .select('collection_id')
            .eq('user_id', userId);
        favoritedIds =
            favorites.map((f) => f['collection_id'] as String).toSet();
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
