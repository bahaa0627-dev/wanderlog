import 'package:dio/dio.dart';

class CollectionRepository {
  CollectionRepository(this._dio);
  final Dio _dio;

  Future<List<Map<String, dynamic>>> listCollections({bool includeAll = false}) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/collections',
      queryParameters: {'includeAll': includeAll},
    );
    final data = response.data?['data'] as List<dynamic>? ?? [];
    return data.cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> getCollection(String id) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/collections/$id',
      queryParameters: {'includeAll': true},
    );
    return response.data?['data'] as Map<String, dynamic>;
  }

  Future<void> favoriteCollection(String id) async {
    await _dio.post('/collections/$id/favorite');
  }

  Future<void> unfavoriteCollection(String id) async {
    await _dio.delete('/collections/$id/favorite');
  }

  /// 获取合集推荐列表
  Future<List<Map<String, dynamic>>> listRecommendations() async {
    try {
      print('📡 Requesting recommendations from /collection-recommendations');
      final response = await _dio.get<Map<String, dynamic>>(
        '/collection-recommendations',
      );
      print('📥 Response status: ${response.statusCode}');
      print('📦 Response data: ${response.data}');
      
      if (response.data == null) {
        print('⚠️ Response data is null');
        return [];
      }
      
      final data = response.data?['data'] as List<dynamic>?;
      print('📊 Parsed data: $data');
      
      if (data == null) {
        print('⚠️ Data field is null or not a list');
        print('🔍 Response structure: ${response.data?.keys}');
        return [];
      }
      
      final result = data.cast<Map<String, dynamic>>();
      print('✅ Returning ${result.length} recommendations');
      return result;
    } catch (e, stackTrace) {
      print('❌ Error in listRecommendations: $e');
      print('📋 Stack trace: $stackTrace');
      rethrow;
    }
  }

  /// 获取单个合集推荐详情
  Future<Map<String, dynamic>> getRecommendation(String id) async {
    try {
      print('📡 Requesting recommendation details from /collection-recommendations/$id');
      final response = await _dio.get<Map<String, dynamic>>(
        '/collection-recommendations/$id',
      );
      print('📥 Response status: ${response.statusCode}');
      print('📦 Response data: ${response.data}');

      if (response.data == null) {
        print('⚠️ Response data is null');
        throw Exception('Response data is null');
      }

      final data = response.data?['data'] as Map<String, dynamic>?;
      if (data == null) {
        print('⚠️ Data field is null or not a map');
        throw Exception('Data field is null or not a map');
      }

      print('✅ Returning recommendation data');
      return data;
    } catch (e, stackTrace) {
      print('❌ Error in getRecommendation: $e');
      print('📋 Stack trace: $stackTrace');
      rethrow;
    }
  }
}

