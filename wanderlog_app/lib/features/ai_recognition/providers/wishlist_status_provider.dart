import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';

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
  
  for (final trip in trips) {
    final tripSpots = trip.tripSpots ?? [];
    for (final tripSpot in tripSpots) {
      // 使用 spotId (UUID) 作为 key
      if (tripSpot.spotId != null) {
        statusMap[tripSpot.spotId!] = trip.id;
      }
      // 同时使用 spot.name 作为 key，解决 AI 地点 ID 不匹配问题
      if (tripSpot.spot != null && tripSpot.spot!.name.isNotEmpty) {
        statusMap[tripSpot.spot!.name] = trip.id;
      }
    }
  }
  
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
