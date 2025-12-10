import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import 'core/constants/app_constants.dart';
import 'core/utils/app_router.dart';
import 'core/network/dio_client.dart';
import 'core/storage/storage_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Load environment variables
  await dotenv.load(fileName: '.env.dev');
  
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
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: AppConstants.appName,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppConstants.primaryColor,
        ),
        useMaterial3: true,
      ),
      routerConfig: AppRouter.createRouter(ref),
    );
  }
}

