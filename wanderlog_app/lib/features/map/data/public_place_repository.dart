import 'package:dio/dio.dart';
import 'package:wanderlog/features/map/data/models/public_place_dto.dart';

class PublicPlaceRepository {
  PublicPlaceRepository(this._dio);

  final Dio _dio;

  Future<List<PublicPlaceDto>> fetchPlacesByCity({
    required String city,
    int limit = 120,
    int page = 1,
    double? minRating,
  }) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/public-places',
        queryParameters: {
          'city': city,
          'limit': limit,
          'page': page,
          if (minRating != null) 'minRating': minRating,
        },
      );

      final data = response.data?['data'];
      if (data is List) {
        return data
            .whereType<Map<String, dynamic>>()
            .map(PublicPlaceDto.fromJson)
            .toList();
      }
      return const [];
    } on DioException catch (error) {
      final dynamic payload = error.response?.data;
      final message = payload is Map<String, dynamic>
          ? payload['error'] as String?
          : error.message;
      throw PublicPlaceRepositoryException(
        message ?? 'Failed to load public places for $city',
      );
    } catch (error) {
      throw PublicPlaceRepositoryException(error.toString());
    }
  }

  Future<PublicPlaceDto?> getPlaceById(String placeId) async {
    try {
      final response =
          await _dio.get<Map<String, dynamic>>('/public-places/$placeId');
      final data = response.data?['data'];
      if (data is Map<String, dynamic>) {
        return PublicPlaceDto.fromJson(data);
      }
      return null;
    } on DioException catch (error) {
      final dynamic payload = error.response?.data;
      final message = payload is Map<String, dynamic>
          ? payload['error'] as String?
          : error.message;
      throw PublicPlaceRepositoryException(
        message ?? 'Failed to load public place $placeId',
      );
    } catch (error) {
      throw PublicPlaceRepositoryException(error.toString());
    }
  }
}

class PublicPlaceRepositoryException implements Exception {
  PublicPlaceRepositoryException(this.message);
  final String message;

  @override
  String toString() => message;
}
