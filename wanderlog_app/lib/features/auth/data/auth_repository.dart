import 'package:dio/dio.dart';
import '../../../core/storage/storage_service.dart';
import '../../../shared/models/user_model.dart';

class AuthRepository {
  final Dio _dio;
  final StorageService _storage;

  static const String _tokenKey = 'auth_token';

  AuthRepository(this._dio, this._storage);

  Future<String?> getToken() async {
    return await _storage.getSecure(_tokenKey);
  }

  Future<void> _saveToken(String token) async {
    await _storage.setSecure(_tokenKey, token);
  }

  Future<void> clearToken() async {
    await _storage.deleteSecure(_tokenKey);
  }

  Future<AuthResult> login(String email, String password) async {
    try {
      final response = await _dio.post(
        '/auth/login',
        data: {
          'email': email,
          'password': password,
        },
      );

      final token = response.data['token'] as String;
      final user = User.fromJson(response.data['user']);

      await _saveToken(token);

      return AuthResult(user: user, token: token);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<AuthResult> register(String email, String password, String? name) async {
    try {
      final response = await _dio.post(
        '/auth/register',
        data: {
          'email': email,
          'password': password,
          'name': name,
        },
      );

      final token = response.data['token'] as String;
      final user = User.fromJson(response.data['user']);

      await _saveToken(token);

      return AuthResult(user: user, token: token);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<User> getMe() async {
    try {
      final response = await _dio.get('/auth/me');
      return User.fromJson(response.data);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<void> logout() async {
    await clearToken();
  }

  String _handleError(DioException e) {
    if (e.response != null) {
      final message = e.response?.data['message'];
      if (message != null) return message;
    }
    return e.message ?? 'An error occurred';
  }
}

class AuthResult {
  final User user;
  final String token;

  AuthResult({required this.user, required this.token});
}


