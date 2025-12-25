import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:wanderlog/core/supabase/supabase_config.dart';
import 'package:wanderlog/features/auth/services/google_auth_service.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isGoogleLoading = false;
  bool _isLoading = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _onLogin() async {
    if (_formKey.currentState?.validate() ?? false) {
      setState(() => _isLoading = true);
      try {
        // 直接使用 Supabase Auth 登录
        final response = await SupabaseConfig.auth.signInWithPassword(
          email: _emailController.text.trim(),
          password: _passwordController.text,
        );
        
        if (response.user != null) {
          // 刷新 authProvider 状态
          await ref.read(authProvider.notifier).refreshAuthState();
          
          if (mounted) {
            CustomToast.showSuccess(context, 'Login successful');
            if (Navigator.of(context).canPop()) {
              Navigator.of(context).pop(true);
            } else {
              context.go('/home');
            }
          }
        }
      } on AuthException catch (e) {
        if (mounted) {
          String message = 'Login failed';
          if (e.message.contains('Invalid login credentials')) {
            message = 'Invalid email or password';
          } else if (e.message.contains('Email not confirmed')) {
            message = 'Please verify your email first';
          } else {
            message = e.message;
          }
          CustomToast.showError(context, message);
        }
      } catch (e) {
        if (mounted) {
          CustomToast.showError(context, e.toString());
        }
      } finally {
        if (mounted) {
          setState(() => _isLoading = false);
        }
      }
    }
  }

  Future<void> _onGoogleLogin() async {
    if (_isGoogleLoading) return; // 防止重复点击
    
    setState(() {
      _isGoogleLoading = true;
    });

    try {
      final googleUser = await GoogleAuthService.instance.signIn(context);
      if (googleUser == null) {
        // 用户取消登录或配置未完成
        setState(() {
          _isGoogleLoading = false;
        });
        return;
      }

      // 在 google_sign_in 7.x 中，authentication 是一个 getter
      final googleAuth = googleUser.authentication;
      final idToken = googleAuth.idToken;
      
      // 获取 accessToken 需要通过 authorizationClient
      final authorization = await googleUser.authorizationClient.authorizationForScopes(
        const ['email', 'profile'],
      );
      final accessToken = authorization?.accessToken;

      if (idToken == null) {
        setState(() {
          _isGoogleLoading = false;
        });
        if (mounted) {
          CustomToast.showError(context, 'Google login failed: Unable to get ID Token');
        }
        return;
      }

      // 使用 Supabase Auth 进行 Google 登录
      final response = await SupabaseConfig.auth.signInWithIdToken(
        provider: OAuthProvider.google,
        idToken: idToken,
        accessToken: accessToken,
      );

      if (response.user != null) {
        // 刷新 authProvider 状态
        await ref.read(authProvider.notifier).refreshAuthState();
        
        // 登录成功
        setState(() {
          _isGoogleLoading = false;
        });
        
        if (mounted) {
          CustomToast.showSuccess(context, 'Google login successful');
          await Future<void>.delayed(const Duration(milliseconds: 300));
          if (mounted) {
            if (Navigator.of(context).canPop()) {
              Navigator.of(context).pop(true);
            } else {
              context.go('/home');
            }
          }
        }
      } else {
        setState(() {
          _isGoogleLoading = false;
        });
        if (mounted) {
          CustomToast.showError(context, 'Google login failed');
        }
      }
    } on AuthException catch (e) {
      setState(() {
        _isGoogleLoading = false;
      });
      debugPrint('Google Login Auth Error: $e');
      if (mounted) {
        CustomToast.showError(context, 'Google login failed: ${e.message}');
      }
    } catch (e) {
      // 捕获所有异常，防止应用崩溃
      setState(() {
        _isGoogleLoading = false;
      });
      debugPrint('Google Login Error: $e');
      if (mounted) {
        CustomToast.showError(context, 'Google login failed: ${e.toString()}');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            if (Navigator.of(context).canPop()) {
              Navigator.of(context).pop(false);
            } else {
              context.go('/home');
            }
          },
        ),
        title: const Text('Login'),
      ),
      backgroundColor: const Color(0xFFF7F7F7),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 16),
                const Text(
                  'VAGO',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Your own personalized flaneur guide',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 15, color: Colors.grey),
                ),
                const SizedBox(height: 32),
                Card(
                  elevation: 4,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        children: [
                          TextFormField(
                            controller: _emailController,
                            keyboardType: TextInputType.emailAddress,
                            decoration: const InputDecoration(
                              labelText: 'Email',
                              prefixIcon: Icon(Icons.email_outlined),
                            ),
                            validator: (value) {
                              if (value == null || value.isEmpty) {
                                return 'Email is required';
                              }
                              if (!value.contains('@')) {
                                return 'Please enter a valid email';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _passwordController,
                            obscureText: true,
                            decoration: const InputDecoration(
                              labelText: 'Password',
                              prefixIcon: Icon(Icons.lock_outline),
                            ),
                            validator: (value) {
                              if (value == null || value.isEmpty) {
                                return 'Password is required';
                              }
                              if (value.length < 6) {
                                return 'At least 6 characters';
                              }
                              return null;
                            },
                          ),
                          const SizedBox(height: 24),
                          SizedBox(
                            width: double.infinity,
                            child: FilledButton(
                              onPressed: _isLoading ? null : _onLogin,
                              child: _isLoading
                                  ? const SizedBox(
                                      height: 20,
                                      width: 20,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : const Text('Login'),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              TextButton(
                                onPressed: () => context.go('/register'),
                                child: const Text('Create account'),
                              ),
                              TextButton(
                                onPressed: () => context.go('/forgot-password'),
                                child: const Text('Forgot password?'),
                              ),
                            ],
                          ),
                          const Divider(height: 32),
                          SizedBox(
                            width: double.infinity,
                            child: OutlinedButton.icon(
                              icon: _isGoogleLoading
                                  ? const SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : const Icon(Icons.account_circle_outlined),
                              onPressed: _isGoogleLoading ? null : _onGoogleLogin,
                              label: Text(_isGoogleLoading ? 'Signing in...' : 'Continue with Google'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

