import 'dart:io';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_gallery_saver/image_gallery_saver.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';

import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/core/providers/locale_provider.dart';
import 'package:wanderlog/core/l10n/app_localizations.dart';
import 'package:wanderlog/core/constants/app_config.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/trips/providers/image_upload_provider.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';
import 'package:wanderlog/core/providers/dio_provider.dart';

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = ref.watch(localeProvider);
    final l10n = AppLocalizations(locale.languageCode);
    final authState = ref.watch(authProvider);
    final isLoggedIn = authState.isAuthenticated;
    final user = authState.user;

    return Scaffold(
      backgroundColor: AppTheme.white,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header with back button
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 16, 20, 16),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back, color: AppTheme.black),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    l10n.settingsTitle,
                    style: AppTheme.displayLarge(context),
                  ),
                ],
              ),
            ),
            // Content list
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
                    onTap: () {
                      if (isLoggedIn) {
                        _showLogoutDialog(context, ref, l10n);
                      } else {
                        context.push('/login');
                      }
                    },
                  ),
                  const _Divider(),

                  // Recommend Place (replaces Language)
                  _SettingsItem(
                    title: l10n.recommendPlaceTitle,
                    subtitle: l10n.recommendPlaceDescription,
                    showArrow: true,
                    onTap: () => _showRecommendPlaceDialog(context, ref, l10n),
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

            // Delete Account - only show when logged in, fixed at bottom
            if (isLoggedIn)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Center(
                  child: GestureDetector(
                    onTap: () => _showDeleteAccountDialog(context, ref, l10n),
                    child: Text(
                      l10n.deleteAccountTitle,
                      style: AppTheme.bodySmall(context).copyWith(
                        color: AppTheme.mediumGray,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  void _showLogoutDialog(
    BuildContext context,
    WidgetRef ref,
    AppLocalizations l10n,
  ) {
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
            child: Text(
              l10n.cancel,
              style: const TextStyle(color: AppTheme.mediumGray),
            ),
          ),
          TextButton(
            onPressed: () async {
              Navigator.of(context).pop();
              await ref.read(authProvider.notifier).logout();
              if (context.mounted) {
                CustomToast.showSuccess(context, l10n.logoutSuccess);
              }
            },
            child: Text(
              l10n.confirm,
              style: const TextStyle(color: AppTheme.error),
            ),
          ),
        ],
      ),
    );
  }

  void _showFeedbackDialog(BuildContext context, AppLocalizations l10n) {
    showDialog<void>(
      context: context,
      builder: (context) => _FeedbackDialog(l10n: l10n),
    );
  }

  void _showRecommendPlaceDialog(
    BuildContext context,
    WidgetRef ref,
    AppLocalizations l10n,
  ) {
    showDialog<void>(
      context: context,
      builder: (context) => _RecommendPlaceDialog(l10n: l10n, ref: ref),
    );
  }

  void _showDeleteAccountDialog(
    BuildContext context,
    WidgetRef ref,
    AppLocalizations l10n,
  ) {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppTheme.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
          side: const BorderSide(color: AppTheme.black, width: 2),
        ),
        title: Text(
          l10n.deleteAccountConfirmTitle,
          style: AppTheme.headlineMedium(dialogContext),
        ),
        content: Text(
          l10n.deleteAccountConfirmMessage,
          style: AppTheme.bodyMedium(dialogContext),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text(
              l10n.cancel,
              style: const TextStyle(color: AppTheme.mediumGray),
            ),
          ),
          TextButton(
            onPressed: () async {
              Navigator.of(dialogContext).pop();
              // Show loading indicator
              showDialog<void>(
                context: context,
                barrierDismissible: false,
                builder: (loadingContext) => AlertDialog(
                  backgroundColor: AppTheme.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                    side: const BorderSide(color: AppTheme.black, width: 2),
                  ),
                  content: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const CircularProgressIndicator(
                        color: AppTheme.black,
                        strokeWidth: 2,
                      ),
                      const SizedBox(width: 16),
                      Text(l10n.deleting,
                          style: AppTheme.bodyMedium(loadingContext)),
                    ],
                  ),
                ),
              );

              try {
                await ref.read(authProvider.notifier).deleteAccount();
                if (context.mounted) {
                  Navigator.of(context).pop(); // Close loading dialog
                  Navigator.of(context).pop(); // Close settings page
                  CustomToast.showSuccess(context, l10n.deleteAccountSuccess);
                }
              } catch (e) {
                if (context.mounted) {
                  Navigator.of(context).pop(); // Close loading dialog
                  CustomToast.showError(context, l10n.deleteAccountFailed);
                }
              }
            },
            child: Text(
              l10n.confirm,
              style: const TextStyle(color: AppTheme.error),
            ),
          ),
        ],
      ),
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

