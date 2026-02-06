import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:wanderlog/core/supabase/supabase_config.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';

class VerifyEmailPage extends ConsumerStatefulWidget {
  const VerifyEmailPage({super.key, this.email});

  final String? email;

  @override
  ConsumerState<VerifyEmailPage> createState() => _VerifyEmailPageState();
}

class _VerifyEmailPageState extends ConsumerState<VerifyEmailPage> {
  bool _canResend = true;
  int _resendCountdown = 0;
  Timer? _timer;
  Timer? _checkTimer;

  String get _email => widget.email ?? SupabaseConfig.currentUser?.email ?? '';

  @override
  void initState() {
    super.initState();
    _startCheckingVerification();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _checkTimer?.cancel();
    super.dispose();
  }

  void _startCheckingVerification() {
    _checkTimer = Timer.periodic(const Duration(seconds: 3), (_) async {
      await _checkEmailVerified();
    });
  }

  Future<void> _checkEmailVerified() async {
    try {
      await SupabaseConfig.auth.refreshSession();
      final user = SupabaseConfig.currentUser;

      if (user != null && user.emailConfirmedAt != null) {
        _checkTimer?.cancel();
        await ref.read(authProvider.notifier).refreshAuthState();
        if (mounted) {
          CustomToast.showSuccess(context, '注册成功，欢迎使用 VAGO！');
          context.go('/home');
        }
      }
    } catch (e) {
      // 忽略错误，继续检查
    }
  }

  Future<void> _onResend() async {
    if (!_canResend) return;

    if (_email.isEmpty) {
      _showError('Email not found');
      return;
    }

    try {
      await SupabaseConfig.auth.resend(
        type: OtpType.signup,
        email: _email,
      );

      if (mounted) {
        _showSuccess('Verification email sent');
        _startResendCountdown();
      }
    } catch (e) {
      if (mounted) {
        _showError(e.toString());
      }
    }
  }

  void _startResendCountdown() {
    setState(() {
      _canResend = false;
      _resendCountdown = 60;
    });

    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      setState(() {
        _resendCountdown--;
        if (_resendCountdown == 0) {
          _canResend = true;
          timer.cancel();
        }
      });
    });
  }

  Future<void> _openEmailInBrowser() async {
    String mailUrl;

    // 根据邮箱域名打开对应的网页版邮箱
    if (_email.contains('@gmail.com')) {
      mailUrl = 'https://mail.google.com';
    } else if (_email.contains('@outlook.com') ||
        _email.contains('@hotmail.com') ||
        _email.contains('@live.com')) {
      mailUrl = 'https://outlook.live.com';
    } else if (_email.contains('@yahoo.com')) {
      mailUrl = 'https://mail.yahoo.com';
    } else if (_email.contains('@icloud.com') || _email.contains('@me.com')) {
      mailUrl = 'https://www.icloud.com/mail';
    } else if (_email.contains('@qq.com')) {
      mailUrl = 'https://mail.qq.com';
    } else if (_email.contains('@163.com')) {
      mailUrl = 'https://mail.163.com';
    } else if (_email.contains('@sina.com')) {
      mailUrl = 'https://mail.sina.com.cn';
    } else if (_email.contains('@126.com')) {
      mailUrl = 'https://mail.126.com';
    } else {
      mailUrl = 'https://mail.google.com';
    }

    final uri = Uri.parse(mailUrl);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      if (mounted) {
        _showError('Could not open browser');
      }
    }
  }

  void _showError(String message) {
    CustomToast.showError(context, message);
  }

  void _showSuccess(String message) {
    CustomToast.showSuccess(context, message);
  }

  // Neo-brutalism 黄色
  static const Color _primaryYellow = Color(0xFFFFE500);

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text(
            'Verify Email',
            style: TextStyle(
              fontFamily: 'ReemKufi',
              fontWeight: FontWeight.bold,
            ),
          ),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.go('/login'),
          ),
        ),
        body: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // 邮件图标
                  Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      color: _primaryYellow,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.black, width: 2),
                      boxShadow: const [
                        BoxShadow(
                          color: Colors.black,
                          offset: Offset(3, 3),
                          blurRadius: 0,
                        ),
                      ],
                    ),
                    child: const Icon(
                      Icons.mark_email_unread_outlined,
                      size: 40,
                      color: Colors.black,
                    ),
                  ),
                  const SizedBox(height: 32),
                  const Text(
                    'Check Your Email',
                    style: TextStyle(
                      fontFamily: 'ReemKufi',
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _email,
                    style: const TextStyle(
                      fontFamily: 'ReemKufi',
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Click the link in the email to verify your account.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontFamily: 'ReemKufi',
                      fontSize: 14,
                      color: Colors.grey[600],
                    ),
                  ),
                  const SizedBox(height: 32),

                  // Neo-brutalism 风格按钮
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: Container(
                      decoration: BoxDecoration(
                        color: _primaryYellow,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.black, width: 2),
                        boxShadow: const [
                          BoxShadow(
                            color: Colors.black,
                            offset: Offset(4, 4),
                            blurRadius: 0,
                          ),
                        ],
                      ),
                      child: Material(
                        color: Colors.transparent,
                        child: InkWell(
                          onTap: _openEmailInBrowser,
                          borderRadius: BorderRadius.circular(10),
                          child: const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.open_in_new, color: Colors.black),
                              SizedBox(width: 8),
                              Text(
                                'Open Email',
                                style: TextStyle(
                                  fontFamily: 'ReemKufi',
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.black,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(height: 24),

                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        "Didn't receive the email? ",
                        style: TextStyle(
                          fontFamily: 'ReemKufi',
                          color: Colors.grey[600],
                        ),
                      ),
                      TextButton(
                        onPressed: _canResend ? _onResend : null,
                        child: Text(
                          _canResend
                              ? 'Resend'
                              : 'Resend in ${_resendCountdown}s',
                          style: TextStyle(
                            fontFamily: 'ReemKufi',
                            fontWeight: FontWeight.bold,
                            color: _canResend ? _primaryYellow : Colors.grey,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      );
}
