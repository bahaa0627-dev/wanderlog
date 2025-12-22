import 'dart:convert';

import 'package:json_annotation/json_annotation.dart';

part 'spot_model.g.dart';

@JsonSerializable()
class Spot {

  Spot({
    required this.id,
    required this.name, required this.latitude, required this.longitude, required this.tags, required this.images, required this.createdAt, required this.updatedAt, this.googlePlaceId,
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
  });

  factory Spot.fromJson(Map<String, dynamic> json) => _$SpotFromJson(json);
  final String id;
  final String? googlePlaceId;
  final String? city;
  final String? country;
  final String name;
  final double latitude;
  final double longitude;
  final String? address;
  final String? category;
  final List<String> tags;
  @JsonKey(fromJson: _openingHoursFromJson, toJson: _openingHoursToJson)
  final Map<String, dynamic>? openingHours;
  final List<String> images;
  final double? rating;
  final int? ratingCount;
  final int? priceLevel;
  final String? website;
  final String? phoneNumber;
  final DateTime createdAt;
  final DateTime updatedAt;
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
    double? rating,
    int? ratingCount,
    int? priceLevel,
    String? website,
    String? phoneNumber,
    DateTime? createdAt,
    DateTime? updatedAt,
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
      rating: rating ?? this.rating,
      ratingCount: ratingCount ?? this.ratingCount,
      priceLevel: priceLevel ?? this.priceLevel,
      website: website ?? this.website,
      phoneNumber: phoneNumber ?? this.phoneNumber,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
}

Map<String, dynamic>? _openingHoursFromJson(dynamic value) {
  if (value == null) {
    return null;
  }
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is String && value.trim().isNotEmpty) {
    try {
      final decoded = jsonDecode(value);
      if (decoded is Map<String, dynamic>) {
        return decoded;
      }
    } catch (_) {
      return null;
    }
  }
  return null;
}

Map<String, dynamic>? _openingHoursToJson(Map<String, dynamic>? value) => value;




