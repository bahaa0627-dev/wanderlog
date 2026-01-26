import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:wanderlog/shared/models/spot_model.dart';

/// Spots 页面缓存数据条目
class CachedSpotEntry {
  final Spot spot;
  final String city;
  final String citySlug;
  final bool isSaved;
  final bool isMustGo;
  final bool isTodaysPlan;
  final bool isVisited;
  final String? destinationId;
  final DateTime addedAt;
  // Check-in 数据
  final DateTime? visitDate;
  final int? userRating;
  final String? userNotes;
  final List<String> userPhotos;

  CachedSpotEntry({
    required this.spot,
    required this.city,
    required this.citySlug,
    required this.isSaved,
    required this.isMustGo,
    required this.isTodaysPlan,
    required this.isVisited,
    required this.destinationId,
    required this.addedAt,
    this.visitDate,
    this.userRating,
    this.userNotes,
    this.userPhotos = const [],
  });

  Map<String, dynamic> toJson() => {
        'spot': _spotToLightJson(spot),
        'city': city,
        'citySlug': citySlug,
        'isSaved': isSaved,
        'isMustGo': isMustGo,
        'isTodaysPlan': isTodaysPlan,
        'isVisited': isVisited,
        'destinationId': destinationId,
        'addedAt': addedAt.millisecondsSinceEpoch,
        'visitDate': visitDate?.millisecondsSinceEpoch,
        'userRating': userRating,
        'userNotes': userNotes,
        'userPhotos': userPhotos,
      };

  factory CachedSpotEntry.fromJson(Map<String, dynamic> json) {
    return CachedSpotEntry(
      spot: _spotFromLightJson(json['spot'] as Map<String, dynamic>),
      city: json['city'] as String,
      citySlug: json['citySlug'] as String,
      isSaved: json['isSaved'] as bool? ?? false,
      isMustGo: json['isMustGo'] as bool? ?? false,
      isTodaysPlan: json['isTodaysPlan'] as bool? ?? false,
      isVisited: json['isVisited'] as bool? ?? false,
      destinationId: json['destinationId'] as String?,
      addedAt: DateTime.fromMillisecondsSinceEpoch(json['addedAt'] as int),
      visitDate: json['visitDate'] != null
          ? DateTime.fromMillisecondsSinceEpoch(json['visitDate'] as int)
          : null,
      userRating: json['userRating'] as int?,
      userNotes: json['userNotes'] as String?,
      userPhotos: (json['userPhotos'] as List?)?.cast<String>() ?? [],
    );
  }

  static Map<String, dynamic> _spotToLightJson(Spot spot) {
    return {
      'id': spot.id,
      'name': spot.name,
      'city': spot.city,
      'country': spot.country,
      'category': spot.category,
      'latitude': spot.latitude,
      'longitude': spot.longitude,
      'address': spot.address,
      'openingHours': spot.openingHours,
      'website': spot.website,
      'phoneNumber': spot.phoneNumber,
      'googlePlaceId': spot.googlePlaceId,
      'ratingCount': spot.ratingCount,
      'images':
          spot.images.isNotEmpty ? <String>[spot.images.first] : <String>[],
      'tags': spot.tags,
      'displayTagsEn': spot.displayTagsEn,
      'aiTags': spot.aiTags,
      'rating': spot.rating,
      'priceLevel': spot.priceLevel,
      'createdAt': spot.createdAt?.toIso8601String(),
      'updatedAt': spot.updatedAt?.toIso8601String(),
      // customFields 暂不缓存（避免复杂序列化）
    };
  }

  static Spot _spotFromLightJson(Map<String, dynamic> json) {
    return Spot(
      id: json['id'] as String,
      name: json['name'] as String,
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      city: json['city'] as String?,
      country: json['country'] as String?,
      category: json['category'] as String?,
      address: json['address'] as String?,
      openingHours: json['openingHours'] as Map<String, dynamic>?,
      website: json['website'] as String?,
      phoneNumber: json['phoneNumber'] as String?,
      googlePlaceId: json['googlePlaceId'] as String?,
      ratingCount: json['ratingCount'] as int?,
      images: (json['images'] as List?)?.cast<String>() ?? [],
      tags: (json['tags'] as List?)?.cast<String>() ?? [],
      displayTagsEn: (json['displayTagsEn'] as List?)?.cast<String>(),
      aiTags: json['aiTags'] as List?,
      rating: (json['rating'] as num?)?.toDouble(),
      priceLevel: json['priceLevel'] as int?,
      // customFields 从服务器获取，不从缓存恢复
      createdAt: json['createdAt'] != null
          ? DateTime.parse(json['createdAt'] as String)
          : null,
      updatedAt: json['updatedAt'] != null
          ? DateTime.parse(json['updatedAt'] as String)
          : null,
    );
  }
}

