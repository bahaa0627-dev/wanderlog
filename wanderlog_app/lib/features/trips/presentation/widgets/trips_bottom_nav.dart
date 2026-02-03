import 'package:flutter/material.dart';
import 'package:wanderlog/core/theme/app_theme.dart';

class TripsBottomNav extends StatelessWidget {
  const TripsBottomNav({
    required this.selectedIndex,
    required this.onItemTapped,
    super.key,
  });

  final int selectedIndex;
  final ValueChanged<int> onItemTapped;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        decoration: const BoxDecoration(
          color: AppTheme.white,
          border: Border(
            top: BorderSide(
              color: AppTheme.black,
              width: AppTheme.borderMedium,
            ),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            _NavItem(
              label: 'Home',
              active: selectedIndex == 0,
              onTap: () => onItemTapped(0),
            ),
            _NavItem(
              label: 'VAGO',
              active: selectedIndex == 1,
              onTap: () => onItemTapped(1),
            ),
            _NavItem(
              label: 'Story',
              active: selectedIndex == 2,
              onTap: () => onItemTapped(2),
            ),
          ],
        ),
      );
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // 使用 20px 字号
    final textStyle = AppTheme.labelLarge(context).copyWith(
      fontSize: 20,
      color: active 
          ? AppTheme.black 
          : AppTheme.black.withOpacity(0.48), // 48% 透明度黑色
    );
    
    // 测量文字大小以确定画笔背景大小
    final textPainter = TextPainter(
      text: TextSpan(text: label, style: textStyle),
      textDirection: TextDirection.ltr,
    );
    textPainter.layout();
    
    final textWidth = textPainter.width;
    final textHeight = textPainter.height;
    
    // 计算固定尺寸，确保文字位置不变
    final containerWidth = textWidth + 40; // 文字宽度 + 左右 padding
    final containerHeight = 50.0; // 固定高度
    
    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
        // 固定宽度和高度，确保文字位置完全不变
        width: containerWidth,
        height: containerHeight,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            // 画笔样式背景（选中时）- 使用图片，根据文字大小自适应
            if (active)
              Positioned(
                // 完全居中，不影响文字位置
                left: (containerWidth - (textWidth + 32)) / 2,
                top: (containerHeight - (textHeight + 20)) / 2,
                child: SizedBox(
                  width: textWidth + 32, // 文字宽度 + 左右边距
                  height: textHeight + 20, // 文字高度 + 上下边距
                  child: Image.asset(
                    'assets/images/pencil.jpg',
                    fit: BoxFit.contain,
                  ),
                ),
              ),
            // 文字 - 使用 Positioned 精确定位在中心，确保位置不变
            Positioned(
              left: (containerWidth - textWidth) / 2,
              top: (containerHeight - textHeight) / 2,
              child: Text(
                label,
                style: textStyle,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

