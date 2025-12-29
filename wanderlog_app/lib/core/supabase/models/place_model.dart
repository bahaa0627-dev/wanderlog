/// 地点数据模型 (对应 Supabase places 表)
class PlaceModel {
  final String id;
  final String name;
  final String? city;
  final String? country;
  final double latitude;
  final double longitude;
  final String? address;
  final String? description;
  final String? openingHours;
  final double? rating;
  final int? ratingCount;
  final String? category;
  final String? categoryEn;
  final String? categoryZh;
  final String? aiSummary;
  final String? aiDescription;
  final List<String> aiTags;
  final List<String> displayTagsEn;
  final List<String> displayTagsZh;
  final String? coverImage;
  final List<String> images;
  final List<String> tags;
  final int? priceLevel;
  final String? website;
  final String? phoneNumber;
  final String? googlePlaceId;
  final String? source;
  final bool isVerified;
  final DateTime createdAt;
  final DateTime updatedAt;

  PlaceModel({
    required this.id,
    required this.name,
    this.city,
    this.country,
    required this.latitude,
    required this.longitude,
    this.address,
    this.description,
    this.openingHours,
    this.rating,
    this.ratingCount,
    this.category,
    this.categoryEn,
    this.categoryZh,
    this.aiSummary,
    this.aiDescription,
    this.aiTags = const [],
    this.displayTagsEn = const [],
    this.displayTagsZh = const [],
    this.coverImage,
    this.images = const [],
    this.tags = const [],
    this.priceLevel,
    this.website,
    this.phoneNumber,
    this.googlePlaceId,
    this.source,
    this.isVerified = false,
    required this.createdAt,
    required this.updatedAt,
  });

  factory PlaceModel.fromJson(Map<String, dynamic> json) {
    return PlaceModel(
      id: json['id'] as String,
      name: json['name'] as String,
      city: json['city'] as String?,
      country: json['country'] as String?,
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      address: json['address'] as String?,
      description: json['description'] as String?,
      openingHours: json['opening_hours'] as String?,
      rating: json['rating'] != null ? (json['rating'] as num).toDouble() : null,
      ratingCount: json['rating_count'] as int?,
      category: json['category'] as String?,
      categoryEn: json['category_en'] as String? ?? json['categoryEn'] as String?,
      categoryZh: json['category_zh'] as String? ?? json['categoryZh'] as String?,
      aiSummary: json['ai_summary'] as String?,
      aiDescription: json['ai_description'] as String?,
      aiTags: _parseAiTags(json['ai_tags'] ?? json['aiTags']),
      displayTagsEn: _parseStringList(json['display_tags_en'] ?? json['displayTagsEn']),
      displayTagsZh: _parseStringList(json['display_tags_zh'] ?? json['displayTagsZh']),
      coverImage: json['cover_image'] as String?,
      images: _parseStringList(json['images']),
      tags: _parseStringList(json['tags']),
      priceLevel: json['price_level'] as int?,
      website: json['website'] as String?,
      phoneNumber: json['phone_number'] as String?,
      googlePlaceId: json['google_place_id'] as String?,
      source: json['source'] as String?,
      isVerified: json['is_verified'] as bool? ?? false,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'city': city,
      'country': country,
      'latitude': latitude,
      'longitude': longitude,
      'address': address,
      'description': description,
      'opening_hours': openingHours,
      'rating': rating,
      'rating_count': ratingCount,
      'category': category,
      'category_en': categoryEn,
      'category_zh': categoryZh,
      'ai_summary': aiSummary,
      'ai_description': aiDescription,
      'ai_tags': aiTags,
      'display_tags_en': displayTagsEn,
      'display_tags_zh': displayTagsZh,
      'cover_image': coverImage,
      'images': images,
      'tags': tags,
      'price_level': priceLevel,
      'website': website,
      'phone_number': phoneNumber,
      'google_place_id': googlePlaceId,
      'source': source,
      'is_verified': isVerified,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  static List<String> _parseStringList(dynamic value) {
    if (value == null) return [];
    if (value is List) return value.map((e) => e.toString()).toList();
    return [];
  }

  /// 解析 aiTags - 支持对象数组格式 [{en, zh, kind, id, priority}]
  /// 提取 en 字段作为标签字符串
  static List<String> _parseAiTags(dynamic value) {
    if (value == null) return [];
    if (value is! List) return [];
    
    final List<String> result = [];
    for (final item in value) {
      if (item is Map<String, dynamic>) {
        // 新格式：对象数组，提取 en 字段
        final en = item['en'] as String?;
        if (en != null && en.isNotEmpty) {
          result.add(en);
        }
      } else if (item is String) {
        // 旧格式：字符串数组，直接使用
        if (item.isNotEmpty) {
          result.add(item);
        }
      }
    }
    return result;
  }
}
