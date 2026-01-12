import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart';

/// 地点状态数据
class SpotStatusData {
  const SpotStatusData({
    this.destinationId,
    this.isMustGo = false,
    this.isTodaysPlan = false,
    this.isVisited = false,
  });
  
  final String? destinationId;
  final bool isMustGo;
  final bool isTodaysPlan;
  final bool isVisited;
  
  SpotStatusData copyWith({
    String? destinationId,
    bool? isMustGo,
    bool? isTodaysPlan,
    bool? isVisited,
  }) => SpotStatusData(
    destinationId: destinationId ?? this.destinationId,
    isMustGo: isMustGo ?? this.isMustGo,
    isTodaysPlan: isTodaysPlan ?? this.isTodaysPlan,
    isVisited: isVisited ?? this.isVisited,
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
        isMustGo: existing?.isMustGo ?? false,
        isTodaysPlan: existing?.isTodaysPlan ?? false,
        isVisited: existing?.isVisited ?? false,
      );
    } else {
      _cache.remove(spotId);
      _fullStatusCache.remove(spotId);
    }
  }
  
  /// 更新完整状态（包括 MustGo、Today's Plan、Visited）
  static void updateFullStatus(String spotId, {
    String? destinationId,
    bool? isMustGo,
    bool? isTodaysPlan,
    bool? isVisited,
  }) {
    final existing = _fullStatusCache[spotId];
    final newDestId = destinationId ?? existing?.destinationId;
    
    if (newDestId != null) {
      _cache[spotId] = newDestId;
      _fullStatusCache[spotId] = SpotStatusData(
        destinationId: newDestId,
        isMustGo: isMustGo ?? existing?.isMustGo ?? false,
        isTodaysPlan: isTodaysPlan ?? existing?.isTodaysPlan ?? false,
        isVisited: isVisited ?? existing?.isVisited ?? false,
      );
    }
  }
  
  /// 批量更新缓存
  static void updateAll(Map<String, String?> statusMap) {
    _cache.clear();
    _cache.addAll(statusMap);
  }
  
  /// 批量更新完整状态缓存
  static void updateAllFullStatus(Map<String, SpotStatusData> statusMap) {
    _fullStatusCache.clear();
    _fullStatusCache.addAll(statusMap);
    // 同步更新基础缓存
    _cache.clear();
    for (final entry in statusMap.entries) {
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
final wishlistStatusProvider = FutureProvider<Map<String, String?>>((ref) async {
  final trips = await ref.watch(tripsProvider.future);
  
  final Map<String, String?> statusMap = {};
  final Map<String, SpotStatusData> fullStatusMap = {};
  
  for (final trip in trips) {
    final tripSpots = trip.tripSpots ?? [];
    for (final tripSpot in tripSpots) {
      final spotId = tripSpot.spotId!;
      final destId = trip.id;
      
      // 基础状态
      statusMap[spotId] = destId;
      
      // 完整状态
      final isMustGo = tripSpot.priority == SpotPriority.mustGo;
      final isTodaysPlan = tripSpot.status == TripSpotStatus.todaysPlan;
      final isVisited = tripSpot.status == TripSpotStatus.visited;
      
      fullStatusMap[spotId] = SpotStatusData(
        destinationId: destId,
        isMustGo: isMustGo,
        isTodaysPlan: isTodaysPlan,
        isVisited: isVisited,
      );
      
      // 同时使用 spot.name 作为 key，解决 AI 地点 ID 不匹配问题
      if (tripSpot.spot != null && tripSpot.spot!.name.isNotEmpty) {
        statusMap[tripSpot.spot!.name] = destId;
        fullStatusMap[tripSpot.spot!.name] = SpotStatusData(
          destinationId: destId,
          isMustGo: isMustGo,
          isTodaysPlan: isTodaysPlan,
          isVisited: isVisited,
        );
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
(bool, String?) checkWishlistStatus(Map<String, String?> statusMap, String spotId) {
  if (statusMap.containsKey(spotId)) {
    return (true, statusMap[spotId]);
  }
  return (false, null);
}
