import 'dart:async';
import 'package:dio/dio.dart';
import 'package:logger/logger.dart';

/// 重试拦截器 - 自动重试失败的请求
class RetryInterceptor extends Interceptor {

  RetryInterceptor({
    required Dio dio,
    this.maxRetries = 3,
    this.retryDelay = const Duration(seconds: 1),
    this.retryCondition,
  }) : _dio = dio;
  final Logger _logger = Logger();
  final int maxRetries;
  final Duration retryDelay;
  final bool Function(DioException)? retryCondition;
  final Dio _dio;

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    // 如果标记为跳过重试，直接传递错误
    if (err.requestOptions.extra['skipRetry'] == true) {
      return handler.next(err);
    }

    // 检查是否应该重试
    if (!_shouldRetry(err)) {
      return handler.next(err);
    }

    final options = err.requestOptions;
    int retryCount = (options.extra['retryCount'] as int?) ?? 0;

    if (retryCount >= maxRetries) {
      _logger.w('Max retries ($maxRetries) reached for ${options.path}');
      return handler.next(err);
    }

    retryCount++;
    options.extra['retryCount'] = retryCount;

    _logger.i(
      '🔄 Retrying request (attempt $retryCount/$maxRetries): ${options.method} ${options.path}',
    );

    // 等待后重试（指数退避）
    await Future.delayed(retryDelay * retryCount);

    try {
      // 创建新的请求选项，标记跳过重试避免循环
      final retryOptions = options.copyWith(
        extra: {...options.extra, 'retryCount': retryCount, 'skipRetry': true},
      );

      // 使用原始 Dio 实例重试，但标记跳过重试拦截器
      final response = await _dio.fetch(retryOptions);

      _logger.i('✅ Retry successful for ${options.path}');
      return handler.resolve(response);
    } catch (e) {
      if (e is DioException) {
        // 如果还是失败，继续重试或返回错误
        if (retryCount < maxRetries && _shouldRetry(e)) {
          // 重置 skipRetry 标志以便继续重试
          e.requestOptions.extra.remove('skipRetry');
          e.requestOptions.extra['retryCount'] = retryCount;
          return onError(e, handler);
        }
      }
      return handler.next(err);
    }
  }

  /// 判断是否应该重试
  bool _shouldRetry(DioException err) {
    // 如果提供了自定义条件，使用自定义条件
    if (retryCondition != null) {
      return retryCondition!(err);
    }

    // 默认重试条件：网络错误、超时、5xx 错误
    switch (err.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.connectionError:
        return true;
      case DioExceptionType.badResponse:
        // 5xx 服务器错误可以重试
        final statusCode = err.response?.statusCode;
        if (statusCode != null && statusCode >= 500 && statusCode < 600) {
          return true;
        }
        // 429 Too Many Requests 可以重试
        if (statusCode == 429) {
          return true;
        }
        return false;
      case DioExceptionType.cancel:
      case DioExceptionType.badCertificate:
      case DioExceptionType.unknown:
        // 检查是否是网络相关错误
        final errorMessage = err.message?.toLowerCase() ?? '';
        if (errorMessage.contains('socket') ||
            errorMessage.contains('network') ||
            errorMessage.contains('connection') ||
            errorMessage.contains('failed host lookup') ||
            errorMessage.contains('connection closed')) {
          return true;
        }
        return false;
    }
  }
}
