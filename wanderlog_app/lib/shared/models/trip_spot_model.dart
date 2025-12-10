import 'package:json_annotation/json_annotation.dart';
import 'spot_model.dart';

part 'trip_spot_model.g.dart';

enum TripSpotStatus {
  @JsonValue('WISHLIST')
  wishlist,
  @JsonValue('TODAYS_PLAN')
  todaysPlan,
  @JsonValue('VISITED')
  visited,
}

enum SpotPriority {
  @JsonValue('MUST_GO')
  mustGo,
  @JsonValue('OPTIONAL')
  optional,
}

@JsonSerializable()
class TripSpot {
  final String id;
  final String tripId;
  final String spotId;
  final Spot? spot;
  final TripSpotStatus status;
  final SpotPriority priority;
  final DateTime? visitDate;
  final int? userRating;
  final String? userNotes;
  final List<String> userPhotos;
  final DateTime createdAt;
  final DateTime updatedAt;

  TripSpot({
    required this.id,
    required this.tripId,
    required this.spotId,
    this.spot,
    required this.status,
    required this.priority,
    this.visitDate,
    this.userRating,
    this.userNotes,
    required this.userPhotos,
    required this.createdAt,
    required this.updatedAt,
  });

  factory TripSpot.fromJson(Map<String, dynamic> json) =>
      _$TripSpotFromJson(json);
  Map<String, dynamic> toJson() => _$TripSpotToJson(this);

  TripSpot copyWith({
    String? id,
    String? tripId,
    String? spotId,
    Spot? spot,
    TripSpotStatus? status,
    SpotPriority? priority,
    DateTime? visitDate,
    int? userRating,
    String? userNotes,
    List<String>? userPhotos,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return TripSpot(
      id: id ?? this.id,
      tripId: tripId ?? this.tripId,
      spotId: spotId ?? this.spotId,
      spot: spot ?? this.spot,
      status: status ?? this.status,
      priority: priority ?? this.priority,
      visitDate: visitDate ?? this.visitDate,
      userRating: userRating ?? this.userRating,
      userNotes: userNotes ?? this.userNotes,
      userPhotos: userPhotos ?? this.userPhotos,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}


