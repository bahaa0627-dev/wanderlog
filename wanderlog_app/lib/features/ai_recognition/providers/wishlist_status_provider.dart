import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';

/// 地点状态数据（包含完整的 check-in 详情）
class SpotStatusData {
  const SpotStatusData({
    this.destinationId,
    this.isSaved = true,  // 新增：是否已保存到收藏
    this.isMustGo = false,
    this.isTodaysPlan = false,
    this.isVisited = false,
    // Check-in 详情
    this.visitDate,
    this.userRating,
    this.userNotes,
    this.userPhotos,
  });

  final String? destinationId;
  final bool isSaved;  // 是否已保存（收藏）
  final bool isMustGo;
  final bool isTodaysPlan;
  final bool isVisited;
  // Check-in 详情
  final DateTime? visitDate;
  final int? userRating;
  final String? userNotes;
  final List<String>? userPhotos;

  SpotStatusData copyWith({
    String? destinationId,
    bool? isSaved,
    bool? isMustGo,
    bool? isTodaysPlan,
    bool? isVisited,
    DateTime? visitDate,
    int? userRating,
    String? userNotes,
    List<String>? userPhotos,
  }) =>
      SpotStatusData(
        destinationId: destinationId ?? this.destinationId,
        isSaved: isSaved ?? this.isSaved,
        isMustGo: isMustGo ?? this.isMustGo,
        isTodaysPlan: isTodaysPlan ?? this.isTodaysPlan,
        isVisited: isVisited ?? this.isVisited,
        visitDate: visitDate ?? this.visitDate,
        userRating: userRating ?? this.userRating,
        userNotes: userNotes ?? this.userNotes,
        userPhotos: userPhotos ?? this.userPhotos,
      );
}

/// 收藏状态同步缓存（立即可用，无需等待）
/// 用于避免详情页打开时的闪烁问题
class WishlistStatusCache {
  // 基础收藏状态缓存 (spotId -> destinationId)
  static final Map<String, String?> _cache = {};

  // 完整状态缓存 (spotId -> SpotStatusData)
  static final Map<String, SpotStatusData> _fullStatusCache = {};

  /// 更新基础收藏状态
  static void update(String spotId, String? destinationId) {
    if (destinationId != null) {
      _cache[spotId] = destinationId;
      // 同时更新完整状态缓存
      final existing = _fullStatusCache[spotId];
      _fullStatusCache[spotId] = SpotStatusData(
        destinationId: destinationId,
        isSaved: true,  // update方法默认表示已收藏
        isMustGo: existing?.isMustGo ?? false,
        isTodaysPlan: existing?.isTodaysPlan ?? false,
        isVisited: existing?.isVisited ?? false,
      );
    } else {
      _cache.remove(spotId);
      _fullStatusCache.remove(spotId);
    }
  }

  /// 更新完整状态（包括 Saved、MustGo、Today's Plan、Visited 和 Check-in 详情）
  static void updateFullStatus(
    String spotId, {
    String? destinationId,
    bool? isSaved,
    bool? isMustGo,
    bool? isTodaysPlan,
    bool? isVisited,
    DateTime? visitDate,
    int? userRating,
    String? userNotes,
    List<String>? userPhotos,
  }) {
    final existing = _fullStatusCache[spotId];
    final newDestId = destinationId ?? existing?.destinationId;

    if (newDestId != null) {
      final effectiveIsSaved = isSaved ?? existing?.isSaved ?? true;
      // 只有当isSaved=true时才更新_cache（基础缓存代表"已收藏"）
      if (effectiveIsSaved) {
        _cache[spotId] = newDestId;
      } else {
        _cache.remove(spotId);  // 取消收藏时从基础缓存中移除
      }
      _fullStatusCache[spotId] = SpotStatusData(
        destinationId: newDestId,
        isSaved: effectiveIsSaved,
        isMustGo: isMustGo ?? existing?.isMustGo ?? false,
        isTodaysPlan: isTodaysPlan ?? existing?.isTodaysPlan ?? false,
        isVisited: isVisited ?? existing?.isVisited ?? false,
        visitDate: visitDate ?? existing?.visitDate,
        userRating: userRating ?? existing?.userRating,
        userNotes: userNotes ?? existing?.userNotes,
        userPhotos: userPhotos ?? existing?.userPhotos,
      );
    }
  }

