import 'package:flutter_test/flutter_test.dart' hide expect, test, group;
import 'package:glados/glados.dart';
import 'package:test/test.dart';
import 'package:wanderlog/core/utils/validators.dart';

/// Property-based tests for the Validators class.
///
/// These tests verify the correctness properties defined in the design document:
/// - Property 1: Email Validation Correctness
/// - Property 2: Password Length Validation
/// - Property 3: Password Confirmation Matching
///
/// **Validates: Requirements 1.1, 3.1, 3.3**

void main() {
  // Set up default generators for glados
  Any.setDefault<String>(any.lowercaseLetters);
  Any.setDefault<int>(any.int);

  group('Validators Property Tests', () {
    /// **Property 1: Email Validation Correctness**
    ///
    /// *For any* string input, the email validator should return null (valid)
    /// only if the string matches a valid email format (contains @ and domain),
    /// and should return an error message for all other inputs.
    ///
    /// **Validates: Requirements 1.1**
    group('Property 1: Email Validation Correctness', () {
      Glados<String>().test(
        'valid emails should pass validation',
        (randomString) {
          // Generate valid email by combining random string with domain
          final localPart = randomString.replaceAll(RegExp(r'[^a-zA-Z0-9._-]'), 'a');
          if (localPart.isEmpty) return; // Skip empty strings
          
          final validEmail = '$localPart@example.com';
          final result = Validators.validateEmail(validEmail);
          
          expect(result, isNull, reason: 'Valid email "$validEmail" should pass validation');
        },
      );

      Glados<String>().test(
        'strings without @ should fail validation',
        (randomString) {
          // Remove any @ symbols to ensure invalid email
          final invalidEmail = randomString.replaceAll('@', '');
          if (invalidEmail.isEmpty) return; // Skip empty strings
          
          final result = Validators.validateEmail(invalidEmail);
          
          expect(result, isNotNull, reason: 'Email without @ "$invalidEmail" should fail validation');
        },
      );

      Glados<String>().test(
        'strings with @ but no domain should fail validation',
        (randomString) {
          final localPart = randomString.replaceAll(RegExp(r'[@.]'), 'a');
          if (localPart.isEmpty) return;
          
          final invalidEmail = '$localPart@';
          final result = Validators.validateEmail(invalidEmail);
          
          expect(result, isNotNull, reason: 'Email without domain "$invalidEmail" should fail validation');
        },
      );

      test('null email should fail validation', () {
        final result = Validators.validateEmail(null);
        expect(result, isNotNull);
        expect(result, equals('Please enter your email'));
      });

      test('empty email should fail validation', () {
        final result = Validators.validateEmail('');
        expect(result, isNotNull);
        expect(result, equals('Please enter your email'));
      });

      test('whitespace-only email should fail validation', () {
        final result = Validators.validateEmail('   ');
        expect(result, isNotNull);
        expect(result, equals('Please enter your email'));
      });
    });

    /// **Property 2: Password Length Validation**
    ///
    /// *For any* string input, the password validator should return null (valid)
    /// only if the string length is >= 6 characters, and should return an error
    /// message for shorter strings.
    ///
    /// **Validates: Requirements 3.1**
    group('Property 2: Password Length Validation', () {
      Glados<String>().test(
        'passwords with length >= 6 should pass validation',
        (password) {
          // Ensure password has at least 6 characters
          final validPassword = password.padRight(6, 'x');
          final result = Validators.validatePassword(validPassword);
          
          expect(result, isNull, 
            reason: 'Password of length ${validPassword.length} should pass validation',);
        },
      );

      Glados<int>().test(
        'passwords with length < 6 should fail validation',
        (length) {
          // Generate password with length 1-5
          final shortLength = (length.abs() % 5) + 1;
          final shortPassword = 'a' * shortLength;
          final result = Validators.validatePassword(shortPassword);
          
          expect(result, isNotNull,
            reason: 'Password of length $shortLength should fail validation',);
          expect(result, contains('at least 6 characters'));
        },
      );

      Glados<int>().test(
        'hasMinLength returns true iff password length >= minLength',
        (minLength) {
          // Clamp minLength to reasonable range
          final clampedMinLength = (minLength.abs() % 20) + 1;
          
          // Generate password of exact minLength
          final exactLengthPassword = 'a' * clampedMinLength;
          final shorterPassword = clampedMinLength > 1 ? 'a' * (clampedMinLength - 1) : '';
          final longerPassword = 'a' * (clampedMinLength + 1);
          
          expect(
            Validators.hasMinLength(exactLengthPassword, minLength: clampedMinLength),
            isTrue,
            reason: 'Password of exact minLength should pass',
          );
          
          if (clampedMinLength > 1) {
            expect(
              Validators.hasMinLength(shorterPassword, minLength: clampedMinLength),
              isFalse,
              reason: 'Password shorter than minLength should fail',
            );
          }
          
          expect(
            Validators.hasMinLength(longerPassword, minLength: clampedMinLength),
            isTrue,
            reason: 'Password longer than minLength should pass',
          );
        },
      );

      test('null password should fail validation', () {
        final result = Validators.validatePassword(null);
        expect(result, isNotNull);
        expect(result, equals('Please enter a password'));
      });

      test('empty password should fail validation', () {
        final result = Validators.validatePassword('');
        expect(result, isNotNull);
        expect(result, equals('Please enter a password'));
      });
    });

    /// **Property 3: Password Confirmation Matching**
    ///
    /// *For any* pair of password strings, the confirmation validator should
    /// return null (valid) only if both strings are identical, and should
    /// return an error message when they differ.
    ///
    /// **Validates: Requirements 3.3**
    group('Property 3: Password Confirmation Matching', () {
      Glados<String>().test(
        'identical passwords should pass confirmation validation',
        (password) {
          if (password.isEmpty) return; // Skip empty strings
          
          final result = Validators.validatePasswordConfirmation(password, password);
          
          expect(result, isNull,
            reason: 'Identical passwords should pass confirmation',);
        },
      );

      Glados2<String, String>().test(
        'different passwords should fail confirmation validation',
        (password, confirmation) {
          if (password.isEmpty || confirmation.isEmpty) return;
          if (password == confirmation) return; // Skip if they happen to be equal
          
          final result = Validators.validatePasswordConfirmation(password, confirmation);
          
          expect(result, isNotNull,
            reason: 'Different passwords should fail confirmation',);
          expect(result, equals('Passwords do not match'));
        },
      );

      Glados<String>().test(
        'passwordsMatch returns true iff passwords are identical',
        (password) {
          // Test with identical passwords
          expect(
            Validators.passwordsMatch(password, password),
            isTrue,
            reason: 'Identical passwords should match',
          );
          
          // Test with different passwords (append character to ensure difference)
          if (password.isNotEmpty) {
            expect(
              Validators.passwordsMatch(password, '${password}x'),
              isFalse,
              reason: 'Different passwords should not match',
            );
          }
        },
      );

      test('null confirmation should fail validation', () {
        final result = Validators.validatePasswordConfirmation('password', null);
        expect(result, isNotNull);
        expect(result, equals('Please confirm your password'));
      });

      test('empty confirmation should fail validation', () {
        final result = Validators.validatePasswordConfirmation('password', '');
        expect(result, isNotNull);
        expect(result, equals('Please confirm your password'));
      });
    });
  });
}
