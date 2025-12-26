import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart';
import 'package:wanderlog/core/supabase/services/quota_service.dart';

/// AI识别结果模型
class AIRecognitionResult {
  AIRecognitionResult({
    required this.message,
    required this.spots,
    required this.imageUrls,
    this.needsLocationPermission = false,
    this.quotaExceeded = false,
    this.quotaStatus,
    this.textFallback,
  }); // 上传的图片URL列表

  factory AIRecognitionResult.fromJson(Map<String, dynamic> json) => AIRecognitionResult(
      message: json['message'] as String? ?? '',
      spots: (json['spots'] as List?)
              ?.map((spot) => spotFromJson(spot as Map<String, dynamic>))
              .toList() ??
          [],
      imageUrls:
          (json['imageUrls'] as List?)?.map((e) => e as String).toList() ?? [],
      needsLocationPermission: json['needsLocationPermission'] as bool? ?? false,
      quotaExceeded: json['quotaExceeded'] as bool? ?? false,
      textFallback: (json['textFallback'] as List?)?.map((e) => e as String).toList(),
    );

  final String message; // AI返回的文案描述
  final List<Spot> spots; // 识别到的地点列表
  final List<String> imageUrls;
  final bool needsLocationPermission; // 是否需要请求定位权限
  final bool quotaExceeded; // 配额是否已用完
  final QuotaStatus? quotaStatus; // 当前配额状态
  final List<String>? textFallback; // 纯文本降级推荐（配额用完时）

  static Spot spotFromJson(Map<String, dynamic> json) => Spot(
      id: json['id'] as String,
      name: json['name'] as String,
      city: json['city'] as String? ?? '',
      category: json['category'] as String? ?? '',
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      rating: (json['rating'] as num?)?.toDouble() ?? 0.0,
      ratingCount: json['ratingCount'] as int? ?? 0,
      coverImage: json['coverImage'] as String? ?? '',
      images: (json['images'] as List?)?.map((e) => e as String).toList() ?? [],
      tags: (json['tags'] as List?)?.map((e) => e as String).toList() ?? [],
      aiSummary: json['aiSummary'] as String?,
      isFromAI: json['isFromAI'] as bool? ?? false,
    );

  Map<String, dynamic> toJson() => {
        'message': message,
        'spots': spots.map(_spotToJson).toList(),
        'imageUrls': imageUrls,
        'needsLocationPermission': needsLocationPermission,
        'quotaExceeded': quotaExceeded,
        'textFallback': textFallback,
      };

  static Map<String, dynamic> _spotToJson(Spot spot) => {
        'id': spot.id,
        'name': spot.name,
        'city': spot.city,
        'category': spot.category,
        'latitude': spot.latitude,
        'longitude': spot.longitude,
        'rating': spot.rating,
        'ratingCount': spot.ratingCount,
        'coverImage': spot.coverImage,
        'images': spot.images,
        'tags': spot.tags,
        'aiSummary': spot.aiSummary,
        'isFromAI': spot.isFromAI,
      };
}
