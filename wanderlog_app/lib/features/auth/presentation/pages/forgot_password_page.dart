import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:wanderlog/core/utils/auth_error_messages.dart';
import 'package:wanderlog/core/utils/validators.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';

class ForgotPasswordPage extends ConsumerStatefulWidget {
  const ForgotPasswordPage({super.key});

  @override
  ConsumerState<ForgotPasswordPage> createState() => _ForgotPasswordPageState();
}

class _ForgotPasswordPageState extends ConsumerState<ForgotPasswordPage> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  bool _isLoading = false;
  
  // Task 3.1: Email sent state
  bool _emailSent = false;
  
  // Task 3.2: Resend countdown state
  int _resendCountdown = 0;
  Timer? _countdownTimer;
  
  // Countdown duration in seconds
  static const int _countdownDuration = 60;

  @override
  void dispose() {
    _emailController.dispose();
    _countdownTimer?.cancel();
    super.dispose();
  }

  // Task 3.2: Start the resend countdown timer
  void _startResendCountdown() {
    setState(() {
      _resendCountdown = _countdownDuration;
    });
    
    _countdownTimer?.cancel();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_resendCountdown > 0) {
        setState(() {
          _resendCountdown--;
        });
      } else {
        timer.cancel();
      }
    });
  }

  // Task 3.2: Resend email method
  Future<void> _resendEmail() async {
    if (_resendCountdown > 0) return;
    
    setState(() => _isLoading = true);

    try {
      await ref
          .read(authProvider.notifier)
          .forgotPassword(_emailController.text.trim());

      if (mounted) {
        CustomToast.showSuccess(
          context,
          'Password reset link sent again',
        );
        _startResendCountdown();
      }
    } catch (e) {
      if (mounted) {
        // Task 3.3: Use AuthErrorMessages for error handling
        final errorMessage = AuthErrorMessages.fromSupabaseError(e);
        CustomToast.showError(context, errorMessage);
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  // Check if error indicates email not found
  bool _isEmailNotFoundError(dynamic error) {
    final errorString = error.toString().toLowerCase();
    return errorString.contains('email not found') ||
        errorString.contains('user not found') ||
        errorString.contains("didn't sign up") ||
        errorString.contains('not registered') ||
        errorString.contains('does not exist');
  }

  // Show dialog for unregistered email
  void _showEmailNotFoundDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Email Not Registered'),
        content: const Text(
          'This email hasn\'t been registered yet. Would you like to create a new account?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(context).pop();
              context.go('/register');
            },
            child: const Text('Sign Up'),
          ),
        ],
      ),
    );
  }

  Future<void> _onSubmit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    try {
      await ref
          .read(authProvider.notifier)
          .forgotPassword(_emailController.text.trim());

      if (mounted) {
        // Task 3.1: Set email sent state and show success UI
        setState(() {
          _emailSent = true;
        });
        _startResendCountdown();
        
        CustomToast.showSuccess(
          context,
          'Password reset link sent to your email',
        );
      }
    } catch (e) {
      if (mounted) {
        // Check if email is not registered
        if (_isEmailNotFoundError(e)) {
          _showEmailNotFoundDialog();
        } else {
          // Task 3.3: Use AuthErrorMessages for error handling
          final errorMessage = AuthErrorMessages.fromSupabaseError(e);
          CustomToast.showError(context, errorMessage);
        }
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.go('/login'),
          ),
          title: const Text('Forgot Password'),
        ),
        body: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              // Task 3.1: Show different view based on email sent state
              child: _emailSent ? _buildSuccessView() : _buildFormView(),
            ),
          ),
        ),
      );

  // Get email provider URL based on email domain
  String? _getEmailProviderUrl(String email) {
    final domain = email.split('@').last.toLowerCase();
    final providerUrls = {
      'gmail.com': 'https://mail.google.com',
      'googlemail.com': 'https://mail.google.com',
      'outlook.com': 'https://outlook.live.com',
      'hotmail.com': 'https://outlook.live.com',
      'live.com': 'https://outlook.live.com',
      'msn.com': 'https://outlook.live.com',
      'yahoo.com': 'https://mail.yahoo.com',
      'yahoo.co.jp': 'https://mail.yahoo.co.jp',
      'icloud.com': 'https://www.icloud.com/mail',
      'me.com': 'https://www.icloud.com/mail',
      'mac.com': 'https://www.icloud.com/mail',
      'qq.com': 'https://mail.qq.com',
      '163.com': 'https://mail.163.com',
      '126.com': 'https://mail.126.com',
      'sina.com': 'https://mail.sina.com.cn',
      'protonmail.com': 'https://mail.protonmail.com',
      'proton.me': 'https://mail.proton.me',
      'zoho.com': 'https://mail.zoho.com',
    };
    return providerUrls[domain];
  }

  // Open email provider
  Future<void> _openEmailProvider() async {
    final email = _emailController.text.trim();
    final url = _getEmailProviderUrl(email);
    
    if (url != null) {
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    }
  }

  // Task 3.1: Success view after email is sent
  Widget _buildSuccessView() => Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Icon(
            Icons.mark_email_read,
            size: 80,
            color: Colors.green,
          ),
          const SizedBox(height: 32),
          const Text(
            'Check Your Email',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'We\'ve sent a password reset link to:',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 16,
              color: Colors.grey[600],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _emailController.text.trim(),
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'Click the link in the email to reset your password. '
            'If you don\'t see the email, check your spam folder.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey[600],
            ),
          ),
          const SizedBox(height: 48),
          // Main button: Open the Email
          _buildOpenEmailButton(),
          const SizedBox(height: 16),
          // Resend button: Yellow text button
          _buildResendButton(),
        ],
      );

  // Main button: Open the Email
  Widget _buildOpenEmailButton() {
    final email = _emailController.text.trim();
    final hasProvider = _getEmailProviderUrl(email) != null;
    
    return SizedBox(
      height: 48,
      child: ElevatedButton(
        onPressed: hasProvider ? _openEmailProvider : null,
        child: const Text('Open the Email'),
      ),
    );
  }

  // Task 3.2: Resend button with countdown UI - Yellow text button
  Widget _buildResendButton() {
    final bool canResend = _resendCountdown == 0 && !_isLoading;
    
    return TextButton(
      onPressed: canResend ? _resendEmail : null,
      child: _isLoading
          ? const SizedBox(
              height: 20,
              width: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
              ),
            )
          : Text(
              _resendCountdown > 0
                  ? 'Resend in ${_resendCountdown}s'
                  : 'Resend the Email',
              style: TextStyle(
                color: canResend 
                    ? const Color(0xFFD4A017) // Yellow/gold color
                    : Colors.grey,
              ),
            ),
    );
  }

  Widget _buildFormView() => Form(
        key: _formKey,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(
              Icons.lock_reset,
              size: 80,
              color: Colors.blue,
            ),
            const SizedBox(height: 32),
            const Text(
              'Reset Password',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Enter your email address and we\'ll send you a link to reset your password.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 16,
                color: Colors.grey[600],
              ),
            ),
            const SizedBox(height: 48),
            TextFormField(
              controller: _emailController,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(
                labelText: 'Email',
                hintText: 'your@email.com',
                prefixIcon: Icon(Icons.email_outlined),
                border: OutlineInputBorder(),
              ),
              // Task 3.3: Use Validators.validateEmail() instead of inline validation
              validator: Validators.validateEmail,
            ),
            const SizedBox(height: 24),
            SizedBox(
              height: 48,
              child: ElevatedButton(
                onPressed: _isLoading ? null : _onSubmit,
                child: _isLoading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Send Reset Link'),
              ),
            ),
          ],
        ),
      );
}
