import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:google_sign_in/google_sign_in.dart';

class GoogleAuthService {
  GoogleAuthService._();
  static final GoogleAuthService instance = GoogleAuthService._();

  GoogleSignIn? _googleSignIn;

  GoogleSignIn _client() {
    if (_googleSignIn != null) return _googleSignIn!;

    final clientId = dotenv.env['GOOGLE_CLIENT_ID'];
    // For web we must provide clientId; native will use platform config.
    _googleSignIn = GoogleSignIn(
      clientId: kIsWeb ? clientId : null,
      scopes: const [
        'email',
        'profile',
      ],
    );
    return _googleSignIn!;
  }

  Future<GoogleSignInAccount?> signIn(BuildContext context) async {
    if (kIsWeb && (dotenv.env['GOOGLE_CLIENT_ID']?.isEmpty ?? true)) {
      _showMessage(context, 'Missing GOOGLE_CLIENT_ID in .env.dev');
      return null;
    }
    try {
      final account = await _client().signIn();
      if (account == null) {
        _showMessage(context, 'Google sign-in cancelled');
      }
      return account;
    } catch (e) {
      _showMessage(context, 'Google sign-in failed: $e');
      return null;
    }
  }

  Future<void> signOut() async {
    await _client().signOut();
  }

  void _showMessage(BuildContext context, String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }
}



