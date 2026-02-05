/**
 * VAGO Website - Cloudflare Worker
 * 处理 vago.to 的页面请求
 */

// API 基础地址
const API_BASE_URL = 'https://wanderlog-production.up.railway.app/api';

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

    // 合集详情页面 - /collection/:id
    const collectionMatch = path.match(/^\/collection\/([a-zA-Z0-9-]+)$/);
    if (collectionMatch) {
      const collectionId = collectionMatch[1];
      return await handleCollectionPage(collectionId);
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

/**
 * 处理合集页面请求
 */
async function handleCollectionPage(collectionId: string): Promise<Response> {
  try {
    // 从 API 获取合集数据
    const response = await fetch(`${API_BASE_URL}/collections/${collectionId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return new Response(getCollectionNotFoundHTML(), {
          status: 404,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      throw new Error(`API error: ${response.status}`);
    }
    
    const result = await response.json() as { success: boolean; data: any };
    if (!result.success || !result.data) {
      return new Response(getCollectionNotFoundHTML(), {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    
    const collection = result.data;
    
    return new Response(getCollectionPageHTML(collection, collectionId), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error) {
    console.error('Error fetching collection:', error);
    return new Response(getCollectionErrorHTML(), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

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
    const APP_SCHEME = 'io.supabase.vago';
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

/**
 * 合集页面 HTML
 */
function getCollectionPageHTML(collection: any, collectionId: string): string {
  const name = escapeHtml(collection.name || 'Collection');
  const description = escapeHtml(collection.description || '');
  const coverImage = collection.coverImage || '';
  const spots = collection.collectionSpots || [];
  const spotCount = spots.length;
  
  // 构建地点卡片 HTML
  const spotsHTML = spots.slice(0, 10).map((cs: any) => {
    const spot = cs.spot || cs.place;
    if (!spot) return '';
    
    const spotName = escapeHtml(spot.name || '');
    const spotCity = escapeHtml(spot.city || '');
    const spotImage = spot.coverImage || '';
    const spotRating = spot.rating ? spot.rating.toFixed(1) : '';
    
    return `
      <div class="spot-card" data-spot-id="${spot.id}" onclick="handleSpotClick('${spot.id}')">
        <div class="spot-image" style="background-image: url('${spotImage}')">
          ${!spotImage ? '<div class="spot-placeholder">📍</div>' : ''}
        </div>
        <div class="spot-info">
          <div class="spot-name">${spotName}</div>
          <div class="spot-meta">
            ${spotCity ? `<span class="spot-city">📍 ${spotCity}</span>` : ''}
            ${spotRating ? `<span class="spot-rating">⭐ ${spotRating}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${name} - VAGO</title>
  
  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${name}">
  <meta property="og:description" content="${description || `Explore ${spotCount} curated spots`}">
  <meta property="og:image" content="${coverImage}">
  <meta property="og:url" content="https://vago.to/collection/${collectionId}">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${name}">
  <meta name="twitter:description" content="${description || `Explore ${spotCount} curated spots`}">
  <meta name="twitter:image" content="${coverImage}">
  
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Hiragino Sans GB', sans-serif;
      background: #f8f9fa;
      min-height: 100vh;
      padding-bottom: 100px;
    }
    
    /* 顶部封面 */
    .cover {
      position: relative;
      width: 100%;
      height: 280px;
      background-size: cover;
      background-position: center;
      background-color: #ddd;
    }
    
    .cover-overlay {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 50%;
      background: linear-gradient(transparent, rgba(0,0,0,0.7));
    }
    
    .cover-content {
      position: absolute;
      bottom: 20px;
      left: 20px;
      right: 20px;
      color: white;
    }
    
    .collection-name {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 8px;
      text-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    
    .collection-meta {
      font-size: 14px;
      opacity: 0.9;
    }
    
    /* 描述区域 */
    .description {
      padding: 20px;
      background: white;
      margin: 16px;
      border-radius: 16px;
      border: 2px solid #000;
      box-shadow: 3px 3px 0 #000;
    }
    
    .description-text {
      font-size: 15px;
      color: #333;
      line-height: 1.6;
    }
    
    /* 地点列表 */
    .spots-section {
      padding: 0 16px;
      margin-top: 16px;
    }
    
    .section-title {
      font-size: 18px;
      font-weight: 700;
      color: #000;
      margin-bottom: 16px;
    }
    
    .spots-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      padding-bottom: 8px;
      padding-right: 4px;
    }
    
    .spot-card {
      background: white;
      border-radius: 16px;
      overflow: hidden;
      border: 2px solid #000;
      box-shadow: 3px 3px 0 #000;
      cursor: pointer;
      transition: transform 0.1s, box-shadow 0.1s;
    }
    
    .spot-card:active {
      transform: translate(2px, 2px);
      box-shadow: 1px 1px 0 #000;
    }
    
    .spot-image {
      width: 100%;
      height: 120px;
      background-size: cover;
      background-position: center;
      background-color: #eee;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .spot-placeholder {
      font-size: 32px;
    }
    
    .spot-info {
      padding: 12px;
    }
    
    .spot-name {
      font-size: 14px;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 6px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .spot-meta {
      font-size: 12px;
      color: #666;
      display: flex;
      gap: 8px;
    }
    
    /* 底部固定按钮 */
    .bottom-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: white;
      padding: 16px 20px;
      padding-bottom: max(20px, calc(env(safe-area-inset-bottom) + 8px));
      border-top: 2px solid #000;
      display: flex;
      gap: 12px;
    }
    
    .btn {
      flex: 1;
      height: 52px;
      border-radius: 26px;
      font-size: 16px;
      font-weight: 700;
      border: 2px solid #000;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: transform 0.1s, box-shadow 0.1s;
      box-shadow: 3px 3px 0 #000;
    }
    
    .btn:active {
      transform: translate(2px, 2px);
      box-shadow: 1px 1px 0 #000;
    }
    
    .btn-primary {
      background: #FFD60A;
      color: #000;
    }
    
    .btn-secondary {
      background: #f0f0f0;
      color: #333;
    }
    
    /* Toast 提示 */
    .toast {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 16px 24px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 1000;
      display: none;
    }
    
    .toast.show {
      display: block;
      animation: fadeInOut 2s ease;
    }
    
    @keyframes fadeInOut {
      0% { opacity: 0; }
      20% { opacity: 1; }
      80% { opacity: 1; }
      100% { opacity: 0; }
    }
    
    /* 返回顶部按钮 */
    .back-btn {
      position: absolute;
      top: max(12px, env(safe-area-inset-top));
      left: 12px;
      width: 36px;
      height: 36px;
      background: rgba(255,255,255,0.9);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 10;
    }
  </style>
</head>
<body>
  <!-- 封面 -->
  <div class="cover" style="background-image: url('${coverImage}')">
    <div class="cover-overlay"></div>
    <div class="cover-content">
      <div class="collection-name">${name}</div>
      <div class="collection-meta">${spotCount} spots</div>
    </div>
  </div>
  
  <!-- 描述 -->
  ${description ? `
  <div class="description">
    <p class="description-text">${description}</p>
  </div>
  ` : ''}
  
  <!-- 地点列表 -->
  <div class="spots-section">
    <div class="spots-grid">
      ${spotsHTML}
    </div>
  </div>
  
  <!-- 底部按钮 -->
  <div class="bottom-bar">
    <button class="btn btn-primary" onclick="openApp()">
      <span>Open in App</span>
    </button>
  </div>
  
  <!-- Toast -->
  <div id="toast" class="toast"></div>
  
  <script>
    const APP_SCHEME = 'io.supabase.wanderlog';
    const COLLECTION_ID = '${collectionId}';
    const APP_STORE_URL = 'https://apps.apple.com/app/vago/id123456789'; // TODO: 替换为真实 App Store 链接
    const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=io.supabase.wanderlog'; // TODO: 替换为真实链接
    
    function isMobile() {
      return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    }
    
    function isIOS() {
      return /iPhone|iPad|iPod/i.test(navigator.userAgent);
    }
    
    function isAndroid() {
      return /Android/i.test(navigator.userAgent);
    }
    
    function getAppUrl(path) {
      return APP_SCHEME + '://' + path;
    }
    
    function showToast(message) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    }
    
    function openApp() {
      const appUrl = getAppUrl('collection/' + COLLECTION_ID);
      
      if (isMobile()) {
        // 尝试打开 App
        const startTime = Date.now();
        window.location.href = appUrl;
        
        // 如果 2 秒后还在页面上，说明 App 没有安装，跳转应用商店
        setTimeout(() => {
          if (Date.now() - startTime < 2500) {
            if (isIOS()) {
              window.location.href = APP_STORE_URL;
            } else if (isAndroid()) {
              window.location.href = ANDROID_STORE_URL;
            }
          }
        }, 2000);
      } else {
        // 桌面端显示提示
        showToast('Please open this page on your phone');
      }
    }
    
    function handleSpotClick(spotId) {
      const appUrl = getAppUrl('spot/' + spotId);
      
      if (isMobile()) {
        window.location.href = appUrl;
        setTimeout(() => {
          showToast('Opening VAGO...');
        }, 500);
      } else {
        showToast('Please open this page on your phone');
      }
    }
    
    function handleShare() {
      const url = window.location.href;
      
      if (navigator.share) {
        navigator.share({
          title: '${name}',
          text: '${description || `Explore ${spotCount} curated spots`}',
          url: url,
        }).catch(() => {
          copyToClipboard(url);
        });
      } else {
        copyToClipboard(url);
      }
    }
    
    function copyToClipboard(text) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
          showToast('Link copied');
        });
      } else {
        // Fallback
        const input = document.createElement('input');
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('Link copied');
      }
    }
  </script>
</body>
</html>`;
}

/**
 * 合集未找到页面
 */
function getCollectionNotFoundHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Collection Not Found - VAGO</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8f9fa;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      text-align: center;
      max-width: 400px;
    }
    .icon { font-size: 64px; margin-bottom: 24px; }
    h1 { font-size: 24px; color: #1a1a1a; margin-bottom: 12px; }
    p { font-size: 16px; color: #666; margin-bottom: 32px; }
    .btn {
      display: inline-block;
      background: #FFC107;
      color: #000;
      font-size: 16px;
      font-weight: 600;
      padding: 14px 32px;
      border-radius: 24px;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🔍</div>
    <h1>Collection Not Found</h1>
    <p>This collection may have been deleted or the link is invalid</p>
    <a href="/" class="btn">Back to Home</a>
  </div>
</body>
</html>`;
}

/**
 * 合集加载错误页面
 */
function getCollectionErrorHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Loading Failed - VAGO</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8f9fa;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      text-align: center;
      max-width: 400px;
    }
    .icon { font-size: 64px; margin-bottom: 24px; }
    h1 { font-size: 24px; color: #1a1a1a; margin-bottom: 12px; }
    p { font-size: 16px; color: #666; margin-bottom: 32px; }
    .btn {
      display: inline-block;
      background: #FFC107;
      color: #000;
      font-size: 16px;
      font-weight: 600;
      padding: 14px 32px;
      border-radius: 24px;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">⚠️</div>
    <h1>Loading Failed</h1>
    <p>Network error, please try again later</p>
    <a href="javascript:location.reload()" class="btn">Reload</a>
  </div>
</body>
</html>`;
}

/**
 * HTML 转义
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
