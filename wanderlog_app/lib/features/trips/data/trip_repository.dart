import 'package:dio/dio.dart';
import 'package:wanderlog/shared/models/trip_model.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart';

class TripRepository {

  TripRepository(this._dio);
  final Dio _dio;

  Future<List<Trip>> getMyTrips() async {
    try {
      final response = await _dio.get<List<dynamic>>('/destinations');
      final List<dynamic> data = response.data as List<dynamic>;
      return data.map((json) => Trip.fromJson(json as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Trip> getTripById(String id) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/destinations/$id');
      return Trip.fromJson(response.data!);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Trip> createTrip({
    required String name,
    String? city,
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/destinations',
        data: {
          'name': name,
          'city': city,
          'startDate': startDate?.toIso8601String(),
          'endDate': endDate?.toIso8601String(),
        },
      );
      return Trip.fromJson(response.data!);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<TripSpot?> manageTripSpot({
    required String tripId,
    required String spotId,
    TripSpotStatus? status,
    SpotPriority? priority,
    DateTime? visitDate,
    int? userRating,
    String? userNotes,
    Map<String, dynamic>? spotPayload,
    bool remove = false,
  }) async {
    try {
      final Map<String, dynamic> data = {
        'spotId': spotId,
      };

      if (remove) {
        data['remove'] = true;
      }
      if (status != null) data['status'] = status.name.toUpperCase();
      if (priority != null) data['priority'] = _priorityToServer(priority);
      if (visitDate != null) data['visitDate'] = visitDate.toIso8601String();
      if (userRating != null) data['userRating'] = userRating;
      if (userNotes != null) data['userNotes'] = userNotes;
      if (spotPayload != null) data['spot'] = spotPayload;

      final response = await _dio.put<Map<String, dynamic>>(
        '/destinations/$tripId/spots',
        data: data,
      );
      if (remove) return null;
      return TripSpot.fromJson(response.data!);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  String _priorityToServer(SpotPriority priority) {
    switch (priority) {
      case SpotPriority.mustGo:
        return 'MUST_GO';
      case SpotPriority.optional:
        return 'OPTIONAL';
    }
  }

  String _handleError(DioException e) {
    if (e.response != null) {
      final message = e.response?.data['message'];
      if (message != null) return message as String;
    }
    return e.message ?? 'An error occurred';
  }
}




