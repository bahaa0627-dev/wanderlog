import 'package:flutter/material.dart';
import 'package:wanderlog/core/theme/app_theme.dart';

/// 主要卡片样式 - 带黑色边框和阴影
class PrimaryCard extends StatelessWidget {
  const PrimaryCard({
    required this.child, super.key,
    this.color,
    this.padding,
    this.onTap,
  });

  final Widget child;
  final Color? color;
  final EdgeInsetsGeometry? padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
      onTap: onTap,
      child: Container(
        padding: padding ?? const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: color ?? AppTheme.white,
          borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
          border: Border.all(
            color: AppTheme.black,
            width: AppTheme.borderThick,
          ),
          boxShadow: AppTheme.cardShadow,
        ),
        child: child,
      ),
    );
}

/// 黄色强调卡片 - 主题色背景
class AccentCard extends StatelessWidget {
  const AccentCard({
    required this.child, super.key,
    this.padding,
    this.onTap,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
      onTap: onTap,
      child: Container(
        padding: padding ?? const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: AppTheme.primaryYellow,
          borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
          border: Border.all(
            color: AppTheme.black,
            width: AppTheme.borderThick,
          ),
          boxShadow: AppTheme.strongShadow,
        ),
        child: child,
      ),
    );
}

/// 弱样式卡片 - 无边框，浅色背景
class SubtleCard extends StatelessWidget {
  const SubtleCard({
    required this.child, super.key,
    this.padding,
    this.onTap,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
      onTap: onTap,
      child: Container(
        padding: padding ?? const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppTheme.background,
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
          border: Border.all(
            color: AppTheme.lightGray,
            width: AppTheme.borderThin,
          ),
        ),
        child: child,
      ),
    );
}

/// 主要按钮 - 黄色背景，黑色边框
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    required this.onPressed, required this.text, super.key,
    this.icon,
    this.isLoading = false,
  });

  final VoidCallback? onPressed;
  final String text;
  final IconData? icon;
  final bool isLoading;

  @override
  Widget build(BuildContext context) => Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: isLoading ? null : onPressed,
        borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          decoration: BoxDecoration(
            color: AppTheme.primaryYellow,
            borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
            border: Border.all(
              color: AppTheme.black,
              width: AppTheme.borderThick,
            ),
            boxShadow: AppTheme.cardShadow,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (isLoading)
                const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(AppTheme.black),
                  ),
                )
              else ...[
                if (icon != null) ...[
                  Icon(icon, color: AppTheme.black, size: 20),
                  const SizedBox(width: 8),
                ],
                Text(
                  text,
                  style: AppTheme.labelLarge(context),
                ),
              ],
            ],
          ),
        ),
      ),
    );
}

/// 次要按钮 - 白色背景，黑色边框
class SecondaryButton extends StatelessWidget {
  const SecondaryButton({
    required this.onPressed, required this.text, super.key,
    this.icon,
  });

  final VoidCallback? onPressed;
  final String text;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          decoration: BoxDecoration(
            color: AppTheme.white,
            borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
            border: Border.all(
              color: AppTheme.black,
              width: AppTheme.borderMedium,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                Icon(icon, color: AppTheme.black, size: 20),
                const SizedBox(width: 8),
              ],
              Text(
                text,
                style: AppTheme.labelLarge(context),
              ),
            ],
          ),
        ),
      ),
    );
}

/// 文本按钮 - 无背景
class TextButtonCustom extends StatelessWidget {
  const TextButtonCustom({
    required this.onPressed, required this.text, super.key,
    this.color,
  });

  final VoidCallback? onPressed;
  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) => TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      ),
      child: Text(
        text,
        style: AppTheme.labelMedium(context).copyWith(
          color: color ?? AppTheme.black,
          decoration: TextDecoration.underline,
        ),
      ),
    );
}

/// 搜索框
class SearchBox extends StatelessWidget {
  const SearchBox({
    required this.hintText, super.key,
    this.onChanged,
    this.onTap,
    this.controller,
    this.readOnly = false,
    this.trailingIcon,
    this.onTrailingIconTap,
  });

  final String hintText;
  final ValueChanged<String>? onChanged;
  final VoidCallback? onTap;
  final TextEditingController? controller;
  final bool readOnly;
  final IconData? trailingIcon;
  final VoidCallback? onTrailingIconTap;

  @override
  Widget build(BuildContext context) => Container(
      decoration: BoxDecoration(
        color: AppTheme.white,
        borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
        border: Border.all(
          color: AppTheme.lightGray,
          width: AppTheme.borderThin,
        ),
      ),
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        onTap: onTap,
        readOnly: readOnly,
        style: AppTheme.bodyMedium(context),
        decoration: InputDecoration(
          hintText: hintText,
          hintStyle: AppTheme.bodySmall(context).copyWith(
            color: AppTheme.mediumGray,
          ),
          prefixIcon: const Icon(
            Icons.search,
            color: AppTheme.mediumGray,
            size: 20,
          ),
          suffixIcon: trailingIcon != null
              ? IconButton(
                  icon: Icon(
                    trailingIcon,
                    color: AppTheme.mediumGray,
                    size: 20,
                  ),
                  onPressed: onTrailingIconTap,
                )
              : null,
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 20,
            vertical: 16,
          ),
        ),
      ),
    );
}

/// 标签芯片
class TagChip extends StatelessWidget {
  const TagChip({
    required this.label, super.key,
    this.isSelected = false,
    this.onTap,
    this.color,
  });

  final String label;
  final bool isSelected;
  final VoidCallback? onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) => GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected 
              ? (color ?? AppTheme.primaryYellow)
              : AppTheme.white,
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
          border: Border.all(
            color: isSelected 
                ? AppTheme.black
                : AppTheme.lightGray,
            width: isSelected ? AppTheme.borderMedium : AppTheme.borderThin,
          ),
        ),
        child: Text(
          label,
          style: AppTheme.labelMedium(context).copyWith(
            color: isSelected ? AppTheme.black : AppTheme.darkGray,
          ),
        ),
      ),
    );
}

/// 徽章标签
class CustomBadge extends StatelessWidget {
  const CustomBadge({
    required this.text, super.key,
    this.color,
  });

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color ?? AppTheme.accentPink,
        borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
        border: Border.all(
          color: AppTheme.black,
          width: AppTheme.borderThin,
        ),
      ),
      child: Text(
        text,
        style: AppTheme.labelSmall(context).copyWith(
          color: AppTheme.white,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
}

/// 图标按钮
class IconButtonCustom extends StatelessWidget {
  const IconButtonCustom({
    required this.icon, required this.onPressed, super.key,
    this.size = 48,
    this.backgroundColor,
  });

  final IconData icon;
  final VoidCallback? onPressed;
  final double size;
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) => Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(size / 2),
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: backgroundColor ?? AppTheme.white,
            shape: BoxShape.circle,
            border: Border.all(
              color: AppTheme.black,
              width: AppTheme.borderMedium,
            ),
          ),
          child: Icon(
            icon,
            color: AppTheme.black,
            size: size * 0.5,
          ),
        ),
      ),
    );
}
