import 'dart:convert';

import 'package:json_annotation/json_annotation.dart';
import 'package:wanderlog/features/map/data/models/public_place_dto.dart';

part 'spot_model.g.dart';

@JsonSerializable()
class Spot {

  Spot({
    required this.id,
    required this.name,
    required this.latitude,
    required this.longitude,
    this.tags = const [],
    this.images = const [],
    this.coverImage,
    this.createdAt,
    this.updatedAt,
    this.googlePlaceId,
    this.city,
    this.country,
    this.address,
    this.category,
    this.openingHours,
    this.rating,
    this.ratingCount,
    this.priceLevel,
    this.website,
    this.phoneNumber,
    this.displayTagsEn,
    this.aiTags,
    this.customFields,
  });

  factory Spot.fromJson(Map<String, dynamic> json) {
    final spot = _$SpotFromJson(json);
    final fallbackCover = (json['coverImage'] ?? json['cover_image']) as String?;
    if (fallbackCover == null || fallbackCover.isEmpty) {
      return spot;
    }
    if (spot.coverImage == fallbackCover) {
      return spot;
    }
    return spot.copyWith(coverImage: fallbackCover);
  }
  final String id;
  final String? googlePlaceId;
  final String? city;
  final String? country;
  final String name;
  final double latitude;
  final double longitude;
  final String? address;
  final String? category;
  @JsonKey(fromJson: _tagsFromJson)
  final List<String> tags;
  @JsonKey(fromJson: _openingHoursFromJson, toJson: _openingHoursToJson)
  final Map<String, dynamic>? openingHours;
  @JsonKey(fromJson: _imagesFromJson)
  final List<String> images;
  final String? coverImage;
  final double? rating;
  final int? ratingCount;
  final int? priceLevel;
  final String? website;
  final String? phoneNumber;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  @JsonKey(name: 'display_tags_en', fromJson: _stringListFromJson)
  final List<String>? displayTagsEn;
  @JsonKey(name: 'ai_tags', fromJson: _aiTagsFromJson)
  final List<dynamic>? aiTags;
  @JsonKey(name: 'custom_fields', fromJson: _customFieldsFromJson, toJson: _customFieldsToJson)
  final PlaceCustomFields? customFields;
  Map<String, dynamic> toJson() => _$SpotToJson(this);

  Spot copyWith({
    String? id,
    String? googlePlaceId,
    String? city,
    String? country,
    String? name,
    double? latitude,
    double? longitude,
    String? address,
    String? category,
    List<String>? tags,
    Map<String, dynamic>? openingHours,
    List<String>? images,
    String? coverImage,
    double? rating,
    int? ratingCount,
    int? priceLevel,
    String? website,
    String? phoneNumber,
    DateTime? createdAt,
    DateTime? updatedAt,
    List<String>? displayTagsEn,
    List<dynamic>? aiTags,
    PlaceCustomFields? customFields,
  }) => Spot(
      id: id ?? this.id,
      googlePlaceId: googlePlaceId ?? this.googlePlaceId,
      city: city ?? this.city,
      country: country ?? this.country,
      name: name ?? this.name,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      address: address ?? this.address,
      category: category ?? this.category,
      tags: tags ?? this.tags,
      openingHours: openingHours ?? this.openingHours,
      images: images ?? this.images,
      coverImage: coverImage ?? this.coverImage,
      rating: rating ?? this.rating,
      ratingCount: ratingCount ?? this.ratingCount,
      priceLevel: priceLevel ?? this.priceLevel,
      website: website ?? this.website,
      phoneNumber: phoneNumber ?? this.phoneNumber,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      displayTagsEn: displayTagsEn ?? this.displayTagsEn,
      aiTags: aiTags ?? this.aiTags,
      customFields: customFields ?? this.customFields,
    );

  String? get primaryImage {
    final cover = coverImage;
    if (cover != null && cover.isNotEmpty) return cover;
    return images.isNotEmpty ? images.first : null;
  }
}

