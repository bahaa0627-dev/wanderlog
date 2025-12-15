import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:google_sign_in/google_sign_in.dart';

class GoogleAuthService {
  GoogleAuthService._();
  static final GoogleAuthService instance = GoogleAuthService._();

  bool _initialized = false;

  Future<void> _ensureInitialized({String? clientId}) async {
    if (_initialized) return;
    // google_sign_in 7.x requires explicit initialization once per app run.
    await GoogleSignIn.instance.initialize(clientId: clientId);
    _initialized = true;
  }

  Future<GoogleSignInAccount?> signIn(BuildContext context) async {
    // 检查是否配置了 Google Client ID
    final clientId = dotenv.env['GOOGLE_CLIENT_ID'];
    if (kIsWeb && (clientId?.isEmpty ?? true)) {
      _showMessage(context, '缺少 GOOGLE_CLIENT_ID 配置');
      return null;
    }

    // iOS/Android 原生平台需要在 Info.plist/build.gradle 中配置
    if (!kIsWeb && (clientId == null || clientId.isEmpty || clientId == 'placeholder')) {
      _showMessage(
        context,
        'Google 登录暂未配置\n请参考 GOOGLE_LOGIN_QUICK_START.md',
      );
      return null;
    }

    try {
      await _ensureInitialized(clientId: kIsWeb ? clientId : null);

      // 先尝试静默登录（如果用户之前登录过）
      GoogleSignInAccount? account;
      final Future<GoogleSignInAccount?>? lightweightAuth =
          GoogleSignIn.instance.attemptLightweightAuthentication();
      if (lightweightAuth != null) {
        account = await lightweightAuth.timeout(
          const Duration(seconds: 5),
          onTimeout: () => null,
        );
      }

      // 如果静默登录失败，则显示登录界面
      if (account == null) {
        account = await GoogleSignIn.instance.authenticate(
          scopeHint: const ['email', 'profile'],
        ).timeout(
          const Duration(seconds: 30),
        );
      }

      // 确保有账户后才请求授权范围
      await account.authorizationClient.authorizationForScopes(
        const ['email', 'profile'],
      );
      return account;
    } on TimeoutException catch (e) {
      debugPrint('Google Sign-In Timeout: $e');
      _showMessage(
        context,
        'Google 登录超时\n'
        '可能是网络问题，建议：\n'
        '1. 检查系统代理设置\n'
        '2. 重启模拟器\n'
        '3. 或使用真机测试',
      );
      return null;
    } on GoogleSignInException catch (e) {
      debugPrint('Google Sign-In Error: $e');

      String errorMessage = 'Google 登录失败';
      switch (e.code) {
        case GoogleSignInExceptionCode.canceled:
          errorMessage = 'Google 登录已取消';
          break;
        case GoogleSignInExceptionCode.providerConfigurationError:
          errorMessage = 'Google 登录失败：无法连接到 Google 服务\n\n'
              '可能的解决方案：\n'
              '1. 确保系统代理已启用\n'
              '   （系统设置 > 网络 > 代理）\n'
              '2. 完全关闭并重启模拟器\n'
              '3. 或者使用真机进行测试';
          break;
        case GoogleSignInExceptionCode.clientConfigurationError:
          errorMessage = 'Google 登录配置错误\n请检查 OAuth 配置';
          break;
        case GoogleSignInExceptionCode.uiUnavailable:
        case GoogleSignInExceptionCode.interrupted:
          errorMessage = 'Google 登录失败：当前无法打开 Google 登录界面\n'
              '请稍后重试或重启模拟器';
          break;
        default:
          // 保持默认消息
          break;
      }

        if (errorMessage == 'Google 登录失败' &&
          (e.description?.toLowerCase().contains('connection') ?? false)) {
        errorMessage = 'Google 登录失败：网络连接问题\n\n'
            '可能的解决方案：\n'
            '1. 确保系统代理已启用\n'
            '   （系统设置 > 网络 > 代理）\n'
            '2. 完全关闭并重启模拟器\n'
            '3. 或者使用真机进行测试';
      }

      _showMessage(context, errorMessage);
      return null;
    } on Exception catch (e) {
      // 捕获所有异常，防止崩溃
      debugPrint('Google Sign-In Error: $e');
      
      // 提供更详细的错误信息
      String errorMessage = 'Google 登录失败';
      if (e.toString().contains('connection') || e.toString().contains('network')) {
        errorMessage = 'Google 登录失败：网络连接问题\n\n'
            '可能的解决方案：\n'
            '1. 确保系统代理已启用\n'
            '   （系统设置 > 网络 > 代理）\n'
            '2. 完全关闭并重启模拟器\n'
            '3. 或者使用真机进行测试';
      } else if (e.toString().contains('DEVELOPER_ERROR')) {
        errorMessage = 'Google 登录配置错误\n请检查 OAuth 配置';
      }
      
      _showMessage(context, errorMessage);
      return null;
    }
  }

  Future<void> signOut() async {
    if (!_initialized) {
      return;
    }
    await GoogleSignIn.instance.signOut();
  }

  void _showMessage(BuildContext context, String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }
}




