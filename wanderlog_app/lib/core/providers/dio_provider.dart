import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:logger/logger.dart';
import 'package:wanderlog/core/constants/app_constants.dart';
import 'package:wanderlog/core/storage/storage_service.dart';
import 'package:wanderlog/core/utils/platform_info.dart';

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
          logger.d('Auth attached');
        } else {
          logger.w('Auth token missing');
        }

        return handler.next(options);
      },
      onResponse: (response, handler) {
        logger.d('Response: ${response.statusCode}');
        return handler.next(response);
      },
      onError: (error, handler) {
        logger.e('Error: ${error.message}');
        return handler.next(error);
      },
    ),
  );

  return dio;
});
