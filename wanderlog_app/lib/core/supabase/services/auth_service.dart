import 'package:supabase_flutter/supabase_flutter.dart';
import '../supabase_config.dart';

/// 认证服务
class AuthService {
  final SupabaseClient _client;

  AuthService([SupabaseClient? client])
      : _client = client ?? SupabaseConfig.client;

  /// 当前用户
  User? get currentUser => _client.auth.currentUser;

  /// 是否已登录
  bool get isAuthenticated => currentUser != null;

  /// 认证状态变化流
  Stream<AuthState> get authStateChanges => _client.auth.onAuthStateChange;

  /// 邮箱注册
  Future<AuthResponse> signUp({
    required String email,
    required String password,
    String? name,
  }) async {
    return await _client.auth.signUp(
      email: email,
      password: password,
      data: name != null ? {'name': name} : null,
    );
  }

  /// 邮箱登录
  Future<AuthResponse> signIn({
    required String email,
    required String password,
  }) async {
    return await _client.auth.signInWithPassword(
      email: email,
      password: password,
    );
  }

  /// Google 登录
  Future<bool> signInWithGoogle() async {
    final response = await _client.auth.signInWithOAuth(
      OAuthProvider.google,
      redirectTo: 'io.wanderlog.app://login-callback',
    );
    return response;
  }

  /// Apple 登录
  Future<bool> signInWithApple() async {
    final response = await _client.auth.signInWithOAuth(
      OAuthProvider.apple,
      redirectTo: 'io.wanderlog.app://login-callback',
    );
    return response;
  }

  /// 发送密码重置邮件
  Future<void> resetPassword(String email) async {
    await _client.auth.resetPasswordForEmail(email);
  }

  /// 更新密码
  Future<UserResponse> updatePassword(String newPassword) async {
    return await _client.auth.updateUser(
      UserAttributes(password: newPassword),
    );
  }

  /// 更新用户信息
  Future<UserResponse> updateProfile({
    String? name,
    String? avatarUrl,
  }) async {
    final data = <String, dynamic>{};
    if (name != null) data['name'] = name;
    if (avatarUrl != null) data['avatar_url'] = avatarUrl;

    return await _client.auth.updateUser(
      UserAttributes(data: data),
    );
  }

  /// 登出
  Future<void> signOut() async {
    await _client.auth.signOut();
  }

  /// 删除账号
  Future<void> deleteAccount() async {
    // 需要通过 Edge Function 实现
    await _client.functions.invoke('delete-account');
  }

  /// 获取当前 session
  Session? get currentSession => _client.auth.currentSession;

  /// 刷新 session
  Future<AuthResponse> refreshSession() async {
    return await _client.auth.refreshSession();
  }
}
