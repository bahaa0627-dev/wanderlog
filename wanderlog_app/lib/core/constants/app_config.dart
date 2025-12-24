/// 应用配置 - 可远程更新的配置项
class AppConfig {
  AppConfig._();

  // 微信二维码图片 URL - 使用本地 assets
  // 后续可以改为远程 URL，当二维码过期时更新
  static const String feedbackQrCodeAsset = 'assets/images/wechat_qr.png';
}
