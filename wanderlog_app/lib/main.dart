import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/core/utils/app_router.dart';
import 'package:wanderlog/core/network/dio_client.dart';
import 'package:wanderlog/core/storage/storage_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Load environment variables
  await dotenv.load(fileName: '.env');
  
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

