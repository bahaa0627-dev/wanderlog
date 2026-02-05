import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/core/utils/category_emoji.dart';
import 'package:wanderlog/core/providers/dio_provider.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/map/data/models/public_place_dto.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart';
import 'package:wanderlog/shared/models/spot_model.dart';

/// Data model for a check-in photo with associated metadata
class CheckInPhoto {
  const CheckInPhoto({
    required this.photoUrl,
    required this.spotId,
    required this.spotName,
    required this.city,
    required this.country,
    required this.visitDate,
    required this.category,
    required this.tags,
    this.userNotes,
  });

  final String photoUrl;
  final String spotId;
  final String spotName;
  final String city;
  final String country;
  final DateTime visitDate;
  final String? userNotes;
  final String category;
  final List<String> tags;
}

/// Data model for category count with emoji
class CategoryCount {
  const CategoryCount({
    required this.category,
    required this.count,
    required this.emoji,
  });

  final String category;
  final int count;
  final String emoji;
}

/// Data model for a visited spot marker on the map
class VisitedSpotMarker {
  const VisitedSpotMarker({
    required this.id,
    required this.name,
    required this.latitude,
    required this.longitude,
    required this.city,
    required this.country,
    required this.category,
    required this.visitDate,
  });

  final String id;
  final String name;
  final double latitude;
  final double longitude;
  final String city;
  final String country;
  final String category;
  final DateTime visitDate;
}

/// Complete data for the Mine page
class MinePageData {
  const MinePageData({
    required this.countriesCount,
    required this.citiesCount,
    required this.mapMarkers,
    required this.topCategories,
    required this.photos,
    required this.visitedSpots,
  });

  final int countriesCount;
  final int citiesCount;
  final List<VisitedSpotMarker> mapMarkers;
  final List<CategoryCount> topCategories;
  final List<CheckInPhoto> photos;
  final List<TripSpot> visitedSpots;

  static const empty = MinePageData(
    countriesCount: 0,
    citiesCount: 0,
    mapMarkers: [],
    topCategories: [],
    photos: [],
    visitedSpots: [],
  );
}

/// Provider for Mine page data
/// Uses keepAlive to cache data and improve performance
final minePageDataProvider = FutureProvider<MinePageData>((ref) async {
  try {
    print('🏠 [MinePageProvider] Loading mine summary data...');
    final startTime = DateTime.now();

    // 检查认证状态
    final authState = ref.watch(authProvider);
    print(
      '🏠 [MinePageProvider] Auth state: isAuthenticated=${authState.isAuthenticated}',
    );

    if (!authState.isAuthenticated) {
      print(
        '⚠️ [MinePageProvider] User not authenticated, returning empty data',
      );
      return MinePageData.empty;
    }

    // 使用新的 /api/mine/summary 端点，只获取已访问的 spots
    final dio = ref.watch(dioProvider);
    final baseUrl = dio.options.baseUrl;
    final fullUrl = '$baseUrl/mine/summary';
    print('🏠 [MinePageProvider] Calling GET $fullUrl...');

    final response = await dio.get<List<dynamic>>('/mine/summary');
    final apiDuration = DateTime.now().difference(startTime).inMilliseconds;
    print('🏠 [MinePageProvider] API request completed in ${apiDuration}ms');
    print('🏠 [MinePageProvider] Response status: ${response.statusCode}');
    print(
      '🏠 [MinePageProvider] Response data type: ${response.data.runtimeType}',
    );

    if (response.data == null) {
      print('❌ [MinePageProvider] Response data is null!');
      return MinePageData.empty;
    }

    final List<dynamic> data;
    if (response.data is List) {
      data = response.data as List<dynamic>;
    } else {
      print(
        '❌ [MinePageProvider] Expected List but got ${response.data.runtimeType}',
      );
      print('🔍 Response data: ${response.data}');
      return MinePageData.empty;
    }

    print('🏠 [MinePageProvider] Received ${data.length} visited spots');

    if (data.isEmpty) {
      print('⚠️ [MinePageProvider] No data returned from server');
      return MinePageData.empty;
    }

    final processStart = DateTime.now();
    final result = _processMineRawData(data);
    final processTime = DateTime.now().difference(processStart).inMilliseconds;

    print('🏠 [MinePageProvider] Processed in ${processTime}ms:');
    print(
      '🏠   - ${result.countriesCount} countries, ${result.citiesCount} cities',
    );
    print('🏠   - ${result.mapMarkers.length} markers');
    print('🏠   - ${result.photos.length} photos');
    print('🏠   - ${result.visitedSpots.length} visited spots');
    print('🏠   - ${result.topCategories.length} top categories');
    print('🏠 [MinePageProvider] Total time: ${apiDuration + processTime}ms');

    // Keep data alive to avoid unnecessary reloads
    ref.keepAlive();

    return result;
  } catch (e, stack) {
    print('❌ [MinePageProvider] Error loading mine data:');
    print('   Error type: ${e.runtimeType}');
    print('   Error message: $e');
    if (e is DioException) {
      print('   Dio error type: ${e.type}');
      print('   Dio response: ${e.response?.data}');
      print('   Dio status code: ${e.response?.statusCode}');

      // 如果是 401 未授权错误，返回空数据而不是抛出错误
      // 这样用户可以看到空状态界面，而不是错误页面
      if (e.response?.statusCode == 401) {
        print('⚠️ [MinePageProvider] 401 Unauthorized - returning empty data');
        return MinePageData.empty;
      }
    }
    print('   Stack trace: $stack');
    rethrow;
  }
});

