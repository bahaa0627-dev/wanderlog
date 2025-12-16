import 'package:dio/dio.dart';

class CollectionRepository {
  CollectionRepository(this._dio);
  final Dio _dio;

  Future<List<Map<String, dynamic>>> listCollections() async {
    final response = await _dio.get<Map<String, dynamic>>('/collections');
    final data = response.data?['data'] as List<dynamic>? ?? [];
    return data.cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> getCollection(String id) async {
    final response = await _dio.get<Map<String, dynamic>>('/collections/$id');
    return response.data?['data'] as Map<String, dynamic>;
  }

  Future<void> favoriteCollection(String id) async {
    await _dio.post('/collections/$id/favorite');
  }

  Future<void> unfavoriteCollection(String id) async {
    await _dio.delete('/collections/$id/favorite');
  }
}

