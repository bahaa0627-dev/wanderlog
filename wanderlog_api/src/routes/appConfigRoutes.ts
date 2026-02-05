import { Router, Request, Response } from 'express';

const router = Router();

/**
 * App configuration endpoint
 * Returns dynamic configuration that can be updated without app release
 */

// 微信二维码 URL - 可以随时在这里更新
// 当二维码过期时，只需要上传新图片到 CDN 并更新这个 URL
const WECHAT_QR_CODE_URL = 'https://wanderlog-images.s3.amazonaws.com/config/wechat_qr.png';

/**
 * GET /api/app-config
 * Returns app configuration including QR code URL
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: {
        feedbackQrCodeUrl: WECHAT_QR_CODE_URL,
        // 可以在这里添加更多动态配置
        version: '1.0.0',
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('❌ Get app config error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get app config',
    });
  }
});

/**
 * GET /api/app-config/feedback-qr
 * Returns only the feedback QR code URL
 */
router.get('/feedback-qr', async (_req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: {
        url: WECHAT_QR_CODE_URL,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('❌ Get feedback QR error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get feedback QR',
    });
  }
});

export default router;