/// Spots 页面缓存服务
/// 用于缓存城市的 spots 数据和 tab 计数，实现秒级加载
class SpotCacheService {
  static const String _keyPrefix = 'spots_cache_v3_'; // v3: 包含完整字段（营业时间、地址等）
  static const String _countsPrefix = 'spots_counts_v3_';
  static const String _timestampPrefix = 'spots_timestamp_v3_';
  static const Duration _cacheExpiry = Duration(hours: 24); // 缓存有效期24小时

  /// 保存城市的 spots 数据（包含完整状态）
  Future<void> saveCitySpots({
    required String citySlug,
    required List<CachedSpotEntry> entries,
    required Map<String, int> tabCounts,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();

      // 保存 entries 数据（包含完整状态）
      final entriesList = entries.map((e) => e.toJson()).toList();
      await prefs.setString('$_keyPrefix$citySlug', jsonEncode(entriesList));

      // 调试：检查第一个序列化后的数据
      if (entriesList.isNotEmpty) {
        final firstJson = entriesList.first;
        print('🔍 [SpotCache] Serialized first spot:');
        print('  - has address: ${firstJson['spot']['address'] != null}');
        print(
            '  - has openingHours: ${firstJson['spot']['openingHours'] != null}');
        print('  - has website: ${firstJson['spot']['website'] != null}');
      }

      // 保存 tab 计数
      await prefs.setString('$_countsPrefix$citySlug', jsonEncode(tabCounts));

      // 保存时间戳
      await prefs.setInt(
          '$_timestampPrefix$citySlug', DateTime.now().millisecondsSinceEpoch);

      print('💾 [SpotCache] Saved ${entries.length} entries for $citySlug');
    } catch (e) {
      print('❌ [SpotCache] Failed to save cache for $citySlug: $e');
    }
  }

  /// 读取城市的 spots 数据
  Future<CachedSpotData?> getCitySpots(String citySlug) async {
    try {
      final prefs = await SharedPreferences.getInstance();

      // 尝试读取 v3 缓存（包含完整字段）
      print('🔍 [SpotCache] Looking for v3 cache for $citySlug');
      final timestamp = prefs.getInt('$_timestampPrefix$citySlug');

      if (timestamp == null) {
        // v3 缓存不存在，尝试读取 v1/v2 缓存作为后备
        print('📭 [SpotCache] No v3 cache found, trying v1/v2 for $citySlug');
        return await _tryLoadLegacyCache(prefs, citySlug);
      }

      final cacheTime = DateTime.fromMillisecondsSinceEpoch(timestamp);
      final age = DateTime.now().difference(cacheTime);
      print('📅 [SpotCache] Cache age: ${age.inMinutes} minutes');

      if (age > _cacheExpiry) {
        // 缓存过期，但先尝试返回它（让后台刷新）
        print(
            '⏰ [SpotCache] Cache expired for $citySlug (age: ${age.inHours}h), but will try to use it');
        // 不立即清理，而是返回过期数据
      }

      // 读取 entries
      final entriesJson = prefs.getString('$_keyPrefix$citySlug');
      if (entriesJson == null) {
        print('📭 [SpotCache] No v3 entries found, trying v1/v2 for $citySlug');
        return await _tryLoadLegacyCache(prefs, citySlug);
      }

      final entriesList = (jsonDecode(entriesJson) as List)
          .map((json) => CachedSpotEntry.fromJson(json as Map<String, dynamic>))
          .toList();

      // 调试：检查恢复的第一个数据
      if (entriesList.isNotEmpty) {
        final first = entriesList.first;
        print('📦 [SpotCache] Restored first spot from v3 cache:');
        print('  - name: ${first.spot.name}');
        print('  - address: ${first.spot.address}');
        print(
            '  - openingHours: ${first.spot.openingHours != null ? "YES" : "NULL"}');
        print('  - website: ${first.spot.website}');
      }

      // 读取 tab 计数
      final countsJson = prefs.getString('$_countsPrefix$citySlug');
      final tabCounts = countsJson != null
          ? Map<String, int>.from(jsonDecode(countsJson) as Map)
          : <String, int>{};

      print(
          '✅ [SpotCache] Loaded ${entriesList.length} entries from cache for $citySlug');

      return CachedSpotData(
        entries: entriesList,
        tabCounts: tabCounts,
        cachedAt: cacheTime,
      );
    } catch (e) {
      print('❌ [SpotCache] Failed to load cache for $citySlug: $e');
      return null;
    }
  }

