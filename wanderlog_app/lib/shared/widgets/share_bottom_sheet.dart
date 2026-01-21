import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';

/// 分享数据模型
class ShareData {
  const ShareData({
    required this.title,
    required this.url,
    this.description,
    this.imageUrl,
  });

  /// 分享标题
  final String title;
  
  /// 分享链接
  final String url;
  
  /// 分享描述（可选）
  final String? description;
  
  /// 分享图片 URL（可选）
  final String? imageUrl;
}

/// 分享底部弹窗 - 复制链接
class ShareBottomSheet extends StatelessWidget {
  const ShareBottomSheet({
    required this.shareData,
    super.key,
  });

  /// 分享数据
  final ShareData shareData;

  /// 显示分享弹窗
  static Future<void> show(
    BuildContext context, {
    required ShareData shareData,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => ShareBottomSheet(shareData: shareData),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // 拖动指示器
            Container(
              margin: const EdgeInsets.only(top: 12),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppTheme.lightGray,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            
            // 标题
            Padding(
              padding: const EdgeInsets.all(20),
              child: Text(
                'Share',
                style: AppTheme.titleMedium(context).copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            
            // 复制链接按钮
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 8),
              child: GestureDetector(
                onTap: () => _copyLink(context),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 56,
                      height: 56,
                      decoration: BoxDecoration(
                        color: AppTheme.lightGray,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: const Icon(
                        Icons.link,
                        size: 28,
                        color: AppTheme.darkGray,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Copy Link',
                      style: AppTheme.labelSmall(context).copyWith(
                        color: AppTheme.darkGray,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            
            const SizedBox(height: 16),
            
            // 取消按钮
            GestureDetector(
              onTap: () => Navigator.of(context).pop(),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 16),
                margin: const EdgeInsets.symmetric(horizontal: 20),
                decoration: BoxDecoration(
                  color: AppTheme.lightGray,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  'Cancel',
                  textAlign: TextAlign.center,
                  style: AppTheme.bodyMedium(context).copyWith(
                    color: AppTheme.darkGray,
                  ),
                ),
              ),
            ),
            
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  void _copyLink(BuildContext context) {
    Clipboard.setData(ClipboardData(text: shareData.url));
    Navigator.of(context).pop();
    CustomToast.showSuccess(context, 'Link copied');
  }
}
