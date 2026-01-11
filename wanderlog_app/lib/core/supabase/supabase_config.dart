import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Supabase 配置和初始化
class SupabaseConfig {
  static String get url => dotenv.env['SUPABASE_URL'] ?? '';
  static String get anonKey => dotenv.env['SUPABASE_ANON_KEY'] ?? '';
  static String get imagesBaseUrl =>
      dotenv.env['IMAGES_BASE_URL'] ?? 'https://images.wanderlog.app';

  /// 深度链接 scheme
  static const String deepLinkScheme = 'io.supabase.wanderlog';
  static const String deepLinkHost = 'login-callback';
  static String get redirectUrl => '$deepLinkScheme://$deepLinkHost';

  /// 初始化 Supabase
  static Future<void> initialize() async {
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
