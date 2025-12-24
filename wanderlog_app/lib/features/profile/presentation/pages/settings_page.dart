import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_gallery_saver/image_gallery_saver.dart';
import 'package:permission_handler/permission_handler.dart';

import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/core/providers/locale_provider.dart';
import 'package:wanderlog/core/l10n/app_localizations.dart';
import 'package:wanderlog/core/constants/app_config.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = ref.watch(localeProvider);
    final l10n = AppLocalizations(locale.languageCode);
    final authState = ref.watch(authProvider);
    final isLoggedIn = authState.isAuthenticated;
    final user = authState.user;
    final currentLanguage = ref.watch(localeProvider.notifier).currentLanguage;

    return Scaffold(
      backgroundColor: AppTheme.white,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 标题
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
              child: Text(
                l10n.settingsTitle,
                style: AppTheme.displayLarge(context),
              ),
            ),
            // 内容列表
            Expanded(
              child: ListView(
                padding: EdgeInsets.zero,
                children: [
                  // Account
                  _SettingsItem(
                    title: l10n.accountTitle,
                    subtitle: isLoggedIn 
                        ? '📮 ${user?.email ?? ""}' 
                        : l10n.accountNotLoggedIn,
                    showArrow: true,
                    onTap: () => isLoggedIn
                        ? _showLogoutDialog(context, ref, l10n)
                        : context.push('/login'),
                  ),
                  const _Divider(),

                  // Membership
                  _SettingsItem(
                    title: l10n.membershipTitle,
                    trailing: Text(
                      l10n.membershipComingSoon,
                      style: AppTheme.bodySmall(context),
                    ),
                    customContent: Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: AppTheme.primaryYellow,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: AppTheme.black, width: 1.5),
                        ),
                        child: Text(
                          l10n.membershipFree,
                          style: AppTheme.labelSmall(context).copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const _Divider(),

                  // Language
                  _SettingsItem(
                    title: l10n.languageTitle,
                    subtitle: currentLanguage == AppLanguage.english 
                        ? 'English' 
                        : '中文',
                    showArrow: true,
                    onTap: () => _showLanguageSheet(context, ref, l10n, currentLanguage),
                  ),
                  const _Divider(),

                  // Feedback
                  _SettingsItem(
                    title: l10n.feedbackTitle,
                    subtitle: l10n.feedbackDescription,
                    showArrow: true,
                    onTap: () => _showFeedbackDialog(context, l10n),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showLogoutDialog(BuildContext context, WidgetRef ref, AppLocalizations l10n) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppTheme.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
          side: const BorderSide(color: AppTheme.black, width: 2),
        ),
        title: Text(l10n.logoutTitle, style: AppTheme.headlineMedium(context)),
        content: Text(l10n.logoutConfirm, style: AppTheme.bodyMedium(context)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(l10n.cancel, style: const TextStyle(color: AppTheme.mediumGray)),
          ),
          TextButton(
            onPressed: () async {
              Navigator.of(context).pop();
              await ref.read(authProvider.notifier).logout();
              if (context.mounted) {
                CustomToast.showSuccess(context, l10n.logoutSuccess);
              }
            },
            child: Text(l10n.confirm, style: const TextStyle(color: AppTheme.error)),
          ),
        ],
      ),
    );
  }

  void _showLanguageSheet(
    BuildContext context, 
    WidgetRef ref, 
    AppLocalizations l10n,
    AppLanguage currentLanguage,
  ) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppTheme.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(l10n.languageTitle, style: AppTheme.headlineMedium(context)),
              const SizedBox(height: 20),
              _LanguageOption(
                label: 'English',
                isSelected: currentLanguage == AppLanguage.english,
                onTap: () {
                  ref.read(localeProvider.notifier).setLocale(AppLanguage.english);
                  Navigator.of(context).pop();
                },
              ),
              const SizedBox(height: 12),
              _LanguageOption(
                label: '中文',
                isSelected: currentLanguage == AppLanguage.chinese,
                onTap: () {
                  ref.read(localeProvider.notifier).setLocale(AppLanguage.chinese);
                  Navigator.of(context).pop();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showFeedbackDialog(BuildContext context, AppLocalizations l10n) {
    showDialog<void>(
      context: context,
      builder: (context) => _FeedbackDialog(l10n: l10n),
    );
  }
}

class _SettingsItem extends StatelessWidget {
  const _SettingsItem({
    required this.title,
    this.subtitle,
    this.trailing,
    this.customContent,
    this.showArrow = false,
    this.onTap,
  });

  final String title;
  final String? subtitle;
  final Widget? trailing;
  final Widget? customContent;
  final bool showArrow;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: AppTheme.headlineMedium(context),
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        subtitle!,
                        style: AppTheme.bodySmall(context),
                      ),
                    ],
                    if (customContent != null) customContent!,
                  ],
                ),
              ),
              if (trailing != null) trailing!,
              if (showArrow)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    '>',
                    style: AppTheme.headlineMedium(context).copyWith(
                      color: AppTheme.black,
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
}

class _Divider extends StatelessWidget {
  const _Divider();

  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.symmetric(horizontal: 20),
        child: Divider(height: 1, color: AppTheme.lightGray),
      );
}

class _LanguageOption extends StatelessWidget {
  const _LanguageOption({
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: isSelected ? AppTheme.primaryYellow : AppTheme.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isSelected ? AppTheme.black : AppTheme.lightGray,
              width: isSelected ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              Text(
                label,
                style: AppTheme.bodyMedium(context).copyWith(
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                ),
              ),
              const Spacer(),
              if (isSelected)
                const Icon(Icons.check, color: AppTheme.black, size: 20),
            ],
          ),
        ),
      );
}

