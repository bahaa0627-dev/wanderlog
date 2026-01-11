import 'package:supabase_flutter/supabase_flutter.dart';

/// Unified error message mapping for authentication-related errors.
///
/// This class provides static methods and constants for converting
/// Supabase Auth errors into user-friendly messages.
///
/// Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
class AuthErrorMessages {
  // Private constructor to prevent instantiation
  AuthErrorMessages._();

  // ============================================================
  // Error Message Constants
  // ============================================================

  /// Error message when the email is not registered (Requirement 5.1)
  static const String emailNotFound =
      "This email didn't sign up. Please check your email or create a new account.";

  /// Error message when the network is unavailable (Requirement 5.2)
  static const String networkError =
      'Network error. Please check your connection and try again.';

  /// Error message when the reset link has expired (Requirement 5.3)
  static const String linkExpired =
      'Reset link has expired. Please request a new one.';

  /// Error message when the new password is the same as the old password (Requirement 5.4)
  static const String samePassword =
      'New password must be different from your current password.';

  /// Error message when the session is invalid during password update (Requirement 5.5)
  static const String invalidSession =
      'Session expired. Please request a new reset link.';

  /// Error message when the email is not confirmed
  static const String emailNotConfirmed = 'Please verify your email first.';

  /// Error message when the password is too weak
  static const String weakPassword =
      'Password is too weak. Please use at least 6 characters.';

  /// Error message when the reset link/token is invalid
  static const String invalidToken =
      'Invalid reset link. Please request a new one.';

  /// Error message for invalid credentials
  static const String invalidCredentials =
      'Invalid email or password. Please try again.';

  /// Error message when user already exists
  static const String userAlreadyExists =
      'An account with this email already exists. Please sign in instead.';

  /// Error message when rate limited
  static const String rateLimited =
      'Too many requests. Please wait a moment and try again.';

  /// Generic error message for unknown errors
  static const String unknownError = 'Something went wrong. Please try again.';

  // ============================================================
  // Error Code Mappings
  // ============================================================

  /// Map of Supabase error codes/messages to user-friendly messages
  static const Map<String, String> _errorCodeMap = {
    // User not found errors
    'user_not_found': emailNotFound,
    'user-not-found': emailNotFound,
    'invalid_grant': invalidCredentials,
    
    // Email confirmation errors
    'email_not_confirmed': emailNotConfirmed,
    'email-not-confirmed': emailNotConfirmed,
    
    // Password errors
    'same_password': samePassword,
    'same-password': samePassword,
    'weak_password': weakPassword,
    'weak-password': weakPassword,
    
    // Token/Link errors
    'expired_token': linkExpired,
    'expired-token': linkExpired,
    'otp_expired': linkExpired,
    'invalid_token': invalidToken,
    'invalid-token': invalidToken,
    
    // Session errors
    'invalid_session': invalidSession,
    'invalid-session': invalidSession,
    'session_not_found': invalidSession,
    'no_session': invalidSession,
    
    // Rate limiting
    'over_request_rate_limit': rateLimited,
    'rate_limit_exceeded': rateLimited,
    
    // User exists
    'user_already_exists': userAlreadyExists,
    'email_exists': userAlreadyExists,
  };

  /// Map of error message substrings to user-friendly messages
  static const Map<String, String> _errorMessageMap = {
    'user not found': emailNotFound,
    'email not confirmed': emailNotConfirmed,
    'same password': samePassword,
    'password should be different': samePassword,
    'weak password': weakPassword,
    'password is too short': weakPassword,
    'expired': linkExpired,
    'invalid token': invalidToken,
    'invalid otp': invalidToken,
    'session': invalidSession,
    'rate limit': rateLimited,
    'too many requests': rateLimited,
    'already registered': userAlreadyExists,
    'already exists': userAlreadyExists,
    'network': networkError,
    'connection': networkError,
    'socket': networkError,
    'timeout': networkError,
  };

  // ============================================================
  // Public Methods
  // ============================================================

