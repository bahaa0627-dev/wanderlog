import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/core/utils/validators.dart';
import 'package:wanderlog/core/utils/auth_error_messages.dart';

class ResetPasswordPage extends ConsumerStatefulWidget {
  const ResetPasswordPage({super.key});

  @override
  ConsumerState<ResetPasswordPage> createState() => _ResetPasswordPageState();
}

class _ResetPasswordPageState extends ConsumerState<ResetPasswordPage> {
  final _formKey = GlobalKey<FormState>();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  bool _isLoading = false;
  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;
  
  // Real-time password validation state (Requirements 3.1, 3.2, 3.3)
  bool _hasMinLength = false;
  bool _passwordsMatch = false;

  @override
  void initState() {
    super.initState();
    // Add listeners for real-time validation
    _passwordController.addListener(_validatePassword);
    _confirmPasswordController.addListener(_validatePassword);
  }
  
  /// Validates password in real-time and updates state
  /// Requirements: 3.1, 3.2, 3.3
  void _validatePassword() {
    final password = _passwordController.text;
    final confirmation = _confirmPasswordController.text;
    
    setState(() {
      _hasMinLength = Validators.hasMinLength(password);
      _passwordsMatch = confirmation.isNotEmpty && 
          Validators.passwordsMatch(password, confirmation);
    });
  }

