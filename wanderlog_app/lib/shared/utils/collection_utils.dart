/// 合集工具函数
/// 用于计算合集的主要城市、地点数量等信息

/// 计算合集的主要城市
/// 规则：
/// 1. 选择地点数量最多的城市
/// 2. 如果有多个城市地点数相同，选择其中评价人数（ratingCount）最多的地点所对应的城市
/// 
/// [collectionSpots] 合集中的地点列表，每个元素应包含 place 字段
/// [fallback] 如果无法计算城市时的默认值，默认为 'Multi-city'
/// 返回主要城市名称
String calculateMainCity(
  List<dynamic> collectionSpots, {
  String fallback = 'Multi-city',
}) {
  if (collectionSpots.isEmpty) return fallback;

  // 统计每个城市的地点数量和最高评价数
  final cityStats = <String, _CityStats>{};

  for (final spot in collectionSpots) {
    final place = spot['place'] as Map<String, dynamic>?;
    if (place == null) continue;

    final city = place['city'] as String?;
    if (city == null || city.isEmpty) continue;

    final ratingCount = (place['ratingCount'] as num?)?.toInt() ?? 0;

    if (cityStats.containsKey(city)) {
      final existing = cityStats[city]!;
      cityStats[city] = _CityStats(
        count: existing.count + 1,
        maxRatingCount:
            ratingCount > existing.maxRatingCount ? ratingCount : existing.maxRatingCount,
      );
    } else {
      cityStats[city] = _CityStats(count: 1, maxRatingCount: ratingCount);
    }
  }

  if (cityStats.isEmpty) return fallback;

  // 找出地点数量最多的城市
  int maxCount = 0;
  for (final stats in cityStats.values) {
    if (stats.count > maxCount) {
      maxCount = stats.count;
    }
  }

  // 筛选出所有地点数量等于最大值的城市
  final topCities = <_TopCity>[];
  cityStats.forEach((city, stats) {
    if (stats.count == maxCount) {
      topCities.add(_TopCity(city: city, maxRatingCount: stats.maxRatingCount));
    }
  });

  // 如果只有一个城市，直接返回；如果有多个，按最高评价数排序
  if (topCities.length == 1) {
    return topCities[0].city;
  } else {
    // 平局时，选择评价人数最多的地点所在的城市
    topCities.sort((a, b) => b.maxRatingCount.compareTo(a.maxRatingCount));
    return topCities[0].city;
  }
}

/// 计算合集的地点数量
/// 优先使用 API 返回的 spotCount，如果没有则使用 collectionSpots 数组长度
int calculateSpotCount(Map<String, dynamic> collection) {
  final apiSpotCount = collection['spotCount'] as int?;
  if (apiSpotCount != null && apiSpotCount > 0) {
    return apiSpotCount;
  }

  final collectionSpots = collection['collectionSpots'] as List<dynamic>? ?? [];
  return collectionSpots.length;
}

/// 验证图片 URL 是否有效
bool isValidImageUrl(String? url) {
  if (url == null || url.isEmpty) return false;
  if (url.contains('example.com')) return false;
  if (url.contains('placeholder')) return false;
  return true;
}

/// 获取合集的封面图
/// 优先使用 collection 的 coverImage，否则遍历所有地点找第一个有效图片
String getCollectionCoverImage(Map<String, dynamic> collection) {
  final collectionCoverImage = collection['coverImage'] as String?;
  if (isValidImageUrl(collectionCoverImage)) {
    return collectionCoverImage!;
  }

  final collectionSpots = collection['collectionSpots'] as List<dynamic>? ?? [];
  for (final spot in collectionSpots) {
    final place = spot['place'] as Map<String, dynamic>?;
    if (place == null) continue;
    final placeCoverImage = place['coverImage'] as String?;
    if (isValidImageUrl(placeCoverImage)) {
      return placeCoverImage!;
    }
  }

  // 返回空字符串，让 UI 显示 VAGO 占位图
  return '';
}

// 私有辅助类
class _CityStats {
  _CityStats({required this.count, required this.maxRatingCount});
  final int count;
  final int maxRatingCount;
}

class _TopCity {
  _TopCity({required this.city, required this.maxRatingCount});
  final String city;
  final int maxRatingCount;
}
