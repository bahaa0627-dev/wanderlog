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
  final String? aiSummary;
  final String? aiDescription;
  final List<String> aiTags;
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
    this.aiSummary,
    this.aiDescription,
    this.aiTags = const [],
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
      aiSummary: json['ai_summary'] as String?,
      aiDescription: json['ai_description'] as String?,
      aiTags: _parseStringList(json['ai_tags']),
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
      'ai_summary': aiSummary,
      'ai_description': aiDescription,
      'ai_tags': aiTags,
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
}
