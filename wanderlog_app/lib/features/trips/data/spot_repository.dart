import 'package:dio/dio.dart';
import 'package:wanderlog/shared/models/spot_model.dart';

class SpotRepository {

  SpotRepository(this._dio);
  final Dio _dio;

  String get _placesBase => '/places';
  String get _spotsBase => '/spots'; // 兼容旧路由

  Future<List<Spot>> getSpots({String? city, String? category}) async {
    try {
      final queryParams = <String, dynamic>{};
      if (city != null) queryParams['city'] = city;
      if (category != null) queryParams['category'] = category;

      final response = await _getWithFallback<List<Spot>>(
        queryParams: queryParams,
        decode: (data) => (data as List<dynamic>)
            .map((json) => Spot.fromJson(json as Map<String, dynamic>))
            .toList(),
      );

      return response;
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Spot> getSpotById(String id) async {
    try {
      final response = await _getWithFallback<Spot>(
        path: '/$id',
        decode: (data) => Spot.fromJson(data as Map<String, dynamic>),
      );
      return response;
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
        '$_spotsBase/import', // 导入暂保留旧路由，后续可改为 /places/import
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

  /// 优先调用 /places，失败时回退 /spots，便于后端迁移期兼容
  Future<T> _getWithFallback<T>({
    required T Function(dynamic data) decode,
    String path = '',
    Map<String, dynamic>? queryParams,
  }) async {
    // try /places
    try {
      final response = await _dio.get<dynamic>(
        '$_placesBase$path',
        queryParameters: queryParams,
      );
      return decode(response.data);
    } on DioException catch (e) {
      // 如果 404/路由不存在，回退 /spots
      if (e.response?.statusCode == 404 || e.response?.statusCode == 501) {
        final fallback = await _dio.get<dynamic>(
          '$_spotsBase$path',
          queryParameters: queryParams,
        );
        return decode(fallback.data);
      }
      rethrow;
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