class _FeedbackDialog extends StatefulWidget {
  const _FeedbackDialog({required this.l10n});

  final AppLocalizations l10n;

  @override
  State<_FeedbackDialog> createState() => _FeedbackDialogState();
}

class _FeedbackDialogState extends State<_FeedbackDialog> {
  bool _isSaving = false;
  Uint8List? _imageBytes;

  @override
  void initState() {
    super.initState();
    _loadImage();
  }

  Future<void> _loadImage() async {
    try {
      final data = await rootBundle.load(AppConfig.feedbackQrCodeAsset);
      setState(() {
        _imageBytes = data.buffer.asUint8List();
      });
    } catch (e) {
      debugPrint('Failed to load QR code image: $e');
    }
  }

  Future<void> _saveToAlbum() async {
    if (_imageBytes == null) {
      // 如果还没加载图片，先加载
      await _loadImage();
      if (_imageBytes == null) {
        if (mounted) {
          CustomToast.showError(context, widget.l10n.saveFailed);
        }
        return;
      }
    }

    setState(() => _isSaving = true);

    try {
      // iOS 上直接保存，不需要显式请求权限
      // image_gallery_saver 会自动处理权限
      final result = await ImageGallerySaver.saveImage(
        _imageBytes!,
        quality: 100,
        name: 'vago_wechat_qr_${DateTime.now().millisecondsSinceEpoch}',
      );

      debugPrint('Save result: $result');

      if (mounted) {
        // 检查保存结果
        final isSuccess = result['isSuccess'] == true || 
                          result['isSuccess'] == 'true' ||
                          (result['filePath'] != null && result['filePath'].toString().isNotEmpty);
        
        if (isSuccess) {
          CustomToast.showSuccess(context, widget.l10n.saveSuccess);
        } else {
          // 可能是权限问题，尝试请求权限后重试
          final status = await Permission.photosAddOnly.request();
          if (status.isGranted || status.isLimited) {
            // 重试保存
            final retryResult = await ImageGallerySaver.saveImage(
              _imageBytes!,
              quality: 100,
              name: 'vago_wechat_qr_${DateTime.now().millisecondsSinceEpoch}',
            );
            debugPrint('Retry save result: $retryResult');
            
            final retrySuccess = retryResult['isSuccess'] == true || 
                                 retryResult['isSuccess'] == 'true' ||
                                 (retryResult['filePath'] != null && retryResult['filePath'].toString().isNotEmpty);
            
            if (retrySuccess) {
              CustomToast.showSuccess(context, widget.l10n.saveSuccess);
            } else {
              CustomToast.showError(context, widget.l10n.saveFailed);
            }
          } else {
            CustomToast.showError(context, widget.l10n.permissionDenied);
          }
        }
      }
    } catch (e) {
      debugPrint('Save to album error: $e');
      if (mounted) {
        CustomToast.showError(context, widget.l10n.saveFailed);
      }
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) => Dialog(
        backgroundColor: Colors.transparent,
        child: Container(
          decoration: BoxDecoration(
            color: AppTheme.white,
            borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
            border: Border.all(color: AppTheme.black, width: 2),
            boxShadow: const [
              BoxShadow(
                color: AppTheme.black,
                offset: Offset(2, 4),
                blurRadius: 0,
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // 关闭按钮
                Align(
                  alignment: Alignment.topRight,
                  child: GestureDetector(
                    onTap: () => Navigator.of(context).pop(),
                    child: const Icon(Icons.close, color: AppTheme.mediumGray),
                  ),
                ),
                // 标题 - 👋🏻 Ciao
                const Text(
                  '👋🏻 Ciao',
                  style: TextStyle(
                    fontFamily: 'ReemKufi',
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.black,
                  ),
                ),
                const SizedBox(height: 8),
                // 描述 - scan the QR code / welcome to the VAGO world
                Text(
                  'scan the QR code',
                  style: AppTheme.bodyMedium(context).copyWith(
                    color: AppTheme.darkGray,
                  ),
                  textAlign: TextAlign.center,
                ),
                Text(
                  'welcome to the VAGO world',
                  style: AppTheme.bodyMedium(context).copyWith(
                    color: AppTheme.darkGray,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
                // 二维码图片 - 使用本地 asset
                Container(
                  width: 180,
                  height: 180,
                  decoration: BoxDecoration(
                    color: AppTheme.white,
                    borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                    child: Image.asset(
                      AppConfig.feedbackQrCodeAsset,
                      fit: BoxFit.contain,
                      errorBuilder: (context, error, stackTrace) => const Center(
                        child: Icon(Icons.qr_code, size: 80, color: AppTheme.mediumGray),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                // 保存按钮 - Neo Brutalism 黄色样式
                GestureDetector(
                  onTap: _isSaving ? null : _saveToAlbum,
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    decoration: BoxDecoration(
                      color: _isSaving ? AppTheme.lightGray : AppTheme.primaryYellow,
                      borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                      border: Border.all(color: AppTheme.black, width: 2),
                      boxShadow: _isSaving
                          ? null
                          : const [
                              BoxShadow(
                                color: AppTheme.black,
                                offset: Offset(2, 4),
                                blurRadius: 0,
                              ),
                            ],
                    ),
                    child: Center(
                      child: _isSaving
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Text(
                              widget.l10n.saveToAlbum,
                              style: AppTheme.labelLarge(context),
                            ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
}
