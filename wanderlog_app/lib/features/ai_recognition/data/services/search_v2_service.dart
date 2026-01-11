import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:wanderlog/features/ai_recognition/data/models/search_v2_result.dart';

/// SearchV2 服务
///
/// 调用后端 /places/ai/search-v2 API 实现并行搜索
/// Requirements: 2.1
class SearchV2Service {
  SearchV2Service({required Dio dio}) : _dio = dio;

  final Dio _dio;

  /// 获取后端 API 基础 URL
  String get _apiBaseUrl =>
      dotenv.env['API_BASE_URL'] ?? 'http://localhost:3000/api';

  /// 执行 V2 搜索
  ///
  /// [query] 用户搜索查询
  /// [userId] 用户 ID（用于配额检查）
  /// [userLat] 用户纬度（可选）
  /// [userLng] 用户经度（可选）
  /// [language] 用户语言设置（如 'en', 'zh'）
  /// [onStageChange] 阶段变化回调
  /// [cancelToken] 取消令牌
  ///
  /// Returns [SearchV2Result] 搜索结果
  Future<SearchV2Result> searchV2({
    required String query,
    required String userId,
    double? userLat,
    double? userLng,
    String language = 'en',
    void Function(SearchLoadingState)? onStageChange,
    CancelToken? cancelToken,
  }) async {
    if (query.trim().isEmpty) {
      return SearchV2Result.error('Please enter a search query.');
    }

    try {
      // Stage 1: 分析用户诉求 (1s)
      onStageChange?.call(const SearchLoadingState.analyzing());
      await Future<void>.delayed(const Duration(seconds: 1));

      // 检查是否已取消
      if (cancelToken?.isCancelled ?? false) {
        return SearchV2Result.error('Request cancelled');
      }

      // Stage 2: 正在寻找合适地点
      onStageChange?.call(const SearchLoadingState.searching());

      debugPrint(
          '🔍 SearchV2: Calling API with query: $query, language: $language',);

      final previousConnectTimeout = _dio.options.connectTimeout;
      _dio.options.connectTimeout = const Duration(seconds: 120);

      late final Response<Map<String, dynamic>> response;
      try {
        response = await _dio.post<Map<String, dynamic>>(
          '$_apiBaseUrl/places/ai/search-v2',
          data: {
            'query': query,
            'userId': userId,
            'language': language,
            if (userLat != null) 'userLat': userLat,
            if (userLng != null) 'userLng': userLng,
          },
          cancelToken: cancelToken,
          options: Options(
            sendTimeout: const Duration(seconds: 120),
            receiveTimeout: const Duration(seconds: 120),
          ),
        );
      } finally {
        _dio.options.connectTimeout = previousConnectTimeout;
      }

      // 检查是否已取消
      if (cancelToken?.isCancelled ?? false) {
        return SearchV2Result.error('Request cancelled');
      }

      // Stage 3: 总结输出中
      onStageChange?.call(const SearchLoadingState.summarizing());

      final data = response.data;
      if (data == null) {
        return SearchV2Result.error('Empty response from server');
      }

      debugPrint('✅ SearchV2: Response received');
      debugPrint('🔍 SearchV2: Raw response data: $data');

      // 解析响应
      final result = SearchV2Result.fromJson(data);

      // Stage 4: 完成
      onStageChange?.call(const SearchLoadingState.complete());

      return result;
    } on DioException catch (e) {
      debugPrint('❌ SearchV2 DioException: ${e.message}');

      if (e.type == DioExceptionType.cancel) {
        return SearchV2Result.error('Request cancelled');
      }

      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout) {
        return SearchV2Result.error(
          'Request timed out. Please try again.',
        );
      }

      // 尝试解析错误响应
      final responseData = e.response?.data;
      if (responseData is Map<String, dynamic>) {
        final errorMessage = responseData['error'] as String?;
        if (errorMessage != null) {
          return SearchV2Result.error(errorMessage);
        }
      }

      return SearchV2Result.error(
        'Search failed: ${e.message ?? 'Unknown error'}',
      );
    } catch (e) {
      debugPrint('❌ SearchV2 Error: $e');
      return SearchV2Result.error('Search failed: $e');
    }
  }

  /// 获取剩余配额
  ///
  /// [userId] 用户 ID
  ///
  /// Returns 剩余搜索次数
  Future<int> getRemainingQuota(String userId) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '$_apiBaseUrl/places/ai/quota',
        queryParameters: {'userId': userId},
      );

      final data = response.data;
      if (data != null && data['success'] == true) {
        return data['remaining'] as int? ?? 10;
      }
      return 10; // Default quota on failure
    } catch (e) {
      debugPrint('❌ GetQuota Error: $e');
      return 10; // Default quota on error
    }
  }
}

/// SearchV2 服务的状态管理扩展
///
/// 提供更细粒度的加载状态控制
class SearchV2StateManager {
  SearchV2StateManager();

  final _stageController = StreamController<SearchLoadingState>.broadcast();

  /// 阶段变化流
  Stream<SearchLoadingState> get stageStream => _stageController.stream;

  /// 当前阶段
  SearchLoadingState _currentState = const SearchLoadingState.complete();
  SearchLoadingState get currentState => _currentState;

  /// 更新阶段
  void updateStage(SearchLoadingState state) {
    _currentState = state;
    _stageController.add(state);
  }

  /// 重置状态
  void reset() {
    _currentState = const SearchLoadingState.complete();
    _stageController.add(_currentState);
  }

  /// 释放资源
  void dispose() {
    _stageController.close();
  }
}
