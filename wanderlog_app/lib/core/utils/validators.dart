/// Unified validation utilities for the WanderLog app.
///
/// This class provides static methods for validating user input
/// such as email addresses, passwords, and password confirmations.
class Validators {
  // Private constructor to prevent instantiation
  Validators._();

  /// Regular expression for validating email format.
  /// Matches standard email patterns like user@domain.com
  static final RegExp _emailRegex = RegExp(
    r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$',
  );

  /// Default minimum password length
  static const int defaultMinPasswordLength = 6;

  /// Validates an email address.
  ///
  /// Returns `null` if the email is valid, otherwise returns an error message.
  ///
  /// Validation rules:
  /// - Email must not be null or empty
  /// - Email must match a valid email format (contains @ and domain)
  ///
  /// Example:
  /// ```dart
  /// Validators.validateEmail('user@example.com'); // returns null (valid)
  /// Validators.validateEmail('invalid-email'); // returns error message
  /// ```
  static String? validateEmail(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Please enter your email';
    }

    final trimmedValue = value.trim();
    if (!_emailRegex.hasMatch(trimmedValue)) {
      return 'Please enter a valid email';
    }

    return null;
  }

  /// Validates a password.
  ///
  /// Returns `null` if the password is valid, otherwise returns an error message.
  ///
  /// Validation rules:
  /// - Password must not be null or empty
  /// - Password must be at least [minLength] characters (default: 6)
  ///
  /// Example:
  /// ```dart
  /// Validators.validatePassword('password123'); // returns null (valid)
  /// Validators.validatePassword('12345'); // returns error message (too short)
  /// ```
  static String? validatePassword(String? value, {int minLength = defaultMinPasswordLength}) {
    if (value == null || value.isEmpty) {
      return 'Please enter a password';
    }

    if (value.length < minLength) {
      return 'Password must be at least $minLength characters';
    }

    return null;
  }

  /// Validates that a password confirmation matches the original password.
  ///
  /// Returns `null` if the passwords match, otherwise returns an error message.
  ///
  /// Validation rules:
  /// - Confirmation must not be null or empty
  /// - Confirmation must exactly match the password
  ///
  /// Example:
  /// ```dart
  /// Validators.validatePasswordConfirmation('pass123', 'pass123'); // returns null (valid)
  /// Validators.validatePasswordConfirmation('pass123', 'pass456'); // returns error message
  /// ```
  static String? validatePasswordConfirmation(String? password, String? confirmation) {
    if (confirmation == null || confirmation.isEmpty) {
      return 'Please confirm your password';
    }

    if (password != confirmation) {
      return 'Passwords do not match';
    }

    return null;
  }

  /// Checks if a password meets the minimum length requirement.
  ///
  /// Returns `true` if the password length is >= [minLength], `false` otherwise.
  ///
  /// This is a helper method for real-time password strength indication.
  ///
  /// Example:
  /// ```dart
  /// Validators.hasMinLength('password123'); // returns true
  /// Validators.hasMinLength('12345'); // returns false
  /// Validators.hasMinLength('1234', minLength: 4); // returns true
  /// ```
  static bool hasMinLength(String password, {int minLength = defaultMinPasswordLength}) => password.length >= minLength;

  /// Checks if two passwords match.
  ///
  /// Returns `true` if both passwords are identical, `false` otherwise.
  ///
  /// This is a helper method for real-time password matching indication.
  ///
  /// Example:
  /// ```dart
  /// Validators.passwordsMatch('pass123', 'pass123'); // returns true
  /// Validators.passwordsMatch('pass123', 'pass456'); // returns false
  /// ```
  static bool passwordsMatch(String password, String confirmation) => password == confirmation;
}
