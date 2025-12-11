import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:logger/logger.dart';
import 'package:wanderlog/core/constants/app_constants.dart';
import 'package:wanderlog/core/storage/storage_service.dart';

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: dotenv.maybeGet('API_BASE_URL') ?? AppConstants.apiBaseUrl,
      connectTimeout: AppConstants.connectionTimeout,
      receiveTimeout: AppConstants.receiveTimeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ),
  );

  final logger = Logger();

  // Add interceptor for logging
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        logger.d('Request: ${options.method} ${options.path}');
        
        // Add auth token if available
        final token = await StorageService.instance.getSecure('auth_token');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
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



