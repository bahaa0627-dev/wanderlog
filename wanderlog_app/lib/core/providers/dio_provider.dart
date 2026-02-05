import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:logger/logger.dart';
import 'package:wanderlog/core/constants/app_constants.dart';
import 'package:wanderlog/core/storage/storage_service.dart';
import 'package:wanderlog/core/supabase/supabase_config.dart';
import 'package:wanderlog/core/utils/platform_info.dart';
import 'package:wanderlog/core/network/retry_interceptor.dart';

String _withTrailingSlash(String value) =>
    value.endsWith('/') ? value : '$value/';

String _normalizeApiBaseUrl(String rawBaseUrl) {
  final trimmed = rawBaseUrl.trim();
  if (trimmed.isEmpty) return trimmed;

  Uri uri;
  try {
    uri = Uri.parse(trimmed);
  } catch (_) {
    return trimmed;
  }

  // Only rewrite when we have a real URL.
  if (!uri.hasScheme) return trimmed;

  final host = uri.host;
  if (host != 'localhost' && host != '127.0.0.1') return trimmed;

  // Android emulator cannot reach host machine via localhost.
  if (isAndroid) {
    return uri.replace(host: '10.0.2.2').toString();
  }

  // Keep iOS simulator compatible and avoid occasional localhost issues.
  if (isIOS && host == 'localhost') {
    return uri.replace(host: '127.0.0.1').toString();
  }

  return trimmed;
}

final dioProvider = Provider<Dio>((ref) {
  final rawBaseUrl = dotenv.maybeGet('API_BASE_URL') ?? AppConstants.apiBaseUrl;
  final normalizedBaseUrl =
      _withTrailingSlash(_normalizeApiBaseUrl(rawBaseUrl));
  final dio = Dio(
    BaseOptions(
      baseUrl: normalizedBaseUrl,
      connectTimeout: AppConstants.connectionTimeout,
      receiveTimeout: AppConstants.receiveTimeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ),
  );

  final logger = Logger();
  logger.i('Dio baseUrl: $normalizedBaseUrl');

  // Add retry interceptor first (so it can catch errors from other interceptors)
  // Note: We add it after creating dio, but it needs the dio instance
  // So we'll add it after all interceptors are set up

  // Add interceptor for logging
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        if (!options.path.startsWith('http') && options.path.startsWith('/')) {
          options.path = options.path.substring(1);
        }
        logger.d('Request: ${options.method} ${options.path}');

        // Add auth token if available
        final token = await StorageService.instance.getSecure('auth_token');
        if (token != null && token.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $token';
          // 打印 token 前20个字符用于调试
          final tokenPreview =
              token.length > 20 ? '${token.substring(0, 20)}...' : token;
          logger.d('Auth attached: $tokenPreview (length: ${token.length})');
        } else {
          logger.w('Auth token missing - checking Supabase session...');
          // 尝试从 Supabase 获取 token
          if (SupabaseConfig.isInitialized) {
            final session = SupabaseConfig.auth.currentSession;
            if (session != null && session.accessToken.isNotEmpty) {
              final accessToken = session.accessToken;
              await StorageService.instance
                  .setSecure('auth_token', accessToken);
              options.headers['Authorization'] = 'Bearer $accessToken';
              logger.i('Auth recovered from Supabase session');
            } else {
              logger.e('No Supabase session available');
            }
          }
        }

        return handler.next(options);
      },
      onResponse: (response, handler) {
        logger.d('Response: ${response.statusCode}');
        return handler.next(response);
      },
      onError: (error, handler) async {
        // Extract detailed error information
        String errorDetails = 'Unknown error';

        final dioError = error;
        final requestPath = dioError.requestOptions.path;
        final requestMethod = dioError.requestOptions.method;
        final statusCode = dioError.response?.statusCode;
        final statusMessage = dioError.response?.statusMessage;

        // 处理 401 未授权错误：尝试刷新 token 并重试
        if (statusCode == 401) {
          logger.w('401 Unauthorized - attempting to refresh token...');

          // 检查是否已经是重试请求，避免无限循环
          if (dioError.requestOptions.extra['isRetry'] == true) {
            logger.e('401 after retry - clearing auth token');
            await StorageService.instance.deleteSecure('auth_token');
            return handler.next(error);
          }

          try {
            // 尝试刷新 Supabase session
            if (SupabaseConfig.isInitialized) {
              final refreshResponse =
                  await SupabaseConfig.auth.refreshSession();
              final newSession = refreshResponse.session;

              if (newSession != null && newSession.accessToken.isNotEmpty) {
                // 保存新 token
                await StorageService.instance
                    .setSecure('auth_token', newSession.accessToken);
                logger.i('✅ Token refreshed successfully, retrying request...');

                // 用新 token 重试请求
                final opts = dioError.requestOptions;
                opts.headers['Authorization'] =
                    'Bearer ${newSession.accessToken}';
                opts.extra['isRetry'] = true;

                final retryResponse = await dio.fetch<dynamic>(opts);
                return handler.resolve(retryResponse);
              }
            }
          } catch (refreshError) {
            logger.e('Failed to refresh token: $refreshError');
          }

          // 刷新失败，清除无效的 token
          await StorageService.instance.deleteSecure('auth_token');
        }

        // Build detailed error message
        final buffer = StringBuffer();
        buffer.writeln('DioException: ${dioError.type}');
        buffer.writeln('Request: $requestMethod $requestPath');

        if (statusCode != null) {
          buffer.writeln('Status: $statusCode $statusMessage');
        }

        // Handle specific error types
        switch (dioError.type) {
          case DioExceptionType.connectionTimeout:
            buffer.writeln(
                'Connection timeout - server may be down or unreachable');
            break;
          case DioExceptionType.sendTimeout:
            buffer.writeln('Send timeout - network may be slow');
            break;
          case DioExceptionType.receiveTimeout:
            buffer.writeln('Receive timeout - server took too long to respond');
            break;
          case DioExceptionType.badResponse:
            buffer.writeln('Bad response: ${dioError.response?.data}');
            break;
          case DioExceptionType.cancel:
            buffer.writeln('Request cancelled');
            break;
          case DioExceptionType.connectionError:
            final errorMessage = dioError.message ?? 'Unknown connection error';
            buffer.writeln('Connection error: $errorMessage');
            if (errorMessage.contains('Failed host lookup') ||
                errorMessage.contains('nodename nor servname provided')) {
              buffer.writeln(
                  '⚠️ DNS resolution failed - check internet connection');
            } else if (errorMessage.contains('Connection refused') ||
                errorMessage.contains('Connection closed')) {
              buffer
                  .writeln('⚠️ Server unreachable - ensure backend is running');
            }
            break;
          case DioExceptionType.badCertificate:
            buffer.writeln('Bad certificate');
            break;
          case DioExceptionType.unknown:
            final errorMessage = dioError.message ?? 'Unknown error';
            buffer.writeln('Unknown error: $errorMessage');
            if (dioError.error != null) {
              buffer.writeln('Underlying error: ${dioError.error}');
            }
            break;
        }

        errorDetails = buffer.toString();

        logger.e(errorDetails);
        return handler.next(error);
      },
    ),
  );

  // Add retry interceptor last (needs dio instance)
  dio.interceptors.add(
    RetryInterceptor(
      dio: dio,
      maxRetries: 3,
      retryDelay: const Duration(seconds: 1),
    ),
  );

  return dio;
});
