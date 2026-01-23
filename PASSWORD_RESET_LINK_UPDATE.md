# Password Reset Flow - Using Supabase Native Feature

## Summary
WanderLog uses Supabase's native password reset functionality with deep link support. The backend custom implementation has been removed to avoid duplication.

## How It Works

### 1. **Frontend Triggers Reset**
```dart
await SupabaseConfig.auth.resetPasswordForEmail(
  email,
  redirectTo: SupabaseConfig.redirectUrl, // 'io.supabase.wanderlog://login-callback'
);
```

### 2. **Supabase Sends Email**
- Supabase automatically sends a password reset email
- Email contains a link with a secure token
- Link opens the app via deep link: `io.supabase.wanderlog://login-callback#access_token=...`

### 3. **App Handles Deep Link**
```dart
// In main.dart
_authSub = SupabaseConfig.auth.onAuthStateChange.listen((data) {
  if (data.event == AuthChangeEvent.passwordRecovery) {
    _router.go('/reset-password');
  }
});
```

### 4. **User Sets New Password**
```dart
await SupabaseConfig.auth.updateUser(
  UserAttributes(password: newPassword),
);
```

## Configuration

### Deep Link Setup
- **Scheme**: `io.supabase.wanderlog`
- **Host**: `login-callback`
- **Full URL**: `io.supabase.wanderlog://login-callback`

### Supabase Dashboard
Configure the redirect URL in Supabase Dashboard → Authentication → URL Configuration:
```
io.supabase.wanderlog://login-callback
```

### iOS Configuration
Ensure `Info.plist` has the URL scheme:
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>io.supabase.wanderlog</string>
    </array>
  </dict>
</array>
```

### Android Configuration
Ensure `AndroidManifest.xml` has the intent filter:
```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW"/>
  <category android:name="android.intent.category.DEFAULT"/>
  <category android:name="android.intent.category.BROWSABLE"/>
  <data android:scheme="io.supabase.wanderlog" android:host="login-callback"/>
</intent-filter>
```

## Flow Diagram

```
User                  Frontend                Supabase                 Email
  |                      |                       |                       |
  |--Request Reset------>|                       |                       |
  |                      |--resetPasswordForEmail->                      |
  |                      |                       |--Send Email---------->|
  |                      |                       |                       |
  |<-----------------Confirmation Message--------|                       |
  |                                                                      |
  |<----------------------Opens Email------------------------------------|
  |                                                                      |
  |--Click Link--------->|                       |                       |
  |                      |<-Deep Link w/ Token---|                       |
  |                      |                       |                       |
  |                      |--AuthChangeEvent----->|                       |
  |                      |  (passwordRecovery)   |                       |
  |                      |                       |                       |
  |<-Show Reset Form-----|                       |                       |
  |                      |                       |                       |
  |--Enter New Password->|                       |                       |
  |                      |--updateUser()-------->|                       |
  |                      |                       |                       |
  |<----Success----------|<-------Done-----------|                       |
```

## Backend Role

The backend `/auth/forgot-password` endpoint is **optional** and only used for:
1. Checking if email exists (better UX)
2. Returning appropriate error messages

The actual password reset is entirely handled by Supabase.

Backend endpoint returns 501 for `/auth/reset-password` since it's not needed:
```typescript
export const resetPassword = async (req: Request, res: Response) => {
  return res.status(501).json({ 
    message: 'Password reset is handled by Supabase Auth.',
  });
};
```

## Why This Approach?

1. **Native Integration**: Leverages Supabase's built-in email templates and security
2. **Deep Link Support**: Seamless app-to-email-to-app flow
3. **Secure**: Uses Supabase's token management and expiration
4. **Less Code**: No custom token generation, storage, or email sending
5. **Consistent**: Matches Supabase's other auth flows (email verification, etc.)

## Testing

1. Run the app
2. Click "Forgot Password" on login screen
3. Enter your email
4. Check your inbox for Supabase's reset email
5. Click the link in the email
6. App should open to reset password screen
7. Enter new password
8. Success!

## Troubleshooting

### Email not received
- Check spam folder
- Verify email is registered
- Check Supabase Dashboard → Authentication → Email Templates

### Deep link not opening app
- Verify URL scheme in Info.plist/AndroidManifest.xml
- Check Supabase Dashboard redirect URL configuration
- Test with: `xcrun simctl openurl booted "io.supabase.wanderlog://login-callback"`

### "Invalid or expired token"
- Tokens expire after 1 hour (Supabase default)
- Request a new reset link