class _FeedbackDialog extends ConsumerStatefulWidget {
  const _FeedbackDialog({required this.l10n});

  final AppLocalizations l10n;

  @override
  ConsumerState<_FeedbackDialog> createState() => _FeedbackDialogState();
}

class _FeedbackDialogState extends ConsumerState<_FeedbackDialog> {
  bool _isSaving = false;
  Uint8List? _imageBytes;
  String? _remoteQrCodeUrl;
  bool _isLoadingFromRemote = true;

  @override
  void initState() {
    super.initState();
    _loadQrCode();
  }

  /// 优先从后端获取二维码 URL，失败则使用本地 asset
  Future<void> _loadQrCode() async {
    try {
      // 尝试从后端获取最新的二维码 URL
      final dio = ref.read(dioProvider);
      final response =
          await dio.get<Map<String, dynamic>>('api/app-config/feedback-qr');

      if (response.statusCode == 200 && response.data?['success'] == true) {
        final url = response.data?['data']?['url'] as String?;
        if (url != null && url.isNotEmpty) {
          setState(() {
            _remoteQrCodeUrl = url;
            _isLoadingFromRemote = false;
          });
          // 预加载远程图片用于保存
          await _loadRemoteImage(url);
          return;
        }
      }
    } catch (e) {
      debugPrint('Failed to fetch QR code from API: $e');
    }

    // 回退到本地 asset
    setState(() {
      _isLoadingFromRemote = false;
    });
    await _loadLocalImage();
  }

  Future<void> _loadRemoteImage(String url) async {
    try {
      final dio = Dio();
      final response = await dio.get<List<int>>(
        url,
        options: Options(responseType: ResponseType.bytes),
      );
      if (response.data != null) {
        setState(() {
          _imageBytes = Uint8List.fromList(response.data!);
        });
      }
    } catch (e) {
      debugPrint('Failed to load remote QR code image: $e');
      // 如果远程图片加载失败，回退到本地
      await _loadLocalImage();
    }
  }

  Future<void> _loadLocalImage() async {
    try {
      final data = await rootBundle.load(AppConfig.feedbackQrCodeAsset);
      setState(() {
        _imageBytes = data.buffer.asUint8List();
      });
    } catch (e) {
      debugPrint('Failed to load local QR code image: $e');
    }
  }

