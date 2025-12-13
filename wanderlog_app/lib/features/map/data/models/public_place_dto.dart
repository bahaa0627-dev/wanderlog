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
    this.coverImage,
    this.images = const [],
    this.rating,
    this.ratingCount,
    this.priceLevel,
    this.website,
    this.phoneNumber,
    this.aiTags = const [],
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
        coverImage: json['coverImage'] as String?,
        images: _parseStringList(json['images']),
        rating: _parseDouble(json['rating']),
        ratingCount: _parseInt(json['ratingCount']),
        priceLevel: _parseInt(json['priceLevel']),
        website: json['website'] as String?,
        phoneNumber: json['phoneNumber'] as String?,
        aiTags: _parseStringList(json['aiTags']),
        aiSummary: json['aiSummary'] as String?,
        aiDescription: json['aiDescription'] as String?,
        source: json['source'] as String?,
        createdAt: _parseDateTime(json['createdAt']),
        updatedAt: _parseDateTime(json['updatedAt']),
      );

  final String placeId;
  final String name;
  final double latitude;
  final double longitude;
  final String? address;
  final String? city;
  final String? country;
  final String? category;
  final String? coverImage;
  final List<String> images;
  final double? rating;
  final int? ratingCount;
  final int? priceLevel;
  final String? website;
  final String? phoneNumber;
  final List<String> aiTags;
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
      // Fall through to adding the raw string below.
    }
    results.add(value);
  }

  return results;
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
