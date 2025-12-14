/**
 * 邮件模板 - Resend HTML 格式
 */

interface EmailTemplateProps {
  code?: string;
  userName?: string;
  resetLink?: string;
}

/**
 * 邮箱验证邮件模板
 */
export function emailVerificationTemplate({ code, userName }: EmailTemplateProps): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f7f7f7;
    }
    .container {
      background-color: #ffffff;
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 32px;
      font-weight: bold;
      color: #2563eb;
      margin-bottom: 10px;
    }
    h1 {
      color: #1f2937;
      font-size: 24px;
      margin-bottom: 20px;
      text-align: center;
    }
    .code-container {
      background-color: #f3f4f6;
      border-radius: 8px;
      padding: 30px;
      text-align: center;
      margin: 30px 0;
    }
    .code {
      font-size: 36px;
      font-weight: bold;
      letter-spacing: 8px;
      color: #2563eb;
      font-family: 'Courier New', monospace;
    }
    .info {
      color: #6b7280;
      font-size: 14px;
      text-align: center;
      margin-top: 20px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #9ca3af;
      font-size: 12px;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background-color: #2563eb;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🌍 WanderLog</div>
    </div>
    
    <h1>Welcome to WanderLog${userName ? ', ' + userName : ''}! 🎉</h1>
    
    <p style="text-align: center; color: #6b7280;">
      Thank you for signing up! Please verify your email address using the code below:
    </p>
    
    <div class="code-container">
      <div class="code">${code}</div>
    </div>
    
    <p class="info">
      ⏱ This code will expire in <strong>15 minutes</strong>
    </p>
    
    <p style="text-align: center; color: #6b7280; font-size: 14px; margin-top: 30px;">
      If you didn't create an account with WanderLog, please ignore this email.
    </p>
    
    <div class="footer">
      <p>© 2025 WanderLog. All rights reserved.</p>
      <p>Your personal travel companion for exploring the world.</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * 密码重置邮件模板
 */
export function passwordResetTemplate({ code, userName }: EmailTemplateProps): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f7f7f7;
    }
    .container {
      background-color: #ffffff;
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 32px;
      font-weight: bold;
      color: #2563eb;
      margin-bottom: 10px;
    }
    h1 {
      color: #1f2937;
      font-size: 24px;
      margin-bottom: 20px;
      text-align: center;
    }
    .code-container {
      background-color: #fef2f2;
      border: 2px solid #fca5a5;
      border-radius: 8px;
      padding: 30px;
      text-align: center;
      margin: 30px 0;
    }
    .code {
      font-size: 36px;
      font-weight: bold;
      letter-spacing: 8px;
      color: #dc2626;
      font-family: 'Courier New', monospace;
    }
    .info {
      color: #6b7280;
      font-size: 14px;
      text-align: center;
      margin-top: 20px;
    }
    .warning {
      background-color: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #9ca3af;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🌍 WanderLog</div>
    </div>
    
    <h1>Reset Your Password 🔒</h1>
    
    <p style="text-align: center; color: #6b7280;">
      ${userName ? 'Hi ' + userName + ', we' : 'We'} received a request to reset your password. Use the code below:
    </p>
    
    <div class="code-container">
      <div class="code">${code}</div>
    </div>
    
    <p class="info">
      ⏱ This code will expire in <strong>30 minutes</strong>
    </p>
    
    <div class="warning">
      <strong>⚠️ Security Notice:</strong><br>
      If you didn't request a password reset, please ignore this email and your password will remain unchanged.
    </div>
    
    <div class="footer">
      <p>© 2025 WanderLog. All rights reserved.</p>
      <p>Your personal travel companion for exploring the world.</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * 欢迎邮件模板
 */
export function welcomeEmailTemplate({ userName }: EmailTemplateProps): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f7f7f7;
    }
    .container {
      background-color: #ffffff;
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 42px;
      margin-bottom: 20px;
    }
    h1 {
      color: #1f2937;
      font-size: 28px;
      margin-bottom: 20px;
      text-align: center;
    }
    .content {
      color: #4b5563;
      font-size: 16px;
      line-height: 1.8;
    }
    .feature-list {
      margin: 30px 0;
    }
    .feature {
      padding: 15px;
      margin: 10px 0;
      background-color: #f9fafb;
      border-radius: 8px;
      border-left: 4px solid #2563eb;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #9ca3af;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🌍 ✈️ 🗺️</div>
    </div>
    
    <h1>Welcome to WanderLog${userName ? ', ' + userName : ''}! 🎉</h1>
    
    <div class="content">
      <p>Your email has been successfully verified! You're now ready to start your travel adventure with WanderLog.</p>
      
      <div class="feature-list">
        <div class="feature">
          <strong>✨ Discover Places</strong><br>
          Explore curated spots and hidden gems around the world
        </div>
        <div class="feature">
          <strong>📍 Plan Trips</strong><br>
          Create and organize your travel itineraries effortlessly
        </div>
        <div class="feature">
          <strong>🗺️ Interactive Maps</strong><br>
          Visualize your journey with beautiful interactive maps
        </div>
        <div class="feature">
          <strong>💾 Save Favorites</strong><br>
          Bookmark places you love and want to visit
        </div>
      </div>
      
      <p style="text-align: center; margin-top: 30px;">
        <strong>Ready to explore? Start planning your next adventure!</strong>
      </p>
    </div>
    
    <div class="footer">
      <p>© 2025 WanderLog. All rights reserved.</p>
      <p>Your personal travel companion for exploring the world.</p>
    </div>
  </div>
</body>
</html>
  `;
}