  Future<void> _saveToAlbum() async {
    if (_imageBytes == null) {
      await _loadLocalImage();
      if (_imageBytes == null) {
        if (mounted) {
          CustomToast.showError(context, widget.l10n.saveFailed);
        }
        return;
      }
    }

    setState(() => _isSaving = true);

    try {
      final result = await ImageGallerySaver.saveImage(
        _imageBytes!,
        quality: 100,
        name: 'vago_wechat_qr_${DateTime.now().millisecondsSinceEpoch}',
      );

      debugPrint('Save result: $result');

      if (mounted) {
        final isSuccess = result['isSuccess'] == true ||
            result['isSuccess'] == 'true' ||
            (result['filePath'] != null &&
                result['filePath'].toString().isNotEmpty);

        if (isSuccess) {
          CustomToast.showSuccess(context, widget.l10n.saveSuccess);
        } else {
          final status = await Permission.photosAddOnly.request();
          if (status.isGranted || status.isLimited) {
            final retryResult = await ImageGallerySaver.saveImage(
              _imageBytes!,
              quality: 100,
              name: 'vago_wechat_qr_${DateTime.now().millisecondsSinceEpoch}',
            );
            debugPrint('Retry save result: $retryResult');

            final retrySuccess = retryResult['isSuccess'] == true ||
                retryResult['isSuccess'] == 'true' ||
                (retryResult['filePath'] != null &&
                    retryResult['filePath'].toString().isNotEmpty);

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
                // Close button
                Align(
                  alignment: Alignment.topRight,
                  child: GestureDetector(
                    onTap: () => Navigator.of(context).pop(),
                    child: const Icon(Icons.close, color: AppTheme.mediumGray),
                  ),
                ),
                // Title
                const Text(
                  '✋ Ciao',
                  style: TextStyle(
                    fontFamily: 'ReemKufi',
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.black,
                  ),
                ),
                const SizedBox(height: 8),
                // Description
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
                // QR code image - 优先显示远程图片，失败则显示本地 asset
                Container(
                  width: 180,
                  height: 180,
                  decoration: BoxDecoration(
                    color: AppTheme.white,
                    borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                    child: _isLoadingFromRemote
                        ? const Center(
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppTheme.primaryYellow,
                            ),
                          )
                        : _remoteQrCodeUrl != null
                            ? CachedNetworkImage(
                                imageUrl: _remoteQrCodeUrl!,
                                fit: BoxFit.contain,
                                placeholder: (context, url) => const Center(
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: AppTheme.primaryYellow,
                                  ),
                                ),
                                errorWidget: (context, url, error) =>
                                    Image.asset(
                                  AppConfig.feedbackQrCodeAsset,
                                  fit: BoxFit.contain,
                                  errorBuilder: (context, error, stackTrace) =>
                                      const Center(
                                    child: Icon(Icons.qr_code,
                                        size: 80, color: AppTheme.mediumGray),
                                  ),
                                ),
                              )
                            : Image.asset(
                                AppConfig.feedbackQrCodeAsset,
                                fit: BoxFit.contain,
                                errorBuilder: (context, error, stackTrace) =>
                                    const Center(
                                  child: Icon(Icons.qr_code,
                                      size: 80, color: AppTheme.mediumGray),
                                ),
                              ),
                  ),
                ),
                const SizedBox(height: 24),
                // Save button
                GestureDetector(
                  onTap: _isSaving ? null : _saveToAlbum,
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    decoration: BoxDecoration(
                      color: _isSaving
                          ? AppTheme.lightGray
                          : AppTheme.primaryYellow,
                      borderRadius:
                          BorderRadius.circular(AppTheme.radiusMedium),
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

class _RecommendPlaceDialog extends ConsumerStatefulWidget {
  const _RecommendPlaceDialog({required this.l10n, required this.ref});

  final AppLocalizations l10n;
  final WidgetRef ref;

  @override
  ConsumerState<_RecommendPlaceDialog> createState() =>
      _RecommendPlaceDialogState();
}

class _RecommendPlaceDialogState extends ConsumerState<_RecommendPlaceDialog> {
  final _countryController = TextEditingController();
  final _cityController = TextEditingController();
  final _placeNameController = TextEditingController();
  File? _selectedImage;
  bool _isSubmitting = false;

  @override
  void dispose() {
    _countryController.dispose();
    _cityController.dispose();
    _placeNameController.dispose();
    super.dispose();
  }

  Future<void> _pickImage() async {
    try {
      final picker = ImagePicker();
      final pickedFile = await picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1600,
        maxHeight: 1600,
        imageQuality: 85,
      );
      if (pickedFile != null) {
        setState(() {
          _selectedImage = File(pickedFile.path);
        });
      }
    } catch (e) {
      debugPrint('Pick image error: $e');
    }
  }

  Future<void> _submit() async {
    final country = _countryController.text.trim();
    final city = _cityController.text.trim();
    final placeName = _placeNameController.text.trim();

    if (country.isEmpty) {
      CustomToast.showError(context, widget.l10n.pleaseEnterCountry);
      return;
    }
    if (city.isEmpty) {
      CustomToast.showError(context, widget.l10n.pleaseEnterCity);
      return;
    }
    if (placeName.isEmpty) {
      CustomToast.showError(context, widget.l10n.pleaseEnterPlaceName);
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      String? imageUrl;

      // Upload image if selected
      if (_selectedImage != null) {
        final uploadService = ref.read(imageUploadServiceProvider);
        imageUrl = await uploadService.uploadImage(_selectedImage!);
      }

      // Get user info
      final authState = ref.read(authProvider);
      final userNickname =
          authState.user?.name ?? authState.user?.email ?? 'Anonymous';

      // Submit recommendation
      final dio = ref.read(dioProvider);
      final response = await dio.post<Map<String, dynamic>>(
        '/user-recommendations',
        data: {
          'country': country,
          'city': city,
          'placeName': placeName,
          'imageUrl': imageUrl,
          'userNickname': userNickname,
        },
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        if (mounted) {
          CustomToast.showSuccess(context, widget.l10n.submitSuccess);
          Navigator.of(context).pop();
        }
      } else {
        throw Exception('Failed to submit');
      }
    } catch (e) {
      debugPrint('Submit recommendation error: $e');
      if (mounted) {
        CustomToast.showError(context, widget.l10n.submitFailed);
      }
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) => Dialog(
        backgroundColor: Colors.transparent,
        child: Container(
          constraints: const BoxConstraints(maxWidth: 360),
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
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      widget.l10n.recommendPlaceTitle,
                      style: AppTheme.headlineMedium(context),
                    ),
                    GestureDetector(
                      onTap: () => Navigator.of(context).pop(),
                      child:
                          const Icon(Icons.close, color: AppTheme.mediumGray),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  widget.l10n.recommendPlaceDescription,
                  style: AppTheme.bodySmall(context).copyWith(
                    color: AppTheme.darkGray,
                  ),
                ),
                const SizedBox(height: 24),

                // Country field
                Text(
                  widget.l10n.countryLabel,
                  style: AppTheme.labelMedium(context),
                ),
                const SizedBox(height: 8),
                _buildTextField(_countryController, widget.l10n.countryLabel),
                const SizedBox(height: 16),

                // City field
                Text(
                  widget.l10n.cityLabel,
                  style: AppTheme.labelMedium(context),
                ),
                const SizedBox(height: 8),
                _buildTextField(_cityController, widget.l10n.cityLabel),
                const SizedBox(height: 16),

                // Place name field
                Text(
                  widget.l10n.placeNameLabel,
                  style: AppTheme.labelMedium(context),
                ),
                const SizedBox(height: 8),
                _buildTextField(
                  _placeNameController,
                  widget.l10n.placeNameLabel,
                ),
                const SizedBox(height: 16),

                // Image upload
                Text(
                  widget.l10n.uploadImageOptional,
                  style: AppTheme.labelMedium(context),
                ),
                const SizedBox(height: 8),
                GestureDetector(
                  onTap: _pickImage,
                  child: Container(
                    width: double.infinity,
                    height: 120,
                    decoration: BoxDecoration(
                      color: AppTheme.lightGray.withValues(alpha: 0.3),
                      borderRadius:
                          BorderRadius.circular(AppTheme.radiusMedium),
                      border: Border.all(
                        color: AppTheme.lightGray,
                        width: 1,
                        style: BorderStyle.solid,
                      ),
                    ),
                    child: _selectedImage != null
                        ? ClipRRect(
                            borderRadius:
                                BorderRadius.circular(AppTheme.radiusMedium),
                            child: Image.file(
                              _selectedImage!,
                              fit: BoxFit.cover,
                            ),
                          )
                        : Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(
                                Icons.add_photo_alternate_outlined,
                                size: 36,
                                color: AppTheme.mediumGray,
                              ),
                              const SizedBox(height: 8),
                              Text(
                                widget.l10n.tapToUploadImage,
                                style: AppTheme.bodySmall(context).copyWith(
                                  color: AppTheme.mediumGray,
                                ),
                              ),
                            ],
                          ),
                  ),
                ),
                const SizedBox(height: 24),

                // Submit button
                GestureDetector(
                  onTap: _isSubmitting ? null : _submit,
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    decoration: BoxDecoration(
                      color: _isSubmitting
                          ? AppTheme.lightGray
                          : AppTheme.primaryYellow,
                      borderRadius:
                          BorderRadius.circular(AppTheme.radiusMedium),
                      border: Border.all(color: AppTheme.black, width: 2),
                      boxShadow: _isSubmitting
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
                      child: _isSubmitting
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Text(
                              widget.l10n.submit,
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

  Widget _buildTextField(TextEditingController controller, String hint) =>
      Container(
        decoration: BoxDecoration(
          color: AppTheme.white,
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
          border: Border.all(color: AppTheme.lightGray, width: 1),
        ),
        child: TextField(
          controller: controller,
          style: AppTheme.bodyMedium(context),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: AppTheme.bodyMedium(context).copyWith(
              color: AppTheme.mediumGray,
            ),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            border: InputBorder.none,
          ),
        ),
      );
}
