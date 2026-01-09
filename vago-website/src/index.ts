/**
 * VAGO Website - Cloudflare Worker
 * 处理 vago.to 的页面请求
 */

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // 认证回调页面
    if (path === '/authentication' || path.startsWith('/authentication')) {
      return new Response(getAuthCallbackHTML(url), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // 首页 - 简单的占位页面
    if (path === '/' || path === '') {
      return new Response(getHomepageHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // 404
    return new Response('Not Found', { status: 404 });
  },
};

function getAuthCallbackHTML(url: URL): string {
  const params = url.searchParams;
  const hash = url.hash;
  const error = params.get('error');
  const errorDescription = params.get('error_description');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Verification - VAGO</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #FFF8E1 0%, #FFFDE7 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 24px;
      padding: 48px 40px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
    }
    .logo { font-size: 32px; font-weight: 800; color: #1a1a1a; margin-bottom: 32px; }
    .icon {
      width: 80px; height: 80px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 24px;
    }
    .icon svg { width: 40px; height: 40px; fill: white; }
    .icon-success { background: #4CAF50; }
    .icon-error { background: #F44336; }
    .icon-loading { background: #FFC107; }
    .icon-loading svg { animation: spin 1s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    h1 { font-size: 28px; font-weight: 700; color: #1a1a1a; margin-bottom: 12px; }
    p { font-size: 16px; color: #666; line-height: 1.6; margin-bottom: 32px; }
    .btn {
      display: inline-block;
      background: #FFC107; color: #000;
      font-size: 16px; font-weight: 600;
      padding: 14px 32px; border-radius: 12px;
      text-decoration: none; transition: all 0.2s;
    }
    .btn:hover { background: #FFB300; transform: translateY(-2px); }
    .btn-secondary {
      background: transparent; color: #666;
      border: 1px solid #ddd; margin-top: 12px;
    }
    .btn-secondary:hover { background: #f5f5f5; transform: none; }
    .error-box {
      background: #FFEBEE; color: #C62828;
      padding: 16px; border-radius: 12px; margin-bottom: 24px;
      font-size: 14px;
    }
    #loading-state, #success-state, #error-state { display: none; }
    #loading-state.active, #success-state.active, #error-state.active { display: block; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">VAGO</div>
    
    <div id="loading-state" class="active">
      <div class="icon icon-loading">
        <svg viewBox="0 0 24 24"><path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z"/></svg>
      </div>
      <h1>Verifying...</h1>
      <p>Please wait while we verify your email.</p>
    </div>
    
    <div id="success-state">
      <div class="icon icon-success">
        <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
      </div>
      <h1>Email Verified!</h1>
      <p>Your email has been successfully verified. You can now use all features of VAGO.</p>
      <a href="#" id="open-app-btn" class="btn">Open VAGO App</a>
    </div>
    
    <div id="error-state">
      <div class="icon icon-error">
        <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </div>
      <h1>Verification Failed</h1>
      <div class="error-box" id="error-message">The verification link may have expired or is invalid.</div>
      <p>Please go back to the app and request a new verification email.</p>
      <a href="#" id="retry-btn" class="btn">Open VAGO App</a>
    </div>
  </div>

  <script>
    const APP_SCHEME = 'io.supabase.wanderlog';
    const error = ${JSON.stringify(error)};
    const errorDescription = ${JSON.stringify(errorDescription)};
    const hash = ${JSON.stringify(hash)};
    
    function isMobile() {
      return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    }
    
    function getAppUrl() {
      const currentUrl = window.location.href;
      return APP_SCHEME + '://login-callback' + window.location.search + window.location.hash;
    }
    
    function showState(state) {
      document.getElementById('loading-state').classList.remove('active');
      document.getElementById('success-state').classList.remove('active');
      document.getElementById('error-state').classList.remove('active');
      document.getElementById(state + '-state').classList.add('active');
    }
    
    function setupButtons() {
      const appUrl = getAppUrl();
      const openAppBtn = document.getElementById('open-app-btn');
      const retryBtn = document.getElementById('retry-btn');
      if (openAppBtn) openAppBtn.href = appUrl;
      if (retryBtn) retryBtn.href = appUrl;
    }
    
    document.addEventListener('DOMContentLoaded', () => {
      setupButtons();
      
      if (error) {
        document.getElementById('error-message').textContent = 
          errorDescription || error || 'The verification link may have expired or is invalid.';
        showState('error');
        return;
      }
      
      // 检查是否验证成功
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const queryParams = new URLSearchParams(window.location.search);
      
      const hasToken = hashParams.get('access_token') || queryParams.get('access_token');
      const type = hashParams.get('type') || queryParams.get('type');
      
      if (hasToken || type === 'signup' || type === 'recovery' || type === 'magiclink') {
        // 验证成功
        if (isMobile()) {
          // 尝试打开 App
          window.location.href = getAppUrl();
          setTimeout(() => showState('success'), 2000);
        } else {
          showState('success');
        }
      } else {
        // 没有验证信息，显示成功页面（可能是直接访问）
        showState('success');
      }
    });
  </script>
</body>
</html>`;
}

function getHomepageHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VAGO - Your Personalized Flaneur Guide</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #FFF8E1 0%, #FFFDE7 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      text-align: center;
      max-width: 600px;
    }
    .logo { font-size: 64px; font-weight: 800; color: #1a1a1a; margin-bottom: 16px; }
    .tagline { font-size: 24px; color: #666; margin-bottom: 48px; }
    .coming-soon {
      background: white;
      padding: 24px 48px;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
      display: inline-block;
    }
    .coming-soon p { font-size: 18px; color: #333; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">VAGO</div>
    <p class="tagline">Your own personalized flaneur guide</p>
    <div class="coming-soon">
      <p>🚀 Coming Soon</p>
    </div>
  </div>
</body>
</html>`;
}
