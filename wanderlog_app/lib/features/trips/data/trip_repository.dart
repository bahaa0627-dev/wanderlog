import 'package:dio/dio.dart';
import '../../../shared/models/trip_model.dart';
import '../../../shared/models/trip_spot_model.dart';

class TripRepository {
  final Dio _dio;

  TripRepository(this._dio);

  Future<List<Trip>> getMyTrips() async {
    try {
      final response = await _dio.get('/trips');
      final List<dynamic> data = response.data;
      return data.map((json) => Trip.fromJson(json)).toList();
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Trip> getTripById(String id) async {
    try {
      final response = await _dio.get('/trips/$id');
      return Trip.fromJson(response.data);
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
      final response = await _dio.post(
        '/trips',
        data: {
          'name': name,
          'city': city,
          'startDate': startDate?.toIso8601String(),
          'endDate': endDate?.toIso8601String(),
        },
      );
      return Trip.fromJson(response.data);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<TripSpot> manageTripSpot({
    required String tripId,
    required String spotId,
    TripSpotStatus? status,
    SpotPriority? priority,
    DateTime? visitDate,
    int? userRating,
    String? userNotes,
  }) async {
    try {
      final Map<String, dynamic> data = {
        'spotId': spotId,
      };

      if (status != null) data['status'] = status.name.toUpperCase();
      if (priority != null) data['priority'] = priority.name.toUpperCase();
      if (visitDate != null) data['visitDate'] = visitDate.toIso8601String();
      if (userRating != null) data['userRating'] = userRating;
      if (userNotes != null) data['userNotes'] = userNotes;

      final response = await _dio.put(
        '/trips/$tripId/spots',
        data: data,
      );
      return TripSpot.fromJson(response.data);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  String _handleError(DioException e) {
    if (e.response != null) {
      final message = e.response?.data['message'];
      if (message != null) return message;
    }
    return e.message ?? 'An error occurred';
  }
}


