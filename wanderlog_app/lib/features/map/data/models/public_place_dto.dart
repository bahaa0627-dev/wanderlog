import 'dart:convert';

class PublicPlaceDto {
  const PublicPlaceDto({
    required this.placeId,
    required this.name,
    required this.latitude,
    required this.longitude,
    this.address,
    this.city,
    this.country,
    this.category,
    this.categoryEn,
    this.categoryZh,
    this.coverImage,
    this.images = const [],
    this.rating,
    this.ratingCount,
    this.priceLevel,
    this.website,
    this.phoneNumber,
    this.aiTags = const [],
    this.displayTagsEn = const [],
    this.displayTagsZh = const [],
    this.aiSummary,
    this.aiDescription,
    this.source,
    this.createdAt,
    this.updatedAt,
  });

  factory PublicPlaceDto.fromJson(Map<String, dynamic> json) => PublicPlaceDto(
        placeId: json['placeId'] as String,
        name: json['name'] as String,
        latitude: (json['latitude'] as num).toDouble(),
        longitude: (json['longitude'] as num).toDouble(),
        address: json['address'] as String?,
        city: json['city'] as String?,
        country: json['country'] as String?,
        category: json['category'] as String?,
        categoryEn: json['categoryEn'] as String?,
        categoryZh: json['categoryZh'] as String?,
        coverImage: json['coverImage'] as String?,
        images: _parseStringList(json['images']),
        rating: _parseDouble(json['rating']),
        ratingCount: _parseInt(json['ratingCount']),
        priceLevel: _parseInt(json['priceLevel']),
        website: json['website'] as String?,
        phoneNumber: json['phoneNumber'] as String?,
        aiTags: _parseAiTags(json['aiTags']),
        displayTagsEn: _parseStringList(json['display_tags_en']),
        displayTagsZh: _parseStringList(json['display_tags_zh']),
        aiSummary: json['aiSummary'] as String?,
        aiDescription: json['aiDescription'] as String?,
        source: json['source'] as String?,
        createdAt: _parseDateTime(json['createdAt']),
        updatedAt: _parseDateTime(json['updatedAt']),
      );

  /// 从 Supabase 数据创建 (字段名使用 snake_case)
  factory PublicPlaceDto.fromSupabase(Map<String, dynamic> json) => PublicPlaceDto(
        placeId: json['id'] as String,
        name: json['name'] as String,
        latitude: (json['latitude'] as num).toDouble(),
        longitude: (json['longitude'] as num).toDouble(),
        address: json['address'] as String?,
        city: json['city'] as String?,
        country: json['country'] as String?,
        category: json['category'] as String?,
        categoryEn: json['category_en'] as String?,
        categoryZh: json['category_zh'] as String?,
        coverImage: json['cover_image'] as String?,
        images: _parseStringList(json['images']),
        rating: _parseDouble(json['rating']),
        ratingCount: _parseInt(json['rating_count']),
        priceLevel: _parseInt(json['price_level']),
        website: json['website'] as String?,
        phoneNumber: json['phone_number'] as String?,
        aiTags: _parseAiTags(json['ai_tags']),
        displayTagsEn: _parseStringList(json['display_tags_en']),
        displayTagsZh: _parseStringList(json['display_tags_zh']),
        aiSummary: json['ai_summary'] as String?,
        aiDescription: json['ai_description'] as String?,
        source: json['source'] as String?,
        createdAt: _parseDateTime(json['created_at']),
        updatedAt: _parseDateTime(json['updated_at']),
      );

  final String placeId;
  final String name;
  final double latitude;
  final double longitude;
  final String? address;
  final String? city;
  final String? country;
  final String? category;
  final String? categoryEn;
  final String? categoryZh;
  final String? coverImage;
  final List<String> images;
  final double? rating;
  final int? ratingCount;
  final int? priceLevel;
  final String? website;
  final String? phoneNumber;
  final List<String> aiTags;
  final List<String> displayTagsEn;
  final List<String> displayTagsZh;
  final String? aiSummary;
  final String? aiDescription;
  final String? source;
  final DateTime? createdAt;
  final DateTime? updatedAt;
}

List<String> _parseStringList(dynamic value) {
  if (value == null) {
    return const [];
  }

  final List<String> results = [];
  if (value is List) {
    for (final item in value) {
      if (item == null) {
        continue;
      }
      final parsed = item.toString().trim();
      if (parsed.isNotEmpty) {
        results.add(parsed);
      }
    }
    return results;
  }

  if (value is String) {
    if (value.isEmpty) {
      return const [];
    }
    try {
      final decoded = jsonDecode(value);
      if (decoded is List) {
        for (final item in decoded) {
          if (item == null) {
            continue;
          }
          final parsed = item.toString().trim();
          if (parsed.isNotEmpty) {
            results.add(parsed);
          }
        }
        return results;
      }
    } catch (_) {
      // Fall through to manual splitting below.
    }

    // 尝试使用分隔符拆分字符串，例如 "Architecture, BIG"
    final parts = value.split(RegExp(r'[、，,;；/]+'));
    for (final part in parts) {
      final parsed = part.trim();
      if (parsed.isNotEmpty) {
        results.add(parsed);
      }
    }
    if (results.isNotEmpty) {
      return results;
    }

    // 无法拆分则返回原始字符串
    results.add(value);
  }

  return results;
}

/// 解析 aiTags - 支持对象数组格式 [{en, zh, kind, id, priority}]
/// 提取 en 字段作为标签字符串
List<String> _parseAiTags(dynamic value) {
  if (value == null) return const [];
  if (value is! List) return const [];
  
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

double? _parseDouble(dynamic value) {
  if (value == null) {
    return null;
  }
  if (value is num) {
    return value.toDouble();
  }
  if (value is String && value.isNotEmpty) {
    return double.tryParse(value);
  }
  return null;
}

int? _parseInt(dynamic value) {
  if (value == null) {
    return null;
  }
  if (value is int) {
    return value;
  }
  if (value is num) {
    return value.toInt();
  }
  if (value is String && value.isNotEmpty) {
    return int.tryParse(value);
  }
  return null;
}

DateTime? _parseDateTime(dynamic value) {
  if (value == null) {
    return null;
  }
  if (value is DateTime) {
    return value;
  }
  if (value is String && value.isNotEmpty) {
    return DateTime.tryParse(value);
  }
  return null;
}
