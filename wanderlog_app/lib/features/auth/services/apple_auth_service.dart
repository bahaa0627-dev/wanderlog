import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

/// Apple Sign-In result containing credentials needed for Supabase auth
class AppleSignInResult {
  final String identityToken;
  final String rawNonce;
  final String? email;
  final String? givenName;
  final String? familyName;

  AppleSignInResult({
    required this.identityToken,
    required this.rawNonce,
    this.email,
    this.givenName,
    this.familyName,
  });
}

class AppleAuthService {
  AppleAuthService._();
  static final AppleAuthService instance = AppleAuthService._();

  /// Generates a cryptographically secure random nonce
  String _generateNonce([int length = 32]) {
    const charset =
        '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
    final random = Random.secure();
    return List.generate(length, (_) => charset[random.nextInt(charset.length)])
        .join();
  }

  /// Returns the SHA256 hash of [input] in hex notation
  String _sha256ofString(String input) {
    final bytes = utf8.encode(input);
    final digest = sha256.convert(bytes);
    return digest.toString();
  }

  /// Signs in with Apple and returns credentials for Supabase
  Future<AppleSignInResult?> signIn(BuildContext context) async {
    // Apple Sign-In is only available on iOS/macOS
    if (!await SignInWithApple.isAvailable()) {
      _showMessage(context, 'Apple 登录在此设备上不可用');
      return null;
    }

    try {
      // Generate a secure nonce
      final rawNonce = _generateNonce();
      final hashedNonce = _sha256ofString(rawNonce);

      debugPrint('🍎 [AppleLogin] Starting Apple Sign-In...');

      // Request Apple ID credentials
      final credential = await SignInWithApple.getAppleIDCredential(
        scopes: [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
        nonce: hashedNonce,
      );

      debugPrint('🍎 [AppleLogin] Got Apple credential');
      debugPrint('🍎 [AppleLogin] Email: ${credential.email}');
      debugPrint(
          '🍎 [AppleLogin] Name: ${credential.givenName} ${credential.familyName}');

      final identityToken = credential.identityToken;
      if (identityToken == null) {
        debugPrint('❌ [AppleLogin] identityToken is null!');
        _showMessage(context, 'Apple 登录失败：无法获取身份令牌');
        return null;
      }

      debugPrint(
          '🍎 [AppleLogin] Got identityToken: ${identityToken.length} chars');

      return AppleSignInResult(
        identityToken: identityToken,
        rawNonce: rawNonce,
        email: credential.email,
        givenName: credential.givenName,
        familyName: credential.familyName,
      );
    } on SignInWithAppleAuthorizationException catch (e) {
      debugPrint('❌ [AppleLogin] AuthorizationException: ${e.code} - ${e.message}');

      String errorMessage = 'Apple 登录失败';
      switch (e.code) {
        case AuthorizationErrorCode.canceled:
          // User canceled - don't show error
          debugPrint('🍎 [AppleLogin] User canceled');
          return null;
        case AuthorizationErrorCode.failed:
          errorMessage = 'Apple 登录失败，请稍后重试';
        case AuthorizationErrorCode.invalidResponse:
          errorMessage = 'Apple 登录响应无效';
        case AuthorizationErrorCode.notHandled:
          errorMessage = 'Apple 登录请求未处理';
        case AuthorizationErrorCode.notInteractive:
          errorMessage = 'Apple 登录需要用户交互';
        case AuthorizationErrorCode.unknown:
          errorMessage = 'Apple 登录失败：${e.message}';
      }

      _showMessage(context, errorMessage);
      return null;
    } catch (e, stackTrace) {
      debugPrint('❌ [AppleLogin] Unexpected error: $e');
      debugPrint('❌ [AppleLogin] Stack trace: $stackTrace');
      _showMessage(context, 'Apple 登录失败：${e.toString()}');
      return null;
    }
  }

  void _showMessage(BuildContext context, String message) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}