  /// Converts a Supabase error into a user-friendly message.
  ///
  /// This method handles various types of errors:
  /// - [AuthException] from Supabase Auth
  /// - [PostgrestException] from Supabase database operations
  /// - Network-related exceptions
  /// - Generic exceptions
  ///
  /// Returns a non-empty, user-friendly string that does not expose
  /// internal error details.
  ///
  /// Example:
  /// ```dart
  /// try {
  ///   await supabase.auth.resetPasswordForEmail(email);
  /// } catch (e) {
  ///   final message = AuthErrorMessages.fromSupabaseError(e);
  ///   showError(message);
  /// }
  /// ```
  static String fromSupabaseError(dynamic error) {
    if (error == null) {
      return unknownError;
    }

    // Handle AuthException from Supabase
    if (error is AuthException) {
      return _handleAuthException(error);
    }

    // Handle PostgrestException from Supabase
    if (error is PostgrestException) {
      return _handlePostgrestException(error);
    }

    // Handle network-related errors
    if (_isNetworkError(error)) {
      return networkError;
    }

    // Handle string errors
    if (error is String) {
      return _mapErrorMessage(error);
    }

    // Handle generic exceptions
    if (error is Exception) {
      return _mapErrorMessage(error.toString());
    }

    // Fallback for any other type
    return _mapErrorMessage(error.toString());
  }

  /// Checks if an error code indicates a session-related issue.
  ///
  /// Useful for determining if the user should be redirected to
  /// the forgot password page.
  static bool isSessionError(dynamic error) {
    if (error is AuthException) {
      final code = error.statusCode?.toLowerCase() ?? '';
      final message = error.message.toLowerCase();
      return code.contains('session') ||
          message.contains('session') ||
          message.contains('no_session');
    }
    return false;
  }

  /// Checks if an error indicates the reset link has expired.
  static bool isLinkExpiredError(dynamic error) {
    if (error is AuthException) {
      final message = error.message.toLowerCase();
      return message.contains('expired') || message.contains('otp_expired');
    }
    return false;
  }

  // ============================================================
  // Private Helper Methods
  // ============================================================

  /// Handles AuthException from Supabase Auth
  static String _handleAuthException(AuthException error) {
    final statusCode = error.statusCode?.toLowerCase() ?? '';
    final message = error.message.toLowerCase();

    // First, try to match by status code
    if (statusCode.isNotEmpty && _errorCodeMap.containsKey(statusCode)) {
      return _errorCodeMap[statusCode]!;
    }

    // Then, try to match by message content
    return _mapErrorMessage(message);
  }

  /// Handles PostgrestException from Supabase database operations
  static String _handlePostgrestException(PostgrestException error) {
    final code = error.code?.toLowerCase() ?? '';
    final message = error.message.toLowerCase();

    // Try to match by code first
    if (code.isNotEmpty && _errorCodeMap.containsKey(code)) {
      return _errorCodeMap[code]!;
    }

    // Then try message matching
    return _mapErrorMessage(message);
  }

  /// Maps an error message string to a user-friendly message
  static String _mapErrorMessage(String errorMessage) {
    final lowerMessage = errorMessage.toLowerCase();

    // Check against error code map
    for (final entry in _errorCodeMap.entries) {
      if (lowerMessage.contains(entry.key)) {
        return entry.value;
      }
    }

    // Check against error message map
    for (final entry in _errorMessageMap.entries) {
      if (lowerMessage.contains(entry.key)) {
        return entry.value;
      }
    }

    // Return generic error if no match found
    return unknownError;
  }

  /// Checks if the error is network-related
  static bool _isNetworkError(dynamic error) {
    final errorString = error.toString().toLowerCase();
    return errorString.contains('socketexception') ||
        errorString.contains('network') ||
        errorString.contains('connection') ||
        errorString.contains('timeout') ||
        errorString.contains('host lookup') ||
        errorString.contains('failed host lookup');
  }
}
