import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/core/utils/validators.dart';
import 'package:wanderlog/core/utils/auth_error_messages.dart';

class ResetPasswordPage extends ConsumerStatefulWidget {
  const ResetPasswordPage({super.key, this.email});
  final String? email;

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
            fontSize: 13,
            color: isActive ? color : Colors.grey,
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => context.go('/login'),
          ),
          title: const Text('Create New Password'),
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
                    const Icon(
                      Icons.lock_reset,
                      size: 80,
                      color: Colors.blue,
                    ),
                    const SizedBox(height: 32),
                    const Text(
                      'Create New Password',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Create a new password for your account.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 16,
                        color: Colors.grey[600],
                      ),
                    ),
                    const SizedBox(height: 48),
                    TextFormField(
                      controller: _passwordController,
                      obscureText: _obscurePassword,
                      decoration: InputDecoration(
                        labelText: 'New Password',
                        labelStyle:
                            const TextStyle(color: AppTheme.borderYellow),
                        hintText: 'At least 6 characters',
                        hintStyle: TextStyle(color: Colors.grey[400]),
                        prefixIcon: const Icon(Icons.lock_outline,
                            color: AppTheme.borderYellow,),
                        border: const OutlineInputBorder(
                          borderSide: BorderSide(color: AppTheme.borderYellow),
                        ),
                        enabledBorder: const OutlineInputBorder(
                          borderSide: BorderSide(color: AppTheme.borderYellow),
                        ),
                        focusedBorder: const OutlineInputBorder(
                          borderSide: BorderSide(
                              color: AppTheme.borderYellow, width: 2,),
                        ),
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
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _confirmPasswordController,
                      obscureText: _obscureConfirmPassword,
                      decoration: InputDecoration(
                        labelText: 'Confirm Password',
                        labelStyle:
                            const TextStyle(color: AppTheme.borderYellow),
                        hintText: 'Re-enter your password',
                        hintStyle: TextStyle(color: Colors.grey[400]),
                        prefixIcon: const Icon(Icons.lock_outline,
                            color: AppTheme.borderYellow,),
                        border: const OutlineInputBorder(
                          borderSide: BorderSide(color: AppTheme.borderYellow),
                        ),
                        enabledBorder: const OutlineInputBorder(
                          borderSide: BorderSide(color: AppTheme.borderYellow),
                        ),
                        focusedBorder: const OutlineInputBorder(
                          borderSide: BorderSide(
                              color: AppTheme.borderYellow, width: 2,),
                        ),
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
                    const SizedBox(height: 16),
                    // Password strength indicator (Requirement 4.4)
                    _buildPasswordStrengthIndicator(),
                    const SizedBox(height: 32),
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
                            : const Text('Reset Password'),
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