  /// 尝试读取旧版本（v1/v2）的缓存作为后备
  Future<CachedSpotData?> _tryLoadLegacyCache(
      SharedPreferences prefs, String citySlug) async {
    try {
      print('🔄 [SpotCache] Attempting to load legacy cache for $citySlug');

      // 先尝试 v2（没有完整字段）
      final v2TimestampPrefix = 'spots_timestamp_v2_';

      final v2Timestamp = prefs.getInt('$v2TimestampPrefix$citySlug');
      if (v2Timestamp != null) {
        print(
            '📦 [SpotCache] Found v2 cache, but ignoring (incomplete fields)');
        // v2 缓存字段不完整，跳过，让它从服务器重新加载
      }

      // 尝试 v1 缓存键（没有版本后缀）
      final v1KeyPrefix = 'spots_cache_';
      final v1CountsPrefix = 'spots_counts_';
      final v1TimestampPrefix = 'spots_timestamp_';

      final v1Timestamp = prefs.getInt('$v1TimestampPrefix$citySlug');
      if (v1Timestamp == null) {
        print('📭 [SpotCache] No v1 cache found either for $citySlug');
        return null;
      }

      final cacheTime = DateTime.fromMillisecondsSinceEpoch(v1Timestamp);
      print('📅 [SpotCache] Found v1 cache from ${cacheTime.toString()}');

      // 读取 v1 spots (只有 Spot 对象，没有状态)
      final v1SpotsJson = prefs.getString('$v1KeyPrefix$citySlug');
      if (v1SpotsJson == null) {
        print('📭 [SpotCache] No v1 spots data for $citySlug');
        return null;
      }

      // v1 格式是 List<Spot>，需要转换成 List<CachedSpotEntry>
      final v1Spots = (jsonDecode(v1SpotsJson) as List)
          .map((json) =>
              CachedSpotEntry._spotFromLightJson(json as Map<String, dynamic>))
          .toList();

      // 将 v1 Spot 转换为 v2 CachedSpotEntry (状态默认为 true/false)
      final entries = v1Spots.map((spot) {
        return CachedSpotEntry(
          spot: spot,
          city: spot.city ?? 'Unknown',
          citySlug: citySlug,
          isSaved: true, // v1 缓存的都是已保存的
          isMustGo: false, // v1 没有这个状态
          isTodaysPlan: false, // v1 没有这个状态
          isVisited: false, // v1 没有这个状态
          destinationId: null,
          addedAt: DateTime.now(), // v1 没有记录添加时间
        );
      }).toList();

      // 读取 v1 tab 计数
      final v1CountsJson = prefs.getString('$v1CountsPrefix$citySlug');
      final tabCounts = v1CountsJson != null
          ? Map<String, int>.from(jsonDecode(v1CountsJson) as Map)
          : <String, int>{};

      print(
          '✅ [SpotCache] Loaded ${entries.length} entries from v1 cache for $citySlug');

      // 自动升级：保存为 v3 格式（包含完整字段）
      await saveCitySpots(
        citySlug: citySlug,
        entries: entries,
        tabCounts: tabCounts,
      );
      print('🔄 [SpotCache] Migrated v1 cache to v3 for $citySlug');

      // 返回时设置为过期状态，强制触发后台刷新以获取完整数据
      return CachedSpotData(
        entries: entries,
        tabCounts: tabCounts,
        cachedAt: DateTime.now().subtract(const Duration(days: 30)), // 标记为过期
      );
    } catch (e) {
      print('❌ [SpotCache] Failed to load legacy cache for $citySlug: $e');
      return null;
    }
  }

  /// 清理指定城市的缓存

  /// 清理指定城市的缓存
  Future<void> clearCityCache(String citySlug) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('$_keyPrefix$citySlug');
      await prefs.remove('$_countsPrefix$citySlug');
      await prefs.remove('$_timestampPrefix$citySlug');
    } catch (e) {
      print('❌ [SpotCache] Failed to clear cache for $citySlug: $e');
    }
  }

  /// 清理所有缓存
  Future<void> clearAllCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final keys = prefs.getKeys();
      for (final key in keys) {
        if (key.startsWith(_keyPrefix) ||
            key.startsWith(_countsPrefix) ||
            key.startsWith(_timestampPrefix)) {
          await prefs.remove(key);
        }
      }
    } catch (e) {
      print('❌ [SpotCache] Failed to clear all cache: $e');
    }
  }
}

/// 缓存的 Spot 数据
class CachedSpotData {
  final List<CachedSpotEntry> entries;
  final Map<String, int> tabCounts;
  final DateTime cachedAt;

  CachedSpotData({
    required this.entries,
    required this.tabCounts,
    required this.cachedAt,
  });

  bool get isExpired =>
      DateTime.now().difference(cachedAt) > const Duration(hours: 24);
}
