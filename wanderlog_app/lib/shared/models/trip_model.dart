import 'package:json_annotation/json_annotation.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart';

part 'trip_model.g.dart';

enum TripStatus {
  @JsonValue('PLANNING')
  planning,
  @JsonValue('ACTIVE')
  active,
  @JsonValue('COMPLETED')
  completed,
}

@JsonSerializable()
class Trip {

  Trip({
    required this.id,
    required this.userId,
    required this.name,
    this.status,
    this.createdAt,
    this.updatedAt,
    this.city,
    this.startDate,
    this.endDate,
    this.coverImage,
    this.tripSpots,
    this.count,
  });

  factory Trip.fromJson(Map<String, dynamic> json) => _$TripFromJson(json);
  final String id;
  final String userId;
  final String name;
  final String? city;
  final DateTime? startDate;
  final DateTime? endDate;
  final String? coverImage;
  final TripStatus? status;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final List<TripSpot>? tripSpots;
  
  @JsonKey(name: '_count')
  final Map<String, dynamic>? count;
  Map<String, dynamic> toJson() => _$TripToJson(this);

  int get spotCount {
    if (count != null && count!['tripSpots'] != null) {
      return count!['tripSpots'] as int;
    }
    return tripSpots?.length ?? 0;
  }

  Trip copyWith({
    String? id,
    String? userId,
    String? name,
    String? city,
    DateTime? startDate,
    DateTime? endDate,
    String? coverImage,
    TripStatus? status,
    DateTime? createdAt,
    DateTime? updatedAt,
    List<TripSpot>? tripSpots,
    Map<String, dynamic>? count,
  }) => Trip(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      name: name ?? this.name,
      city: city ?? this.city,
      startDate: startDate ?? this.startDate,
      endDate: endDate ?? this.endDate,
      coverImage: coverImage ?? this.coverImage,
      status: status ?? this.status,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      tripSpots: tripSpots ?? this.tripSpots,
      count: count ?? this.count,
    );
}






