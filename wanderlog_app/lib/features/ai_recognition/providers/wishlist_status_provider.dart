import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';

/// 收藏状态缓存 Provider
/// 
/// 预加载所有地点的收藏状态，避免每个卡片单独查询
/// Key: spotId (place.id ?? place.name)
/// Value: destinationId (如果已收藏) 或 null (未收藏)
final wishlistStatusProvider = FutureProvider<Map<String, String?>>((ref) async {
  final trips = await ref.watch(tripsProvider.future);
  
  final Map<String, String?> statusMap = {};
  
  for (final trip in trips) {
    final tripSpots = trip.tripSpots ?? [];
    for (final tripSpot in tripSpots) {
      if (tripSpot.spotId != null) {
        statusMap[tripSpot.spotId!] = trip.id;
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
