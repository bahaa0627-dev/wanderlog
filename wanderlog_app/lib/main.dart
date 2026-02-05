import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:app_links/app_links.dart';
import 'package:go_router/go_router.dart';

import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/core/utils/app_router.dart';
import 'package:wanderlog/core/network/dio_client.dart';
import 'package:wanderlog/core/storage/storage_service.dart';
import 'package:wanderlog/core/supabase/supabase_config.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Load environment variables based on build mode
  // Release mode uses .env.production, Debug mode uses .env
  final envFileName = kReleaseMode ? '.env.production' : '.env';
  try {
    await dotenv.load(fileName: envFileName);
    print('✅ Loaded environment file: $envFileName');
  } catch (e) {
    // Fallback to .env if .env.production doesn't exist
    if (kReleaseMode) {
      try {
        await dotenv.load(fileName: '.env');
        print('⚠️ Warning: .env.production not found, falling back to .env');
      } catch (_) {
        print('Warning: No .env file found, using default values');
      }
    } else {
      print('Warning: .env file not found, using default values');
    }
  }

  // Init Supabase (non-blocking - app can continue if Supabase fails)
  try {
    await SupabaseConfig.initialize();
    if (!SupabaseConfig.isInitialized) {
      print('⚠️ Warning: Supabase initialization failed. '
          'Some features may be unavailable. '
          'Error: ${SupabaseConfig.initializationError}');
    }
  } catch (e) {
    print('⚠️ Warning: Supabase initialization error: $e');
  }

  // Init services
  await StorageService.instance.init();
  DioClient.instance.init();

  runApp(
    const ProviderScope(
      child: WanderlogApp(),
    ),
  );
}

class WanderlogApp extends ConsumerStatefulWidget {
  const WanderlogApp({super.key});

  @override
  ConsumerState<WanderlogApp> createState() => _WanderlogAppState();
}

class _WanderlogAppState extends ConsumerState<WanderlogApp> {
  late AppLinks _appLinks;
  late final StreamSubscription<AuthState> _authSub;
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();
    _router = AppRouter.createRouter(ref);
    _initDeepLinks();
    _listenSupabaseAuth();
  }

  void _listenSupabaseAuth() {
    // Only listen to auth changes if Supabase is initialized
    if (!SupabaseConfig.isInitialized) {
      debugPrint('⚠️ Supabase not initialized, skipping auth listener');
      return;
    }

    _authSub = SupabaseConfig.auth.onAuthStateChange.listen((data) {
      if (!mounted) return;
      if (data.event == AuthChangeEvent.passwordRecovery) {
        // User opened the Supabase recovery link.
        _router.go('/reset-password');
      }
    });
  }

  Future<void> _initDeepLinks() async {
    _appLinks = AppLinks();

    // 处理 App 启动时的深度链接
    try {
      final initialUri = await _appLinks.getInitialLink();
      if (initialUri != null) {
        _handleDeepLink(initialUri);
      }
    } catch (e) {
      debugPrint('Error getting initial deep link: $e');
    }

    // 监听后续的深度链接
    _appLinks.uriLinkStream.listen(
      (uri) {
        _handleDeepLink(uri);
      },
      onError: (Object e) {
        debugPrint('Error handling deep link: $e');
      },
    );
  }

  void _handleDeepLink(Uri uri) {
    debugPrint('Deep link received: $uri');
    // Supabase Flutter SDK 会自动处理 auth 回调
    // 这里只需要确保 App 不会崩溃
  }

  @override
  void dispose() {
    if (SupabaseConfig.isInitialized) {
      _authSub.cancel();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp.router(
        title: 'VAGO',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.themeData,
        routerConfig: _router,
      );
}
