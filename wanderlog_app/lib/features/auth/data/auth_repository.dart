import 'package:dio/dio.dart';
import 'package:wanderlog/core/storage/storage_service.dart';
import 'package:wanderlog/shared/models/user_model.dart';

class AuthRepository {

  AuthRepository(this._dio, this._storage);
  final Dio _dio;
  final StorageService _storage;

  static const String _tokenKey = 'auth_token';

  Future<String?> getToken() async => await _storage.getSecure(_tokenKey);

  Future<void> _saveToken(String token) async {
    await _storage.setSecure(_tokenKey, token);
  }

  Future<void> clearToken() async {
    await _storage.deleteSecure(_tokenKey);
  }

  Future<AuthResult> login(String email, String password) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/login',
        data: {
          'email': email,
          'password': password,
        },
      );

      final token = response.data!['token'] as String;
      final user = User.fromJson(response.data!['user'] as Map<String, dynamic>);

      await _saveToken(token);

      return AuthResult(user: user, token: token);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<AuthResult> register(String email, String password, String? name) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/register',
        data: {
          'email': email,
          'password': password,
          'name': name,
        },
      );

      final token = response.data!['token'] as String;
      final user = User.fromJson(response.data!['user'] as Map<String, dynamic>);

      await _saveToken(token);

      return AuthResult(user: user, token: token);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<User> getMe() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/auth/me');
      return User.fromJson(response.data!);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<void> logout() async {
    await clearToken();
  }

  /// 验证邮箱
  Future<AuthResult> verifyEmail(String code) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/verify-email',
        data: {'code': code},
      );

      final token = response.data!['token'] as String;
      final user = User.fromJson(response.data!['user'] as Map<String, dynamic>);

      await _saveToken(token);

      return AuthResult(user: user, token: token);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  /// 重发验证码
  Future<void> resendVerification() async {
    try {
      await _dio.post<void>('/auth/resend-verification');
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  /// 忘记密码
  Future<void> forgotPassword(String email) async {
    try {
      await _dio.post<void>(
        '/auth/forgot-password',
        data: {'email': email},
      );
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  /// 重置密码
  Future<void> resetPassword({
    required String email,
    required String code,
    required String newPassword,
  }) async {
    try {
      await _dio.post<void>(
        '/auth/reset-password',
        data: {
          'email': email,
          'code': code,
          'newPassword': newPassword,
        },
      );
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  /// Google 登录
  Future<AuthResult> loginWithGoogle(String idToken) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/auth/google',
        data: {'idToken': idToken},
      );

      final token = response.data!['accessToken'] as String;
      final user = User.fromJson(response.data!['user'] as Map<String, dynamic>);

      await _saveToken(token);

      return AuthResult(user: user, token: token);
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

class AuthResult {

  AuthResult({required this.user, required this.token});
  final User user;
  final String token;
}



