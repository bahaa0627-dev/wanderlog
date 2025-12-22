import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/core/utils/app_router.dart';
import 'package:wanderlog/core/network/dio_client.dart';
import 'package:wanderlog/core/storage/storage_service.dart';
import 'package:wanderlog/core/supabase/supabase_config.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Load environment variables (ignore if file doesn't exist)
  try {
    await dotenv.load(fileName: '.env');
  } catch (e) {
    // .env file doesn't exist, use defaults from AppConstants
    print('Warning: .env file not found, using default values');
  }
  
  // Init Supabase
  await SupabaseConfig.initialize();
  
  // Init services
  await StorageService.instance.init();
  DioClient.instance.init();
  
  runApp(
    const ProviderScope(
      child: WanderlogApp(),
    ),
  );
}

class WanderlogApp extends ConsumerWidget {
  const WanderlogApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => MaterialApp.router(
      title: 'WanderLog',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.themeData,
      routerConfig: AppRouter.createRouter(ref),
    );
}

