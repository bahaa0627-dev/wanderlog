import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/core/storage/storage_service.dart';

// 支持的语言
enum AppLanguage {
  english('en', 'English'),
  chinese('zh', '中文');

  const AppLanguage(this.code, this.displayName);
  final String code;
  final String displayName;
}

// 语言状态管理
class LocaleNotifier extends StateNotifier<Locale> {
  LocaleNotifier() : super(const Locale('en')) {
    _loadSavedLocale();
  }

  static const String _storageKey = 'app_language';

  Future<void> _loadSavedLocale() async {
    final savedCode = StorageService.instance.getString(_storageKey);
    if (savedCode != null) {
      state = Locale(savedCode);
    }
  }

  Future<void> setLocale(AppLanguage language) async {
    state = Locale(language.code);
    await StorageService.instance.setString(_storageKey, language.code);
  }

  AppLanguage get currentLanguage =>
      state.languageCode == 'zh' ? AppLanguage.chinese : AppLanguage.english;

  bool get isEnglish => state.languageCode == 'en';
  bool get isChinese => state.languageCode == 'zh';
}

final localeProvider = StateNotifierProvider<LocaleNotifier, Locale>(
    (ref) => LocaleNotifier(),
);
