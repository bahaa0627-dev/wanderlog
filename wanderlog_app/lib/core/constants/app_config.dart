/// 应用配置 - 可远程更新的配置项
class AppConfig {
  AppConfig._();

  // 微信二维码图片 - 本地备用（当网络加载失败时使用）
  static const String feedbackQrCodeAsset = 'assets/images/wechat_qr.png';

  // 微信二维码远程 URL - 从后端获取，支持动态更新
  static const String feedbackQrCodeApiUrl = '/api/app-config/feedback-qr';
}
