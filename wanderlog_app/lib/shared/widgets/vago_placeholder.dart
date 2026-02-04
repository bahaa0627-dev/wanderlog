import 'package:flutter/material.dart';
import 'package:wanderlog/core/theme/app_theme.dart';

/// VAGO 品牌占位符组件
/// 用于图片加载失败或未加载时显示
/// 淡灰色背景 + 中间 VAGO 文字 logo (Reem Kufi 字体)
class VagoPlaceholder extends StatelessWidget {
  const VagoPlaceholder({
    super.key,
    this.fontSize = 24,
    this.textColor,
    this.backgroundColor,
    this.showIcon = false,
    this.icon,
    this.iconSize = 32,
  });

  /// 占位符默认背景色 - 浅灰色，与合集卡片保持一致
  static const Color defaultBackgroundColor = Color(0xFFF2F2F2);

  /// 文字大小
  final double fontSize;

  /// 文字颜色，默认为 mediumGray
  final Color? textColor;

  /// 背景颜色，默认为浅灰色 (0xFFF2F2F2)
  final Color? backgroundColor;

  /// 是否显示图标（在 VAGO 文字上方）
  final bool showIcon;

  /// 自定义图标
  final IconData? icon;

  /// 图标大小
  final double iconSize;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: backgroundColor ?? defaultBackgroundColor,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (showIcon) ...[
              Icon(
                icon ?? Icons.image_outlined,
                size: iconSize,
                color: textColor ?? AppTheme.mediumGray,
              ),
              const SizedBox(height: 8),
            ],
            Text(
              'VAGO',
              style: TextStyle(
                fontFamily: 'ReemKufi',
                fontSize: fontSize,
                fontWeight: FontWeight.w600,
                color: textColor ?? AppTheme.mediumGray,
                letterSpacing: 2,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 小尺寸 VAGO 占位符（用于卡片、缩略图等）
class VagoPlaceholderSmall extends StatelessWidget {
  const VagoPlaceholderSmall({super.key});

  @override
  Widget build(BuildContext context) {
    return const VagoPlaceholder(fontSize: 14);
  }
}

/// 中等尺寸 VAGO 占位符（用于列表项、网格等）
class VagoPlaceholderMedium extends StatelessWidget {
  const VagoPlaceholderMedium({super.key});

  @override
  Widget build(BuildContext context) {
    return const VagoPlaceholder(fontSize: 20);
  }
}

/// 大尺寸 VAGO 占位符（用于全屏、详情页等）
class VagoPlaceholderLarge extends StatelessWidget {
  const VagoPlaceholderLarge({super.key});

  @override
  Widget build(BuildContext context) {
    return const VagoPlaceholder(fontSize: 32, showIcon: true, iconSize: 48);
  }
}
