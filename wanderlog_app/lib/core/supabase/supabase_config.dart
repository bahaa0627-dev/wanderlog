import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:logger/logger.dart';

/// Supabase 配置和初始化
class SupabaseConfig {
  static final Logger _logger = Logger();
  static bool _initialized = false;
  static String? _initializationError;

  static String get url => dotenv.env['SUPABASE_URL'] ?? '';
  static String get anonKey => dotenv.env['SUPABASE_ANON_KEY'] ?? '';
  static String get imagesBaseUrl =>
      dotenv.env['IMAGES_BASE_URL'] ?? 'https://images.wanderlog.app';

  /// 深度链接 scheme
  static const String deepLinkScheme = 'io.supabase.vago';
  static const String deepLinkHost = 'login-callback';
  static String get redirectUrl => '$deepLinkScheme://$deepLinkHost';

  /// 检查 Supabase 是否已初始化
  static bool get isInitialized => _initialized;

  /// 获取初始化错误
  static String? get initializationError => _initializationError;

  /// 初始化 Supabase
  static Future<void> initialize() async {
    if (_initialized) {
      _logger.d('Supabase already initialized');
      return;
    }

    try {
      // 检查配置
      if (url.isEmpty || anonKey.isEmpty) {
        final error = 'Supabase configuration missing: '
            'SUPABASE_URL=${url.isEmpty ? "missing" : "set"}, '
            'SUPABASE_ANON_KEY=${anonKey.isEmpty ? "missing" : "set"}';
        _initializationError = error;
        _logger.w('⚠️ $error');
        _logger.w('⚠️ Supabase features will be disabled. Please check your .env file.');
        return;
      }

      _logger.i('Initializing Supabase with URL: $url');

      await Supabase.initialize(
        url: url,
        anonKey: anonKey,
        authOptions: const FlutterAuthClientOptions(
          // 使用 implicit 流程避免 PKCE code verifier 问题
          authFlowType: AuthFlowType.implicit,
        ),
        realtimeClientOptions: const RealtimeClientOptions(
          logLevel: RealtimeLogLevel.info,
        ),
        debug: false,
      );

      _initialized = true;
      _initializationError = null;
      _logger.i('✅ Supabase initialized successfully');
    } catch (e, stackTrace) {
      _initializationError = e.toString();
      _logger.e('❌ Failed to initialize Supabase: $e');
      _logger.e('Stack trace: $stackTrace');
      _initialized = false;
      // 不抛出异常，允许应用继续运行（但 Supabase 功能将不可用）
    }
  }

  /// 检查 Supabase 连接
  static Future<bool> checkConnection() async {
    if (!_initialized) {
      _logger.w('Supabase not initialized, cannot check connection');
      return false;
    }

    try {
      // 尝试一个简单的查询来检查连接
      await client.from('places').select('id').limit(1).maybeSingle();
      return true;
    } catch (e) {
      _logger.w('Supabase connection check failed: $e');
      return false;
    }
  }

  /// 获取 Supabase 客户端
  static SupabaseClient get client => Supabase.instance.client;

  /// 获取认证客户端
  static GoTrueClient get auth => client.auth;

  /// 当前用户
  static User? get currentUser => auth.currentUser;

  /// 是否已登录
  static bool get isAuthenticated => currentUser != null;
}
