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
    this.openingHours,
    this.description,
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
        openingHours: _parseOpeningHours(json['openingHours']),
        description: json['description'] as String?,
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
  factory PublicPlaceDto.fromSupabase(Map<String, dynamic> json) {
    final name = json['name'] as String;
    final categoryEn = json['category_en'] as String?;
    final aiTags = _parseAiTags(json['ai_tags']);
    final structuredTags = _parseStructuredTags(json['tags']);
    
    // Debug logging for Sydney Opera House
    if (name.toLowerCase().contains('opera')) {
      print('🔍 [fromSupabase] Processing: $name');
      print('🔍 [fromSupabase] Raw tags field: ${json['tags']}');
      print('🔍 [fromSupabase] Raw ai_tags field: ${json['ai_tags']}');
      print('🔍 [fromSupabase] Parsed structuredTags: $structuredTags');
      print('🔍 [fromSupabase] Parsed aiTags: $aiTags');
    }
    
    // 动态计算 displayTagsEn（因为数据库中没有这个字段）
    final displayTagsEn = _computeDisplayTags(categoryEn, aiTags, structuredTags);
    
    return PublicPlaceDto(
        placeId: json['id'] as String,
        name: json['name'] as String,
        latitude: (json['latitude'] as num).toDouble(),
        longitude: (json['longitude'] as num).toDouble(),
        address: json['address'] as String?,
        city: json['city'] as String?,
        country: json['country'] as String?,
        category: json['category'] as String?,
        categoryEn: categoryEn,
        categoryZh: json['category_zh'] as String?,
        coverImage: json['cover_image'] as String?,
        images: _parseStringList(json['images']),
        rating: _parseDouble(json['rating']),
        ratingCount: _parseInt(json['rating_count']),
        priceLevel: _parseInt(json['price_level']),
        website: json['website'] as String?,
        phoneNumber: json['phone_number'] as String?,
        openingHours: _parseOpeningHours(json['opening_hours']),
        description: json['description'] as String?,
        aiTags: aiTags,
        displayTagsEn: displayTagsEn,
        displayTagsZh: _parseStringList(json['display_tags_zh']),
        aiSummary: json['ai_summary'] as String?,
        aiDescription: json['ai_description'] as String?,
        source: json['source'] as String?,
        createdAt: _parseDateTime(json['created_at']),
        updatedAt: _parseDateTime(json['updated_at']),
      );
  }

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
  final Map<String, dynamic>? openingHours;
  final String? description;
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

/// 解析营业时间 - 支持 JSON 字符串或 Map
Map<String, dynamic>? _parseOpeningHours(dynamic value) {
  if (value == null) return null;
  if (value is Map<String, dynamic>) return value;
  if (value is String && value.isNotEmpty) {
    try {
      final decoded = jsonDecode(value);
      if (decoded is Map<String, dynamic>) {
        return decoded;
      }
    } catch (_) {
      // 解析失败，返回 null
    }
  }
  return null;
}

/// 解析结构化标签 - 格式: { type: ['Architecture'], architect: ['Jørn Utzon'] }
Map<String, List<String>>? _parseStructuredTags(dynamic value) {
  if (value == null) {
    print('🏷️ [_parseStructuredTags] value is null');
    return null;
  }
  
  print('🏷️ [_parseStructuredTags] value type: ${value.runtimeType}');
  print('🏷️ [_parseStructuredTags] value: $value');
  
  Map<String, dynamic>? parsed;
  if (value is Map<String, dynamic>) {
    parsed = value;
  } else if (value is Map) {
    // Handle Map<dynamic, dynamic> case
    parsed = Map<String, dynamic>.from(value);
  } else if (value is String && value.isNotEmpty) {
    try {
      final decoded = jsonDecode(value);
      if (decoded is Map<String, dynamic>) {
        parsed = decoded;
      } else if (decoded is Map) {
        parsed = Map<String, dynamic>.from(decoded);
      }
    } catch (e) {
      print('🏷️ [_parseStructuredTags] JSON decode error: $e');
      return null;
    }
  }
  
  if (parsed == null) {
    print('🏷️ [_parseStructuredTags] parsed is null');
    return null;
  }
  
  print('🏷️ [_parseStructuredTags] parsed: $parsed');
  
  final result = <String, List<String>>{};
  for (final entry in parsed.entries) {
    print('🏷️ [_parseStructuredTags] entry: ${entry.key} = ${entry.value} (${entry.value.runtimeType})');
    if (entry.value is List) {
      final list = (entry.value as List)
          .map((e) => e?.toString() ?? '')
          .where((s) => s.isNotEmpty)
          .toList();
      if (list.isNotEmpty) {
        result[entry.key] = list;
      }
    }
  }
  print('🏷️ [_parseStructuredTags] result: $result');
  return result.isEmpty ? null : result;
}

/// 从结构化标签中提取所有标签值
List<String> _extractTagsFromStructured(Map<String, List<String>>? tags) {
  if (tags == null) return [];
  final result = <String>[];
  for (final values in tags.values) {
    result.addAll(values);
  }
  return result;
}

/// 计算展示标签：category + structuredTags + aiTags 的并集
/// 顺序：分类 → 结构化标签（如 Architecture, Jørn Utzon）→ AI 标签（如 Historical）
/// 最多返回 4 个标签
List<String> _computeDisplayTags(
  String? categoryEn,
  List<String> aiTags,
  Map<String, List<String>>? structuredTags,
) {
  final result = <String>[];
  final seen = <String>{};
  
  // Debug logging
  print('🏷️ [_computeDisplayTags] categoryEn: $categoryEn');
  print('🏷️ [_computeDisplayTags] aiTags: $aiTags');
  print('🏷️ [_computeDisplayTags] structuredTags: $structuredTags');
  
  // 1. 添加 category
  if (categoryEn != null && categoryEn.isNotEmpty) {
    result.add(categoryEn);
    seen.add(categoryEn.toLowerCase());
  }
  
  // 2. 添加结构化标签（优先于 AI 标签）
  final extracted = _extractTagsFromStructured(structuredTags);
  print('🏷️ [_computeDisplayTags] extracted from structured: $extracted');
  for (final tag in extracted) {
    if (result.length >= 4) break;
    final key = tag.toLowerCase();
    if (!seen.contains(key)) {
      result.add(tag);
      seen.add(key);
    }
  }
  
  // 3. 添加 aiTags
  for (final tag in aiTags) {
    if (result.length >= 4) break;
    final key = tag.toLowerCase();
    if (!seen.contains(key)) {
      result.add(tag);
      seen.add(key);
    }
  }
  
  print('🏷️ [_computeDisplayTags] final result: $result');
  return result;
}
