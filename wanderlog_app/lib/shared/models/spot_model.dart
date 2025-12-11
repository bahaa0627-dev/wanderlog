import 'package:json_annotation/json_annotation.dart';

part 'spot_model.g.dart';

@JsonSerializable()
class Spot {

  Spot({
    required this.id,
    required this.googlePlaceId,
    required this.name,
    required this.latitude,
    required this.longitude,
    required this.tags, required this.images, required this.createdAt, required this.updatedAt, this.address,
    this.category,
    this.openingHours,
    this.rating,
    this.priceLevel,
    this.website,
    this.phoneNumber,
  });

  factory Spot.fromJson(Map<String, dynamic> json) => _$SpotFromJson(json);
  final String id;
  final String googlePlaceId;
  final String name;
  final double latitude;
  final double longitude;
  final String? address;
  final String? category;
  final List<String> tags;
  final Map<String, dynamic>? openingHours;
  final List<String> images;
  final double? rating;
  final int? priceLevel;
  final String? website;
  final String? phoneNumber;
  final DateTime createdAt;
  final DateTime updatedAt;
  Map<String, dynamic> toJson() => _$SpotToJson(this);

  Spot copyWith({
    String? id,
    String? googlePlaceId,
    String? name,
    double? latitude,
    double? longitude,
    String? address,
    String? category,
    List<String>? tags,
    Map<String, dynamic>? openingHours,
    List<String>? images,
    double? rating,
    int? priceLevel,
    String? website,
    String? phoneNumber,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) => Spot(
      id: id ?? this.id,
      googlePlaceId: googlePlaceId ?? this.googlePlaceId,
      name: name ?? this.name,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      address: address ?? this.address,
      category: category ?? this.category,
      tags: tags ?? this.tags,
      openingHours: openingHours ?? this.openingHours,
      images: images ?? this.images,
      rating: rating ?? this.rating,
      priceLevel: priceLevel ?? this.priceLevel,
      website: website ?? this.website,
      phoneNumber: phoneNumber ?? this.phoneNumber,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
}