Map<String, dynamic>? _openingHoursFromJson(dynamic value) {
  if (value == null) {
    return null;
  }
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is List) {
    // 后端返回的是数组格式，转换为 Map
    return {'weekday_text': value.map((e) => e.toString()).toList()};
  }
  if (value is String && value.trim().isNotEmpty) {
    try {
      final decoded = jsonDecode(value);
      if (decoded is Map<String, dynamic>) {
        return decoded;
      }
      if (decoded is List) {
        return {'weekday_text': decoded.map((e) => e.toString()).toList()};
      }
    } catch (_) {
      // JSON 解析失败，尝试解析特殊格式字符串
      // 格式如: "Wednesday, hours: 9:30 AM to 10:30 PM}" 或 "Tuesday, hours: 9 AM to 6 PM}"
      final trimmed = value.trim();
      
      // 移除末尾的 } 如果存在
      final cleaned = trimmed.endsWith('}') ? trimmed.substring(0, trimmed.length - 1).trim() : trimmed;
      
      // 尝试解析 "Day, hours: X:XX AM to Y:XX PM" 格式（支持带分钟）
      final hoursMatch = RegExp(
        r'(\w+),?\s*hours?:\s*(\d{1,2}):?(\d{2})?\s*(AM|PM)\s*to\s*(\d{1,2}):?(\d{2})?\s*(AM|PM)',
        caseSensitive: false,
      ).firstMatch(cleaned);
      
      if (hoursMatch != null) {
        final openHour = hoursMatch.group(2)!;
        final openMinute = hoursMatch.group(3) ?? '00';
        final openPeriod = hoursMatch.group(4)!.toUpperCase();
        final closeHour = hoursMatch.group(5)!;
        final closeMinute = hoursMatch.group(6) ?? '00';
        final closePeriod = hoursMatch.group(7)!.toUpperCase();
        
        // 构建标准的 weekday_text 格式（使用 – 作为分隔符）
        final openTime = openMinute == '00' ? '$openHour:00 $openPeriod' : '$openHour:$openMinute $openPeriod';
        final closeTime = closeMinute == '00' ? '$closeHour:00 $closePeriod' : '$closeHour:$closeMinute $closePeriod';
        final hoursText = '$openTime – $closeTime';
        
        // 创建一周的营业时间（假设每天相同）
        final weekdayText = [
          'Monday: $hoursText',
          'Tuesday: $hoursText',
          'Wednesday: $hoursText',
          'Thursday: $hoursText',
          'Friday: $hoursText',
          'Saturday: $hoursText',
          'Sunday: $hoursText',
        ];
        
        return {'weekday_text': weekdayText};
      }
      
      return null;
    }
  }
  return null;
}

Map<String, dynamic>? _openingHoursToJson(Map<String, dynamic>? value) => value;

List<String>? _stringListFromJson(dynamic value) {
  if (value == null) return null;
  if (value is List) {
    return value.map((e) => e?.toString() ?? '').where((s) => s.isNotEmpty).toList();
  }
  return null;
}

List<dynamic>? _aiTagsFromJson(dynamic value) {
  if (value == null) return null;
  if (value is List) return value;
  if (value is String && value.trim().isNotEmpty) {
    try {
      final decoded = jsonDecode(value);
      if (decoded is List) return decoded;
    } catch (_) {
      return null;
    }
  }
  return null;
}

PlaceCustomFields? _customFieldsFromJson(dynamic value) {
  if (value == null) return null;
  if (value is Map<String, dynamic>) {
    return PlaceCustomFields.fromJson(value);
  }
  return null;
}

Map<String, dynamic>? _customFieldsToJson(PlaceCustomFields? value) {
  // 不需要序列化回 JSON，返回 null
  return null;
}

/// 解析 tags 字段 - 后端可能返回对象(Map)或数组(List)
List<String> _tagsFromJson(dynamic value) {
  if (value == null) return const [];
  
  // 如果是 List，正常解析
  if (value is List) {
    return value.map((e) => e?.toString() ?? '').where((s) => s.isNotEmpty).toList();
  }
  
  // 如果是 Map（后端返回结构化 tags 对象），返回空数组
  // 结构化 tags 应该通过 displayTagsEn 或 aiTags 展示
  if (value is Map) {
    return const [];
  }
  
  // 如果是字符串，尝试解析
  if (value is String && value.trim().isNotEmpty) {
    try {
      final decoded = jsonDecode(value);
      if (decoded is List) {
        return decoded.map((e) => e?.toString() ?? '').where((s) => s.isNotEmpty).toList();
      }
      if (decoded is Map) {
        return const [];
      }
    } catch (_) {
      // 解析失败，返回空数组
      return const [];
    }
  }
  
  return const [];
}

/// 解析 images 字段 - 后端可能返回数组(List)或其他类型
List<String> _imagesFromJson(dynamic value) {
  if (value == null) return const [];
  
  // 如果是 List，正常解析
  if (value is List) {
    return value.map((e) => e?.toString() ?? '').where((s) => s.isNotEmpty).toList();
  }
  
  // 如果是 Map，返回空数组
  if (value is Map) {
    return const [];
  }
  
  // 如果是字符串，尝试解析 JSON
  if (value is String && value.trim().isNotEmpty) {
    try {
      final decoded = jsonDecode(value);
      if (decoded is List) {
        return decoded.map((e) => e?.toString() ?? '').where((s) => s.isNotEmpty).toList();
      }
    } catch (_) {
      // 解析失败，返回空数组
      return const [];
    }
  }
  
  return const [];
}
