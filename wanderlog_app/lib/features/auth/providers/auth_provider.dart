import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/core/providers/dio_provider.dart';
import 'package:wanderlog/core/storage/storage_service.dart';
import 'package:wanderlog/core/supabase/supabase_config.dart';
import 'package:wanderlog/shared/models/user_model.dart';
import 'package:wanderlog/features/auth/data/auth_repository.dart';

// Auth Repository Provider
final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return AuthRepository(dio, StorageService.instance);
});

// Auth State
class AuthState {

  AuthState({
    this.user,
    this.isLoading = false,
    this.error,
  });
  final User? user;
  final bool isLoading;
  final String? error;

  bool get isAuthenticated => user != null;

  AuthState copyWith({
    User? user,
    bool? isLoading,
    String? error,
  }) => AuthState(
      user: user ?? this.user,
      isLoading: isLoading ?? this.isLoading,
      error: error ?? this.error,
    );
}

// Auth State Notifier
class AuthNotifier extends StateNotifier<AuthState> {

  AuthNotifier(this._repository) : super(AuthState()) {
    _checkAuthStatus();
    // 监听 Supabase Auth 状态变化
    SupabaseConfig.auth.onAuthStateChange.listen((data) {
      _handleSupabaseAuthChange(data.session);
    });
  }
  final AuthRepository _repository;

  Future<void> _handleSupabaseAuthChange(dynamic session) async {
    if (session != null) {
      // 保存 Supabase token 到 StorageService，供 Dio 使用
      final accessToken = session.accessToken as String?;
      if (accessToken != null && accessToken.isNotEmpty) {
        await StorageService.instance.setSecure('auth_token', accessToken);
      }
      await _checkAuthStatus();
    } else {
      // 用户登出
      await StorageService.instance.deleteSecure('auth_token');
      state = AuthState();
    }
  }

  Future<void> _checkAuthStatus() async {
    // 优先检查 Supabase Auth 状态
    final supabaseUser = SupabaseConfig.currentUser;
    final session = SupabaseConfig.auth.currentSession;
    
    if (supabaseUser != null && session != null) {
      // 保存 Supabase token 到 StorageService，供 Dio 使用
      final accessToken = session.accessToken;
      if (accessToken.isNotEmpty) {
        await StorageService.instance.setSecure('auth_token', accessToken);
      }
      
      // 从 Supabase 用户创建 User 对象
      final user = User(
        id: supabaseUser.id,
        email: supabaseUser.email ?? '',
        name: supabaseUser.userMetadata?['name'] as String?,
        avatarUrl: supabaseUser.userMetadata?['avatar_url'] as String?,
        isEmailVerified: supabaseUser.emailConfirmedAt != null,
        createdAt: DateTime.tryParse(supabaseUser.createdAt) ?? DateTime.now(),
        updatedAt: DateTime.tryParse(supabaseUser.updatedAt ?? '') ?? DateTime.now(),
      );
      state = state.copyWith(user: user);
      return;
    }
    
    // 回退到后端 API 检查
    final token = await _repository.getToken();
    if (token != null) {
      try {
        final user = await _repository.getMe();
        state = state.copyWith(user: user);
      } catch (e) {
        // Token invalid, clear it
        await _repository.clearToken();
      }
    }
  }
  
  /// 刷新认证状态（从 Supabase 重新检查）
  Future<void> refreshAuthState() async {
    await _checkAuthStatus();
  }

  Future<void> login(String email, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final result = await _repository.login(email, password);
      state = AuthState(user: result.user, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      rethrow;
    }
  }

  Future<void> register(String email, String password, String? name) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final result = await _repository.register(email, password, name);
      state = AuthState(user: result.user, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      rethrow;
    }
  }

  Future<void> logout() async {
    // 同时登出 Supabase
    try {
      await SupabaseConfig.auth.signOut();
    } catch (e) {
      // 忽略 Supabase 登出错误
    }
    await _repository.logout();
    state = AuthState();
  }

  Future<void> verifyEmail(String code) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final result = await _repository.verifyEmail(code);
      state = AuthState(user: result.user, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      rethrow;
    }
  }

  Future<void> resendVerification() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      await _repository.resendVerification();
      state = state.copyWith(isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      rethrow;
    }
  }

  Future<void> forgotPassword(String email) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      await _repository.forgotPassword(email);
      state = state.copyWith(isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      rethrow;
    }
  }

  Future<void> resetPassword(String email, String code, String newPassword) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      await _repository.resetPassword(
        email: email,
        code: code,
        newPassword: newPassword,
      );
      state = state.copyWith(isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      rethrow;
    }
  }

  Future<void> loginWithGoogle(String idToken) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final result = await _repository.loginWithGoogle(idToken);
      state = AuthState(user: result.user, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      rethrow;
    }
  }
}

// Auth State Provider
final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final repository = ref.watch(authRepositoryProvider);
  return AuthNotifier(repository);
});