  /// 批量更新缓存
  static void updateAll(Map<String, String?> statusMap) {
    for (final entry in statusMap.entries) {
      if (entry.value != null) {
        _cache[entry.key] = entry.value;
      } else {
        _cache.remove(entry.key);
      }
    }
  }

  /// 批量更新完整状态缓存
  static void updateAllFullStatus(Map<String, SpotStatusData> statusMap) {
    for (final entry in statusMap.entries) {
      _fullStatusCache[entry.key] = entry.value;
      if (entry.value.destinationId != null) {
        _cache[entry.key] = entry.value.destinationId;
      }
    }
  }

  /// 检查是否已收藏
  static (bool, String?) check(String spotId) {
    if (_cache.containsKey(spotId)) {
      return (true, _cache[spotId]);
    }
    return (false, null);
  }

  /// 获取完整状态
  static SpotStatusData? getFullStatus(String spotId) {
    return _fullStatusCache[spotId];
  }

  /// 清除缓存
  static void clear() {
    _cache.clear();
    _fullStatusCache.clear();
  }
}

/// 收藏状态缓存 Provider
///
/// 预加载所有地点的收藏状态，避免每个卡片单独查询
/// Key: spotId (place.id ?? place.name) 或 spot.name
/// Value: destinationId (如果已收藏) 或 null (未收藏)
///
/// 注意：为了解决 AI 生成的地点 ID (ai_xxx) 与数据库 UUID 不匹配的问题，
/// 我们同时使用 spotId 和 spot.name 作为 key，这样无论使用哪种 ID 都能匹配到
final wishlistStatusProvider =
    FutureProvider<Map<String, String?>>((ref) async {
  final trips = await ref.watch(tripsProvider.future);

  final Map<String, String?> statusMap = {};
  final Map<String, SpotStatusData> fullStatusMap = {};

  for (final trip in trips) {
    final tripSpots = trip.tripSpots ?? [];
    for (final tripSpot in tripSpots) {
      final spotId = tripSpot.spotId;
      final destId = trip.id;

      // 基础状态（只有isSaved=true的才放入statusMap）
      if (tripSpot.isSaved) {
        statusMap[spotId] = destId;
      }

      // 完整状态（包含 check-in 详情和isSaved状态）
      final fullStatus = SpotStatusData(
        destinationId: destId,
        isSaved: tripSpot.isSaved,  // 从后端读取isSaved状态
        isMustGo: tripSpot.isMustGo,
        isTodaysPlan: tripSpot.isTodaysPlan,
        isVisited: tripSpot.isVisited,
        visitDate: tripSpot.visitDate,
        userRating: tripSpot.userRating,
        userNotes: tripSpot.userNotes,
        userPhotos: tripSpot.userPhotos,
      );
      fullStatusMap[spotId] = fullStatus;

      // 同时使用 googlePlaceId 作为 key，解决地图页面 ID 不匹配问题
      final googlePlaceId = tripSpot.spot?.googlePlaceId;
      if (googlePlaceId != null &&
          googlePlaceId.isNotEmpty &&
          googlePlaceId != spotId) {
        if (tripSpot.isSaved) {
          statusMap[googlePlaceId] = destId;
        }
        fullStatusMap[googlePlaceId] = fullStatus;
      }

      // 同时使用 spot.name 作为 key，解决 AI 地点 ID 不匹配问题
      if (tripSpot.spot != null && tripSpot.spot!.name.isNotEmpty) {
        if (tripSpot.isSaved) {
          statusMap[tripSpot.spot!.name] = destId;
        }
        fullStatusMap[tripSpot.spot!.name] = fullStatus;
      }
    }
  }

  // 同步更新本地缓存
  WishlistStatusCache.updateAll(statusMap);
  WishlistStatusCache.updateAllFullStatus(fullStatusMap);

  return statusMap;
});

/// 检查单个地点是否已收藏
/// 返回 (isInWishlist, destinationId)
(bool, String?) checkWishlistStatus(
    Map<String, String?> statusMap, String spotId) {
  if (statusMap.containsKey(spotId)) {
    return (true, statusMap[spotId]);
  }
  return (false, null);
}