  @override
  void dispose() {
    _passwordController.removeListener(_validatePassword);
    _confirmPasswordController.removeListener(_validatePassword);
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _onSubmit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    try {
      // Use Supabase's native password update during recovery flow
      await ref
          .read(authProvider.notifier)
          .updatePassword(_passwordController.text);

      if (mounted) {
        CustomToast.showSuccess(context, 'Password reset successfully!');
        // 等待一下让用户看到成功提示
        await Future<void>.delayed(const Duration(milliseconds: 1500));
        if (mounted) {
          context.go('/login');
        }
      }
    } catch (e) {
      if (mounted) {
        final errorMessage = AuthErrorMessages.fromSupabaseError(e);
        CustomToast.showError(context, errorMessage);
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  /// Builds the password strength indicator widget
  /// Shows whether password meets requirements and if passwords match
  /// Requirement: 4.4
  Widget _buildPasswordStrengthIndicator() {
    final hasPassword = _passwordController.text.isNotEmpty;
    final hasConfirmation = _confirmPasswordController.text.isNotEmpty;
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Password length requirement
        _buildRequirementRow(
          icon: _hasMinLength ? Icons.check_circle : Icons.circle_outlined,
          color: _hasMinLength ? Colors.green : Colors.grey,
          text: 'At least 6 characters',
          isActive: hasPassword,
        ),
        const SizedBox(height: 8),
        // Passwords match requirement
        _buildRequirementRow(
          icon: _passwordsMatch ? Icons.check_circle : Icons.circle_outlined,
          color: _passwordsMatch ? Colors.green : 
              (hasConfirmation && !_passwordsMatch ? Colors.red : Colors.grey),
          text: _passwordsMatch ? 'Passwords match' : 
              (hasConfirmation && !_passwordsMatch ? 'Passwords do not match' : 'Passwords match'),
          isActive: hasConfirmation,
        ),
      ],
    );
  }

  /// Builds a single requirement row for the password strength indicator
  Widget _buildRequirementRow({
    required IconData icon,
    required Color color,
    required String text,
    required bool isActive,
  }) {
    return Row(
      children: [
        Icon(
          icon,
          size: 16,
          color: color,
        ),
        const SizedBox(width: 8),
        Text(
          text,
          style: TextStyle(
            fontFamily: 'ReemKufi',
            fontSize: 13,
            color: isActive ? color : Colors.grey,
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.white,
        appBar: AppBar(
          backgroundColor: Colors.white,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.black),
            onPressed: () => context.go('/login'),
          ),
          title: const Text(
            'Create New Password',
            style: TextStyle(
              fontFamily: 'ReemKufi',
              color: Colors.black,
            ),
          ),
        ),
        body: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Neo Brutalism Icon Card
                    Container(
                      padding: const EdgeInsets.all(32),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFF9E6),
                        border: Border.all(color: Colors.black, width: 3),
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: const [
                          BoxShadow(
                            color: Colors.black,
                            offset: Offset(6, 6),
                            blurRadius: 0,
                          ),
                        ],
                      ),
                      child: const Icon(
                        Icons.lock_reset,
                        size: 80,
                        color: Color(0xFFD4A017),
                      ),
                    ),
                    const SizedBox(height: 32),
                    const Text(
                      'Create New Password',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontFamily: 'ReemKufi',
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Create a new password for your account.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontFamily: 'ReemKufi',
                        fontSize: 16,
                        color: Colors.grey[600],
                      ),
                    ),
                    const SizedBox(height: 48),
                    // New Password Field
                    Container(
                      decoration: BoxDecoration(
                        color: Colors.white,
                        border: Border.all(color: const Color(0xFFD4A017), width: 3),
                        borderRadius: BorderRadius.circular(12),
                        boxShadow: const [
                          BoxShadow(
                            color: Colors.black,
                            offset: Offset(4, 4),
                            blurRadius: 0,
                          ),
                        ],
                      ),
                      child: TextFormField(
                        controller: _passwordController,
                        obscureText: _obscurePassword,
                        style: const TextStyle(fontFamily: 'ReemKufi'),
                        decoration: InputDecoration(
                          labelText: 'New Password',
                          labelStyle: const TextStyle(
                            fontFamily: 'ReemKufi',
                            color: Color(0xFFD4A017),
                          ),
                          hintText: 'At least 6 characters',
                          hintStyle: TextStyle(
                            fontFamily: 'ReemKufi',
                            color: Colors.grey[400],
                          ),
                          prefixIcon: const Icon(
                            Icons.lock_outline,
                            color: Color(0xFFD4A017),
                          ),
                          border: InputBorder.none,
                          contentPadding: const EdgeInsets.all(16),
                          suffixIcon: IconButton(
                            icon: Icon(
                              _obscurePassword
                                  ? Icons.visibility
                                  : Icons.visibility_off,
                            ),
                            onPressed: () {
                              setState(
                                  () => _obscurePassword = !_obscurePassword,);
                            },
                          ),
                        ),
                        validator: Validators.validatePassword,
                      ),
                    ),
                    const SizedBox(height: 16),
                    // Confirm Password Field
                    Container(
                      decoration: BoxDecoration(
                        color: Colors.white,
                        border: Border.all(color: const Color(0xFFD4A017), width: 3),
                        borderRadius: BorderRadius.circular(12),
                        boxShadow: const [
                          BoxShadow(
                            color: Colors.black,
                            offset: Offset(4, 4),
                            blurRadius: 0,
                          ),
                        ],
                      ),
                      child: TextFormField(
                        controller: _confirmPasswordController,
                        obscureText: _obscureConfirmPassword,
                        style: const TextStyle(fontFamily: 'ReemKufi'),
                        decoration: InputDecoration(
                          labelText: 'Confirm Password',
                          labelStyle: const TextStyle(
                            fontFamily: 'ReemKufi',
                            color: Color(0xFFD4A017),
                          ),
                          hintText: 'Re-enter your password',
                          hintStyle: TextStyle(
                            fontFamily: 'ReemKufi',
                            color: Colors.grey[400],
                          ),
                          prefixIcon: const Icon(
                            Icons.lock_outline,
                            color: Color(0xFFD4A017),
                          ),
                          border: InputBorder.none,
                          contentPadding: const EdgeInsets.all(16),
                          suffixIcon: IconButton(
                            icon: Icon(
                              _obscureConfirmPassword
                                  ? Icons.visibility
                                  : Icons.visibility_off,
                            ),
                            onPressed: () {
                              setState(() => _obscureConfirmPassword =
                                  !_obscureConfirmPassword,);
                            },
                          ),
                        ),
                        validator: (value) =>
                            Validators.validatePasswordConfirmation(
                              _passwordController.text,
                              value,
                            ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    // Password strength indicator (Requirement 4.4)
                    _buildPasswordStrengthIndicator(),
                    const SizedBox(height: 32),
                    // Neo Brutalism Button
                    Container(
                      height: 56,
                      decoration: BoxDecoration(
                        color: const Color(0xFFD4A017),
                        border: Border.all(color: Colors.black, width: 3),
                        borderRadius: BorderRadius.circular(12),
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
                          onTap: _isLoading ? null : _onSubmit,
                          borderRadius: BorderRadius.circular(9),
                          child: Center(
                            child: _isLoading
                                ? const SizedBox(
                                    height: 24,
                                    width: 24,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 3,
                                      color: Colors.black,
                                    ),
                                  )
                                : const Text(
                                    'Reset Password',
                                    style: TextStyle(
                                      fontFamily: 'ReemKufi',
                                      fontSize: 18,
                                      fontWeight: FontWeight.bold,
                                      color: Colors.black,
                                    ),
                                  ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
}
