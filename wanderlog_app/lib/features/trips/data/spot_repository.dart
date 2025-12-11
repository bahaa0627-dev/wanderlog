import 'package:dio/dio.dart';
import 'package:wanderlog/shared/models/spot_model.dart';

class SpotRepository {

  SpotRepository(this._dio);
  final Dio _dio;

  Future<List<Spot>> getSpots({String? city, String? category}) async {
    try {
      final queryParams = <String, dynamic>{};
      if (city != null) queryParams['city'] = city;
      if (category != null) queryParams['category'] = category;

      final response = await _dio.get<List<dynamic>>(
        '/spots',
        queryParameters: queryParams,
      );
      
      final List<dynamic> data = response.data as List<dynamic>;
      return data.map((json) => Spot.fromJson(json as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Spot> getSpotById(String id) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/spots/$id');
      return Spot.fromJson(response.data!);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Spot> importSpot({
    required String googlePlaceId,
    required String name,
    required double latitude,
    required double longitude,
    String? address,
    String? category,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/spots/import',
        data: {
          'googlePlaceId': googlePlaceId,
          'name': name,
          'latitude': latitude,
          'longitude': longitude,
          'address': address,
          'category': category,
        },
      );
      return Spot.fromJson(response.data!);
    } on DioException catch (e) {
      throw _handleError(e);
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



