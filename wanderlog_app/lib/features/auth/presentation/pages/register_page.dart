import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:wanderlog/core/supabase/supabase_config.dart';
import 'package:wanderlog/core/providers/locale_provider.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';

class RegisterPage extends ConsumerStatefulWidget {
  const RegisterPage({super.key});

  @override
  ConsumerState<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends ConsumerState<RegisterPage> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _nameController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  bool _isLoading = false;

  // 获取用户选择的语言
  bool get _isChinese {
    final locale = ref.read(localeProvider);
    return locale.languageCode == 'zh';
  }

  /// 验证 name 字段
  /// 英文最多20个字符，中文最多10个字符
  String? _validateName(String? value) {
    if (value == null || value.isEmpty) {
      return _isChinese ? '请输入名字' : 'Name is required';
    }

    final trimmed = value.trim();
    if (trimmed.isEmpty) {
      return _isChinese ? '请输入名字' : 'Name is required';
    }

    // 计算中文字符数量
    int chineseCount = 0;
    int otherCount = 0;

    for (final char in trimmed.runes) {
      // 判断是否是中文字符（包括中日韩统一表意文字）
      if ((char >= 0x4E00 && char <= 0x9FFF) || // CJK Unified Ideographs
          (char >= 0x3400 &&
              char <= 0x4DBF) || // CJK Unified Ideographs Extension A
          (char >= 0x20000 &&
              char <= 0x2A6DF) || // CJK Unified Ideographs Extension B
          (char >= 0x2A700 &&
              char <= 0x2B73F) || // CJK Unified Ideographs Extension C
          (char >= 0x2B740 &&
              char <= 0x2B81F) || // CJK Unified Ideographs Extension D
          (char >= 0xF900 && char <= 0xFAFF) || // CJK Compatibility Ideographs
          (char >= 0x2F800 && char <= 0x2FA1F)) {
        // CJK Compatibility Ideographs Supplement
        chineseCount++;
      } else {
        otherCount++;
      }
    }

    // 如果全是中文，最多10个字符
    if (otherCount == 0 && chineseCount > 10) {
      return _isChinese ? '最多10个中文字符' : 'Max 10 Chinese chars';
    }

    // 如果全是非中文（英文/其他），最多20个字符
    if (chineseCount == 0 && otherCount > 20) {
      return _isChinese ? '最多20个英文字符' : 'Max 20 English chars';
    }

    // 如果是混合的，按加权计算（1个中文=2个英文字符）
    final weightedLength = chineseCount * 2 + otherCount;
    if (weightedLength > 20) {
      return _isChinese ? '名字太长' : 'Name is too long';
    }

    return null;
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _nameController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _onRegister() async {
    if (_formKey.currentState?.validate() ?? false) {
      setState(() => _isLoading = true);
      try {
        // 直接使用 Supabase Auth 注册
        debugPrint(
          'Registering with emailRedirectTo: ${SupabaseConfig.redirectUrl}',
        );
        final response = await SupabaseConfig.auth.signUp(
          email: _emailController.text.trim(),
          password: _passwordController.text,
          emailRedirectTo: SupabaseConfig.redirectUrl,
          data: {
            'name': _nameController.text.trim(),
          },
        );
        debugPrint('SignUp response: ${response.user?.email}');
        debugPrint('SignUp identities: ${response.user?.identities}');
        debugPrint(
          'SignUp identities length: ${response.user?.identities?.length}',
        );

        if (response.user != null) {
          // 检查用户是否已经存在（identities 为空表示用户已存在）
          final identities = response.user!.identities;
          if (identities == null || identities.isEmpty) {
            // 用户已存在
            debugPrint('User already exists - showing toast');
            if (mounted) {
              CustomToast.showError(
                context,
                _isChinese
                    ? '该邮箱已注册，请登录'
                    : 'Email already registered, please login',
              );
            }
          } else {
            // 新用户注册成功，跳转到验证邮箱页面
            debugPrint('New user - navigating to verify email');
            if (mounted) {
              context.go('/verify-email', extra: _emailController.text.trim());
            }
          }
        }
      } on AuthException catch (e) {
        if (mounted) {
          // 检查是否是用户已存在的错误
          if (e.message.contains('already registered') ||
              e.message.contains('User already registered') ||
              e.message.contains('already been registered')) {
            CustomToast.showError(
              context,
              _isChinese
                  ? '该邮箱已注册，请登录'
                  : 'Email already registered, please login',
            );
          } else if (e.message.contains('weak password') ||
              e.message.contains('Password should be')) {
            CustomToast.showError(
              context,
              _isChinese
                  ? '密码太弱，请使用至少6个字符'
                  : 'Password is too weak. Please use at least 6 characters.',
            );
          } else {
            CustomToast.showError(context, e.message);
          }
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

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.go('/login'),
          ),
          title: const Text('Create Account'),
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
                    'Join VAGO',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontFamily: 'ReemKufi',
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Start exploring and organizing your trips',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontFamily: 'ReemKufi',
                      fontSize: 15,
                      color: Colors.grey,
                    ),
                  ),
                  const SizedBox(height: 32),
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.black, width: 2.5),
                      boxShadow: const [
                        BoxShadow(
                          color: Colors.black,
                          offset: Offset(4, 4),
                          blurRadius: 0,
                        ),
                      ],
                    ),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 20,
                        vertical: 24,
                      ),
                      child: Form(
                        key: _formKey,
                        child: Column(
                          children: [
                            // Name 字段（必填）
                            TextFormField(
                              controller: _nameController,
                              keyboardType: TextInputType.name,
                              cursorColor: const Color(0xFFD4A017),
                              style: const TextStyle(fontFamily: 'ReemKufi'),
                              decoration: InputDecoration(
                                labelText: _isChinese ? '名字' : 'Name',
                                labelStyle:
                                    const TextStyle(fontFamily: 'ReemKufi'),
                                floatingLabelStyle: const TextStyle(
                                  fontFamily: 'ReemKufi',
                                  color: Color(0xFFD4A017),
                                ),
                                prefixIcon: const Icon(Icons.person_outline),
                                contentPadding: const EdgeInsets.only(left: 48),
                                errorStyle: const TextStyle(
                                  fontFamily: 'ReemKufi',
                                  fontSize: 12,
                                ),
                                enabledBorder: UnderlineInputBorder(
                                  borderSide: BorderSide(
                                    color: Colors.grey.shade300,
                                    width: 1,
                                  ),
                                ),
                                focusedBorder: const UnderlineInputBorder(
                                  borderSide: BorderSide(
                                    color: Color(0xFFD4A017),
                                    width: 2,
                                  ),
                                ),
                              ),
                              validator: _validateName,
                            ),
                            const SizedBox(height: 16),
                            TextFormField(
                              controller: _emailController,
                              keyboardType: TextInputType.emailAddress,
                              cursorColor: const Color(0xFFD4A017),
                              style: const TextStyle(fontFamily: 'ReemKufi'),
                              decoration: InputDecoration(
                                labelText: 'Email',
                                labelStyle:
                                    const TextStyle(fontFamily: 'ReemKufi'),
                                floatingLabelStyle: const TextStyle(
                                  fontFamily: 'ReemKufi',
                                  color: Color(0xFFD4A017),
                                ),
                                prefixIcon: const Icon(Icons.email_outlined),
                                contentPadding: const EdgeInsets.only(left: 48),
                                errorStyle: const TextStyle(
                                  fontFamily: 'ReemKufi',
                                  fontSize: 12,
                                ),
                                enabledBorder: UnderlineInputBorder(
                                  borderSide: BorderSide(
                                    color: Colors.grey.shade300,
                                    width: 1,
                                  ),
                                ),
                                focusedBorder: const UnderlineInputBorder(
                                  borderSide: BorderSide(
                                    color: Color(0xFFB8860B),
                                    width: 2,
                                  ),
                                ),
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
                              cursorColor: const Color(0xFFD4A017),
                              style: const TextStyle(fontFamily: 'ReemKufi'),
                              decoration: InputDecoration(
                                labelText: 'Password',
                                labelStyle:
                                    const TextStyle(fontFamily: 'ReemKufi'),
                                floatingLabelStyle: const TextStyle(
                                  fontFamily: 'ReemKufi',
                                  color: Color(0xFFD4A017),
                                ),
                                prefixIcon: const Icon(Icons.lock_outline),
                                contentPadding: const EdgeInsets.only(left: 48),
                                errorStyle: const TextStyle(
                                  fontFamily: 'ReemKufi',
                                  fontSize: 12,
                                ),
                                enabledBorder: UnderlineInputBorder(
                                  borderSide: BorderSide(
                                    color: Colors.grey.shade300,
                                    width: 1,
                                  ),
                                ),
                                focusedBorder: const UnderlineInputBorder(
                                  borderSide: BorderSide(
                                    color: Color(0xFFD4A017),
                                    width: 2,
                                  ),
                                ),
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
                            const SizedBox(height: 16),
                            TextFormField(
                              controller: _confirmPasswordController,
                              obscureText: true,
                              cursorColor: const Color(0xFFD4A017),
                              style: const TextStyle(fontFamily: 'ReemKufi'),
                              decoration: InputDecoration(
                                labelText: 'Confirm Password',
                                labelStyle:
                                    const TextStyle(fontFamily: 'ReemKufi'),
                                floatingLabelStyle: const TextStyle(
                                  fontFamily: 'ReemKufi',
                                  color: Color(0xFFD4A017),
                                ),
                                prefixIcon: const Icon(Icons.lock_outline),
                                contentPadding: const EdgeInsets.only(left: 48),
                                errorStyle: const TextStyle(
                                  fontFamily: 'ReemKufi',
                                  fontSize: 12,
                                ),
                                enabledBorder: UnderlineInputBorder(
                                  borderSide: BorderSide(
                                    color: Colors.grey.shade300,
                                    width: 1,
                                  ),
                                ),
                                focusedBorder: const UnderlineInputBorder(
                                  borderSide: BorderSide(
                                    color: Color(0xFFD4A017),
                                    width: 2,
                                  ),
                                ),
                              ),
                              validator: (value) {
                                if (value != _passwordController.text) {
                                  return 'Passwords do not match';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 24),
                            SizedBox(
                              width: double.infinity,
                              height: 48,
                              child: ElevatedButton(
                                onPressed: _isLoading ? null : _onRegister,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFFFFE500),
                                  foregroundColor: Colors.black,
                                  elevation: 0,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    side: const BorderSide(
                                      color: Colors.black,
                                      width: 2,
                                    ),
                                  ),
                                ),
                                child: _isLoading
                                    ? const SizedBox(
                                        height: 20,
                                        width: 20,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: Colors.black,
                                        ),
                                      )
                                    : const Text(
                                        'Create Account',
                                        style: TextStyle(
                                          fontFamily: 'ReemKufi',
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                              ),
                            ),
                            const SizedBox(height: 12),
                            TextButton(
                              onPressed: () => context.go('/login'),
                              child: const Text(
                                'Already have an account? Sign in',
                                style: TextStyle(
                                  fontFamily: 'ReemKufi',
                                  color: Color(0xFFD4A017),
                                ),
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
