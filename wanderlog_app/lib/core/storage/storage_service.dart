import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class StorageService {
  StorageService._();

  static final StorageService instance = StorageService._();

  final FlutterSecureStorage _secureStorage = const FlutterSecureStorage();
  SharedPreferences? _prefs;

  Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
  }

  // Secure Storage (for sensitive data like tokens)
  Future<void> setSecure(String key, String value) async {
    try {
      // 先删除旧值，避免 keychain 冲突
      await _secureStorage.delete(key: key);
      await _secureStorage.write(key: key, value: value);
    } catch (e) {
      // 如果删除后写入仍然失败（-25299 = errSecDuplicateItem），
      // 尝试用 options 强制覆盖
      if (e.toString().contains('-25299') ||
          e.toString().contains('already exists')) {
        try {
          // 删除所有该 key 的条目再重试
          await _secureStorage.deleteAll();
          await _secureStorage.write(key: key, value: value);
        } catch (retryError) {
          // 忽略重试错误，token 可能仍然可用
          print(
              '⚠️ [StorageService] Failed to write secure key $key: $retryError');
        }
      } else {
        print('⚠️ [StorageService] Failed to write secure key $key: $e');
      }
    }
  }

  Future<String?> getSecure(String key) async =>
      await _secureStorage.read(key: key);

  Future<void> deleteSecure(String key) async {
    await _secureStorage.delete(key: key);
  }

  Future<void> clearSecure() async {
    await _secureStorage.deleteAll();
  }

  // SharedPreferences (for non-sensitive data)
  Future<void> setString(String key, String value) async {
    await _prefs?.setString(key, value);
  }

  String? getString(String key) => _prefs?.getString(key);

  Future<void> setBool(String key, bool value) async {
    await _prefs?.setBool(key, value);
  }

  bool? getBool(String key) => _prefs?.getBool(key);

  Future<void> setInt(String key, int value) async {
    await _prefs?.setInt(key, value);
  }

  int? getInt(String key) => _prefs?.getInt(key);

  Future<void> remove(String key) async {
    await _prefs?.remove(key);
  }

  Future<void> clear() async {
    await _prefs?.clear();
  }
}