/// Process raw mine data from /api/mine/summary
MinePageData _processMineRawData(List<dynamic> rawData) {
  print('🔧 [MinePageProvider] Processing ${rawData.length} raw items...');

  final Set<String> countries = {};
  final Set<String> cities = {};
  final List<VisitedSpotMarker> markers = [];
  final List<CheckInPhoto> photos = [];
  final Map<String, int> categoryCounts = {};
  final List<TripSpot> visitedSpots = [];

  for (final item in rawData) {
    try {
      final itemMap = item as Map<String, dynamic>;

      // 调试：打印第一个 item 的结构
      if (visitedSpots.isEmpty) {
        print('🔍 [MinePageProvider] First item structure:');
        print('  - Keys: ${itemMap.keys.toList()}');
        print('  - Has place: ${itemMap.containsKey('place')}');
        if (itemMap.containsKey('place')) {
          final placeMap = itemMap['place'] as Map<String, dynamic>?;
          print('  - Place keys: ${placeMap?.keys.toList()}');
        }
      }

      final placeMap = itemMap['place'] as Map<String, dynamic>?;

      if (placeMap == null) {
        print('⚠️ [MinePageProvider] Skipping item with null place');
        continue;
      }

      // 构建 Spot 对象
      final coverImageUrl = placeMap['coverImage'] as String?;

      // 处理 images - 可能是 List / String(json)
      List<String> images = [];
      final imagesRaw = placeMap['images'];
      if (imagesRaw is List) {
        images = imagesRaw
            .map((e) => e.toString())
            .where((s) => s.isNotEmpty)
            .toList();
      } else if (imagesRaw is String && imagesRaw.isNotEmpty) {
        images = _parseStringList(imagesRaw);
      }
      if (images.isEmpty && coverImageUrl != null && coverImageUrl.isNotEmpty) {
        images = [coverImageUrl];
      }

      final ratingRaw = placeMap['rating'];
      final rating = ratingRaw is num ? ratingRaw.toDouble() : null;
      final ratingCountRaw =
          placeMap['ratingCount'] ?? placeMap['rating_count'];
      final ratingCount = ratingCountRaw is num ? ratingCountRaw.toInt() : null;

      final openingHoursRaw =
          placeMap['openingHours'] ?? placeMap['opening_hours'];
      final openingHours = _parseOpeningHours(openingHoursRaw);

      // 处理 tags - 可能是 List / Map / String(json)
      List<String> tags = [];
      final tagsRaw = placeMap['tags'];
      if (tagsRaw is List) {
        tags = tagsRaw.map((e) => e.toString()).toList();
      } else if (tagsRaw is Map) {
        tags = _extractTagsFromStructured(Map<String, dynamic>.from(tagsRaw));
      } else if (tagsRaw is String && tagsRaw.isNotEmpty) {
        tags = _parseTagsFromString(tagsRaw);
      }

      // 处理 aiTags - 可能是 List / String(json)
      List<dynamic> aiTags = [];
      final aiTagsRaw = placeMap['aiTags'];
      if (aiTagsRaw is List) {
        aiTags = List<dynamic>.from(aiTagsRaw);
      } else if (aiTagsRaw is String && aiTagsRaw.isNotEmpty) {
        aiTags = _parseDynamicList(aiTagsRaw);
      }

      final customFields = _parseCustomFields(placeMap['customFields']);

      final spot = Spot(
        id: placeMap['id'] as String,
        name: placeMap['name'] as String,
        latitude: (placeMap['latitude'] as num).toDouble(),
        longitude: (placeMap['longitude'] as num).toDouble(),
        googlePlaceId: placeMap['googlePlaceId'] as String? ??
            placeMap['google_place_id'] as String?,
        city: placeMap['city'] as String? ?? '',
        country: placeMap['country'] as String? ?? '',
        category: placeMap['category'] as String? ?? 'other',
        tags: tags,
        aiTags: aiTags,
        coverImage: coverImageUrl,
        images: images,
        address: placeMap['address'] as String?,
        phoneNumber: placeMap['phoneNumber'] as String? ??
            placeMap['phone_number'] as String?,
        website: placeMap['website'] as String?,
        openingHours: openingHours,
        rating: rating,
        ratingCount: ratingCount,
        customFields: customFields,
      );

      // 构建 TripSpot 对象
      final visitDateStr = itemMap['visitDate'] as String?;
      final updatedAtStr = itemMap['updatedAt'] as String?;
      final visitDate =
          visitDateStr != null ? DateTime.parse(visitDateStr) : null;
      final updatedAt =
          updatedAtStr != null ? DateTime.parse(updatedAtStr) : null;

      final userPhotos = (itemMap['userPhotos'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [];

      final tripSpot = TripSpot(
        id: itemMap['id'] as String,
        tripId: '', // 不需要 tripId
        spotId: spot.id,
        spot: spot,
        isVisited: true,
        visitDate: visitDate,
        updatedAt: updatedAt,
        userPhotos: userPhotos,
        userNotes: itemMap['userNotes'] as String?,
        userRating: itemMap['userRating'] as int?,
      );

      visitedSpots.add(tripSpot);

      // Track countries and cities
      if (spot.country != null && spot.country!.isNotEmpty) {
        countries.add(spot.country!);
      }
      if (spot.city != null && spot.city!.isNotEmpty) cities.add(spot.city!);

      // Create marker with visit date
      final markerDate = visitDate ?? updatedAt ?? DateTime.now();
      markers.add(
        VisitedSpotMarker(
          id: spot.id,
          name: spot.name,
          latitude: spot.latitude,
          longitude: spot.longitude,
          city: spot.city ?? '',
          country: spot.country ?? '',
          category: spot.category ?? 'other',
          visitDate: markerDate,
        ),
      );

      final categoryEn = placeMap['categoryEn'] as String? ??
          placeMap['category_en'] as String? ??
          spot.category;

      // Count categories
      _countCategories(
        categoryCounts,
        categoryEn,
        spot.tags,
        spot.aiTags,
      );

      // Collect photos
      final photoDate = visitDate ?? updatedAt ?? DateTime.now();
      for (final photoUrl in userPhotos) {
        if (photoUrl.isNotEmpty) {
          photos.add(
            CheckInPhoto(
              photoUrl: photoUrl,
              spotId: spot.id,
              spotName: spot.name,
              city: spot.city ?? '',
              country: spot.country ?? '',
              visitDate: photoDate,
              userNotes: tripSpot.userNotes,
              category: spot.category ?? 'other',
              tags: spot.tags,
            ),
          );
        }
      }
    } catch (e) {
      print('🏠 [MinePageProvider] Error processing item: $e');
      continue;
    }
  }

  // Sort photos by visit date (newest first)
  photos.sort((a, b) => b.visitDate.compareTo(a.visitDate));

  // Get top 4 categories
  final sortedCategories = categoryCounts.entries.toList()
    ..sort((a, b) => b.value.compareTo(a.value));

  final topCategories = sortedCategories
      .take(4)
      .map((entry) => CategoryCount(
            category: entry.key,
            count: entry.value,
            emoji: getCategoryEmoji(entry.key),
          ))
      .toList();

  return MinePageData(
    countriesCount: countries.length,
    citiesCount: cities.length,
    mapMarkers: markers,
    topCategories: topCategories,
    photos: photos,
    visitedSpots: visitedSpots,
  );
}

/// Count categories from various sources
void _countCategories(
  Map<String, int> counts,
  String? category,
  List<String> tags,
  List<dynamic>? aiTags,
) {
  // Count main category
  if (category != null && category.isNotEmpty) {
    final normalizedCategory = _normalizeCategory(category);
    counts[normalizedCategory] = (counts[normalizedCategory] ?? 0) + 1;
  }

  // Count tags
  for (final tag in tags) {
    if (tag.isNotEmpty && !_isInvalidTag(tag)) {
      final normalizedTag = _normalizeCategory(tag);
      counts[normalizedTag] = (counts[normalizedTag] ?? 0) + 1;
    }
  }

  // Count AI tags
  if (aiTags != null) {
    for (final tag in _extractAiTagLabels(aiTags)) {
      if (tag.isNotEmpty && !_isInvalidTag(tag)) {
        final normalizedTag = _normalizeCategory(tag);
        counts[normalizedTag] = (counts[normalizedTag] ?? 0) + 1;
      }
    }
  }
}

/// Normalize category name for display
String _normalizeCategory(String category) {
  final lower = category.toLowerCase().trim();
  // Capitalize first letter
  if (lower.isEmpty) return lower;
  return lower[0].toUpperCase() + lower.substring(1);
}

/// Check if tag should be filtered out
bool _isInvalidTag(String tag) {
  const invalidTags = {
    'others',
    'point_of_interest',
    'establishment',
    'premise',
    'subpremise',
    'route',
    'street_address',
    'political',
    'locality',
    'sublocality',
    'neighborhood',
    'administrative_area_level_1',
    'administrative_area_level_2',
    'country',
    'postal_code',
  };
  return invalidTags.contains(tag.toLowerCase());
}

List<String> _extractAiTagLabels(List<dynamic> aiTags) {
  final result = <String>[];
  for (final tag in aiTags) {
    if (tag is Map) {
      final en = tag['en']?.toString();
      final zh = tag['zh']?.toString();
      final label = (en != null && en.isNotEmpty) ? en : (zh ?? '');
      if (label.isNotEmpty) result.add(label);
      continue;
    }
    if (tag is String) {
      final trimmed = tag.trim();
      if (trimmed.isEmpty) continue;
      if (trimmed.contains('{') || trimmed.contains('}')) continue;
      result.add(trimmed);
    }
  }
  return result;
}

List<String> _parseStringList(String raw) {
  try {
    final decoded = jsonDecode(raw);
    if (decoded is List) {
      return decoded
          .map((e) => e?.toString() ?? '')
          .where((s) => s.isNotEmpty)
          .toList();
    }
  } catch (_) {}
  return [];
}

List<dynamic> _parseDynamicList(String raw) {
  try {
    final decoded = jsonDecode(raw);
    if (decoded is List) {
      return decoded;
    }
  } catch (_) {}
  return [];
}

List<String> _parseTagsFromString(String raw) {
  try {
    final decoded = jsonDecode(raw);
    if (decoded is List) {
      return decoded
          .map((e) => e?.toString() ?? '')
          .where((s) => s.isNotEmpty)
          .toList();
    }
    if (decoded is Map) {
      return _extractTagsFromStructured(Map<String, dynamic>.from(decoded));
    }
  } catch (_) {}
  return [];
}

List<String> _extractTagsFromStructured(Map<String, dynamic> raw) {
  final result = <String>[];
  raw.forEach((_, value) {
    if (value is List) {
      for (final item in value) {
        final tag = item?.toString() ?? '';
        if (tag.isNotEmpty) result.add(tag);
      }
    }
  });
  return result;
}

Map<String, dynamic>? _parseOpeningHours(dynamic value) {
  if (value == null) return null;
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  if (value is List) {
    return {'weekday_text': value.map((e) => e.toString()).toList()};
  }
  if (value is String && value.trim().isNotEmpty) {
    try {
      final decoded = jsonDecode(value);
      if (decoded is Map<String, dynamic>) return decoded;
      if (decoded is Map) return Map<String, dynamic>.from(decoded);
      if (decoded is List) {
        return {'weekday_text': decoded.map((e) => e.toString()).toList()};
      }
    } catch (_) {}
  }
  return null;
}

PlaceCustomFields? _parseCustomFields(dynamic value) {
  if (value == null) return null;
  if (value is Map<String, dynamic>) {
    return PlaceCustomFields.fromJson(value);
  }
  if (value is Map) {
    return PlaceCustomFields.fromJson(Map<String, dynamic>.from(value));
  }
  if (value is String && value.trim().isNotEmpty) {
    try {
      final decoded = jsonDecode(value);
      if (decoded is Map<String, dynamic>) {
        return PlaceCustomFields.fromJson(decoded);
      }
      if (decoded is Map) {
        return PlaceCustomFields.fromJson(Map<String, dynamic>.from(decoded));
      }
    } catch (_) {}
  }
  return null;
}
