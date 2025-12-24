import 'package:flutter/material.dart';

class AppConstants {
  AppConstants._();

  // App Info
  static const String appName = 'VAGO';
  static const String appVersion = '1.0.0';
  
  // Colors
  static const Color primaryColor = Color(0xFF2196F3);
  static const Color secondaryColor = Color(0xFF03A9F4);
  static const Color accentColor = Color(0xFFFF9800);
  static const Color errorColor = Color(0xFFE53935);
  static const Color successColor = Color(0xFF4CAF50);
  
  // API Endpoints (will be loaded from .env)
  // 注意：iOS 模拟器需要使用 127.0.0.1 而不是 localhost
  static String get apiBaseUrl => const String.fromEnvironment(
        'API_BASE_URL',
        defaultValue: 'http://127.0.0.1:3000/api',
      );
  
  // Mapbox
  static String get mapboxAccessToken => const String.fromEnvironment(
        'MAPBOX_ACCESS_TOKEN',
        defaultValue: '',
      );
  
  // Google APIs
  static String get googleClientId => const String.fromEnvironment(
        'GOOGLE_CLIENT_ID',
        defaultValue: '',
      );
  
  // Stripe
  static String get stripePublishableKey => const String.fromEnvironment(
        'STRIPE_PUBLISHABLE_KEY',
        defaultValue: '',
      );
  
  // Timeouts
  static const Duration connectionTimeout = Duration(seconds: 30);
  static const Duration receiveTimeout = Duration(seconds: 30);
  
  // Pagination
  static const int defaultPageSize = 20;
  static const int maxPageSize = 100;
}







