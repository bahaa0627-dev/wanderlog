/**
 * WanderLog Image Service - Cloudflare Worker
 * 处理图片上传、获取和基础变换
 */

export interface Env {
  WANDERLOG_IMAGES: R2Bucket;
  UPLOAD_SECRET: string;
}

// CORS 头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.slice(1); // 移除开头的 /

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 验证上传/删除权限
    if (request.method !== 'GET') {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !validateAuth(authHeader, env.UPLOAD_SECRET)) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }
    }

    try {
      switch (request.method) {
        case 'PUT':
          return await handleUpload(request, env, path);
        case 'GET':
          return await handleGet(request, env, path, url);
        case 'DELETE':
          return await handleDelete(env, path);
        default:
          return jsonResponse({ error: 'Method Not Allowed' }, 405);
      }
    } catch (error: any) {
      console.error('Error:', error);
      return jsonResponse({ error: error.message }, 500);
    }
  },
};

// 验证授权
function validateAuth(authHeader: string, secret: string): boolean {
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    // 简单验证，生产环境建议使用 JWT
    return token === secret;
  }
  return false;
}

// 上传图片
async function handleUpload(
  request: Request,
  env: Env,
  path: string
): Promise<Response> {
  const contentType = request.headers.get('Content-Type') || 'image/jpeg';
  
  // 验证文件类型
  if (!contentType.startsWith('image/')) {
    return jsonResponse({ error: 'Only images are allowed' }, 400);
  }

  const body = await request.arrayBuffer();
  
  // 限制文件大小 (10MB)
  if (body.byteLength > 10 * 1024 * 1024) {
    return jsonResponse({ error: 'File too large (max 10MB)' }, 400);
  }

  await env.WANDERLOG_IMAGES.put(path, body, {
    httpMetadata: {
      contentType,
      cacheControl: 'public, max-age=31536000', // 1年缓存
    },
  });

  const publicUrl = `https://${new URL(request.url).host}/${path}`;
  
  return jsonResponse({
    success: true,
    url: publicUrl,
    path,
    size: body.byteLength,
  });
}

// 获取图片
async function handleGet(
  request: Request,
  env: Env,
  path: string,
  url: URL
): Promise<Response> {
  const object = await env.WANDERLOG_IMAGES.get(path);
  
  if (!object) {
    return jsonResponse({ error: 'Not Found' }, 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=31536000');
  headers.set('ETag', object.etag);
  
  // 添加 CORS
  Object.entries(corsHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  // 检查 If-None-Match
  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch === object.etag) {
    return new Response(null, { status: 304, headers });
  }

  // 简单的图片变换参数 (可选)
  const width = url.searchParams.get('w');
  const height = url.searchParams.get('h');
  const quality = url.searchParams.get('q');
  const format = url.searchParams.get('f');

  // 如果有变换参数，添加 Vary 头
  if (width || height || quality || format) {
    headers.set('Vary', 'Accept');
    // 注意: 实际图片变换需要 Cloudflare Images 或自定义处理
    // 这里只是传递原图，变换逻辑需要额外实现
  }

  return new Response(object.body, { headers });
}

// 删除图片
async function handleDelete(env: Env, path: string): Promise<Response> {
  await env.WANDERLOG_IMAGES.delete(path);
  return jsonResponse({ success: true, deleted: path });
}

// JSON 响应工具
function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}
