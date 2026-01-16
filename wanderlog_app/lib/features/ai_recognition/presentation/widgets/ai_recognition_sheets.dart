import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/core/utils/dialog_utils.dart';
import 'package:wanderlog/core/l10n/app_localizations.dart';
import 'package:wanderlog/features/ai_recognition/data/models/ai_recognition_result.dart';
import 'package:wanderlog/features/ai_recognition/data/services/ai_recognition_service.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart';
import 'package:wanderlog/shared/widgets/unified_spot_detail_modal.dart';
import 'package:wanderlog/shared/utils/number_format_utils.dart';
import 'package:dio/dio.dart';

/// AI识别引导底部弹窗
class AIRecognitionIntroSheet extends StatelessWidget {
  const AIRecognitionIntroSheet({super.key});

  static Future<void> show(BuildContext context) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => const AIRecognitionIntroSheet(),
    );

  @override
  Widget build(BuildContext context) => Container(
      height: MediaQuery.of(context).size.height * 0.65,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          // 拖拽指示器
          Container(
            margin: const EdgeInsets.only(top: 12),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: AppTheme.lightGray,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 24),
          // 标题
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(
              'AI recognize and add spots\nto your wishlist',
              textAlign: TextAlign.center,
              style: AppTheme.headlineMedium(context),
            ),
          ),
          const SizedBox(height: 12),
          // 描述
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(
              'You can upload screenshots from Xiaohongshu\nor other platforms',
              textAlign: TextAlign.center,
              style: AppTheme.bodyMedium(context).copyWith(
                color: AppTheme.mediumGray,
              ),
            ),
          ),
          const SizedBox(height: 32),
          // 引导示意图
          Expanded(
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 24),
              decoration: BoxDecoration(
                color: AppTheme.background,
                borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                border: Border.all(
                  color: AppTheme.black,
                  width: AppTheme.borderMedium,
                ),
              ),
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.image_outlined,
                      size: 80,
                      color: AppTheme.mediumGray.withOpacity(0.5),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      '📱 → 🤖 → 📍',
                      style: TextStyle(
                        fontSize: 32,
                        color: AppTheme.mediumGray.withOpacity(0.8),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Upload → AI Recognize → Add to Wishlist',
                      style: AppTheme.bodySmall(context).copyWith(
                        color: AppTheme.mediumGray,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 24),
          // 打开相册按钮
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: () => _handleOpenAlbum(context),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryYellow,
                  foregroundColor: AppTheme.black,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                    side: const BorderSide(
                      color: AppTheme.black,
                      width: AppTheme.borderMedium,
                    ),
                  ),
                  elevation: 0,
                ),
                child: Text(
                  'Open Album',
                  style: AppTheme.labelLarge(context),
                ),
              ),
            ),
          ),
          SizedBox(height: MediaQuery.of(context).padding.bottom + 24),
        ],
      ),
    );

  Future<void> _handleOpenAlbum(BuildContext context) async {
    final picker = ImagePicker();
    try {
      print('开始选择图片...');
      final images = await picker.pickMultiImage(
        maxWidth: 1920,
        maxHeight: 1920,
        imageQuality: 85,
      );

      print('图片选择完成，数量: ${images.length}');

      if (!context.mounted) {
        print('Context已失效');
        return;
      }

      if (images.isEmpty) {
        print('未选择图片');
        Navigator.of(context).pop();
        final languageCode = Localizations.localeOf(context).languageCode;
        final l10n = AppLocalizations(languageCode);
        DialogUtils.showInfoSnackBar(context, l10n.noImageSelected);
        return;
      }

      // 限制最多5张
      final selectedImages = images.take(5).toList();
      print('准备显示AI识别对话框，图片数量: ${selectedImages.length}');

      // 先关闭引导弹窗
      Navigator.of(context).pop();

      // 等待一小段时间确保弹窗完全关闭
      await Future<void>.delayed(const Duration(milliseconds: 200));

      // 打开AI识别对话框
      if (context.mounted) {
        print('打开AI识别对话框');
        await AIRecognitionChatSheet.show(context, selectedImages);
      }
    } catch (e) {
      print('选择图片错误: $e');
      if (context.mounted) {
        Navigator.of(context).pop();
        final languageCode = Localizations.localeOf(context).languageCode;
        final l10n = AppLocalizations(languageCode);
        DialogUtils.showErrorSnackBar(context, l10n.selectImageFailed(e.toString()));
      }
    }
  }
}

/// AI识别聊天式底部弹窗
class AIRecognitionChatSheet extends StatefulWidget {
  const AIRecognitionChatSheet({
    required this.images, super.key,
  });

  final List<XFile> images;

  static Future<void> show(BuildContext context, List<XFile> images) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      isDismissible: false,
      enableDrag: false,
      builder: (context) => AIRecognitionChatSheet(images: images),
    );

  @override
  State<AIRecognitionChatSheet> createState() => _AIRecognitionChatSheetState();
}

class _AIRecognitionChatSheetState extends State<AIRecognitionChatSheet> {
  bool _isLoading = true;
  AIRecognitionResult? _result;
  String? _error;

  @override
  void initState() {
    super.initState();
    print('AI识别对话框初始化，图片数量: ${widget.images.length}');
    _recognizeImages();
  }

  Future<void> _recognizeImages() async {
    print('开始识别图片...');
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      // 使用Mock服务进行测试
      final service = AIRecognitionService(dio: Dio());
      final files = widget.images.map((xfile) => File(xfile.path)).toList();
      
      print('调用AI服务识别 ${files.length} 张图片');
      final result = await service.recognizeLocationsMock(files);
      
      print('识别完成，找到 ${result.spots.length} 个地点');

      if (mounted) {
        setState(() {
          _result = result;
          _isLoading = false;
        });
      }
    } catch (e) {
      print('识别失败: $e');
      if (mounted) {
        setState(() {
          _error = e.toString();
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Container(
      height: MediaQuery.of(context).size.height * 0.85,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          // 顶部栏
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: const BoxDecoration(
              border: Border(
                bottom: BorderSide(
                  color: AppTheme.lightGray,
                  width: 1,
                ),
              ),
            ),
            child: Row(
              children: [
                Text(
                  'AI Recognition',
                  style: AppTheme.headlineMedium(context),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close, size: 24),
                  onPressed: () => Navigator.pop(context),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
              ],
            ),
          ),
          // 内容区域
          Expanded(
            child: _isLoading
                ? _buildLoadingState()
                : _error != null
                    ? _buildErrorState()
                    : _buildResultState(),
          ),
        ],
      ),
    );

  Widget _buildLoadingState() => Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const SizedBox(
            width: 60,
            height: 60,
            child: CircularProgressIndicator(
              strokeWidth: 3,
              valueColor: AlwaysStoppedAnimation<Color>(AppTheme.primaryYellow),
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'AI 识别获取地点信息中...',
            style: AppTheme.bodyMedium(context),
          ),
          const SizedBox(height: 12),
          Text(
            '正在分析 ${widget.images.length} 张图片',
            style: AppTheme.bodySmall(context).copyWith(
              color: AppTheme.mediumGray,
            ),
          ),
        ],
      ),
    );

  Widget _buildErrorState() => Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline,
              size: 64,
              color: Colors.red[300],
            ),
            const SizedBox(height: 16),
            Text(
              '识别失败',
              style: AppTheme.headlineMedium(context),
            ),
            const SizedBox(height: 8),
            Text(
              _error ?? '未知错误',
              textAlign: TextAlign.center,
              style: AppTheme.bodyMedium(context).copyWith(
                color: AppTheme.mediumGray,
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _recognizeImages,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primaryYellow,
                foregroundColor: AppTheme.black,
              ),
              child: const Text('重试'),
            ),
          ],
        ),
      ),
    );

  Widget _buildResultState() {
    if (_result == null) return const SizedBox.shrink();

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // AI返回的文案
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.background,
              borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
              border: Border.all(
                color: AppTheme.black,
                width: AppTheme.borderThin,
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: AppTheme.primaryYellow,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: AppTheme.black,
                      width: AppTheme.borderMedium,
                    ),
                  ),
                  child: const Center(
                    child: Text('🤖', style: TextStyle(fontSize: 16)),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    _result!.message,
                    style: AppTheme.bodyMedium(context),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          // 地点卡片列表
          if (_result!.spots.isNotEmpty) ...[
            Text(
              'Found ${_result!.spots.length} spot${_result!.spots.length > 1 ? 's' : ''}',
              style: AppTheme.labelMedium(context).copyWith(
                color: AppTheme.mediumGray,
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 280,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _result!.spots.length,
                separatorBuilder: (_, __) => const SizedBox(width: 12),
                itemBuilder: (context, index) {
                  final spot = _result!.spots[index];
                  return SpotRecognitionCard(spot: spot);
                },
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// 识别结果的地点卡片组件（4:3竖向）
class SpotRecognitionCard extends StatefulWidget {
  const SpotRecognitionCard({
    required this.spot, super.key,
  });

  final Spot spot;

  @override
  State<SpotRecognitionCard> createState() => _SpotRecognitionCardState();
}

class _SpotRecognitionCardState extends State<SpotRecognitionCard> {
  /// Decode base64 image data from data URI
  Uint8List? _decodeBase64Image(String dataUri) {
    try {
      final base64Data = dataUri.split(',').last;
      return base64Decode(base64Data);
    } catch (e) {
      return null;
    }
  }

  /// Build cover image widget that handles both data URIs and network URLs
  Widget _buildCoverImage(String imageUrl) {
    const placeholder = ColoredBox(
      color: AppTheme.lightGray,
      child: Center(
        child: Icon(
          Icons.image_not_supported,
          size: 48,
          color: AppTheme.mediumGray,
        ),
      ),
    );

    if (imageUrl.isEmpty) {
      return const SizedBox(height: 160, child: placeholder);
    }

    if (imageUrl.startsWith('data:')) {
      final bytes = _decodeBase64Image(imageUrl);
      if (bytes != null) {
        return Image.memory(
          bytes,
          width: double.infinity,
          height: 160,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => const SizedBox(height: 160, child: placeholder),
        );
      }
      return const SizedBox(height: 160, child: placeholder);
    }

    return Image.network(
      imageUrl,
      width: double.infinity,
      height: 160,
      fit: BoxFit.cover,
      errorBuilder: (context, error, stackTrace) => Container(
          height: 160,
          color: AppTheme.lightGray,
          child: const Center(
            child: Icon(
              Icons.image_not_supported,
              size: 48,
              color: AppTheme.mediumGray,
            ),
          ),
        ),
    );
  }

  bool _isInWishlist = false;

  @override
  Widget build(BuildContext context) => GestureDetector(
      onTap: () {
        // 打开地点详情页面
        showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          backgroundColor: Colors.transparent,
          builder: (context) => UnifiedSpotDetailModal(
            spot: widget.spot,
            keepOpenOnAction: true,
            hideCollectionEntry: true,
          ),
        );
      },
      child: Container(
        width: 210, // 4:3比例，高度280，宽度210
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
          border: Border.all(
            color: AppTheme.black,
            width: AppTheme.borderMedium,
          ),
          boxShadow: AppTheme.cardShadow,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 图片区域
            Stack(
              children: [
                ClipRRect(
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(AppTheme.radiusMedium - 2),
                  ),
                  child: _buildCoverImage(widget.spot.coverImage),
                ),
                // 加入Wishlist按钮
                Positioned(
                  top: 8,
                  right: 8,
                  child: GestureDetector(
                    onTap: () {
                      setState(() {
                        _isInWishlist = !_isInWishlist;
                      });
                      DialogUtils.showSuccessSnackBar(
                        context,
                        _isInWishlist ? '已添加到心愿单' : '已从心愿单移除',
                      );
                    },
                    child: Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: AppTheme.black,
                          width: AppTheme.borderMedium,
                        ),
                      ),
                      child: Icon(
                        _isInWishlist ? Icons.favorite : Icons.favorite_border,
                        size: 18,
                        color: _isInWishlist ? Colors.red : AppTheme.black,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            // 信息区域
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // 标签
                  if (widget.spot.tags.isNotEmpty)
                    Wrap(
                      spacing: 4,
                      runSpacing: 4,
                      children: widget.spot.tags.take(2).map((tag) => Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: AppTheme.background,
                            borderRadius: BorderRadius.circular(4),
                            border: Border.all(
                              color: AppTheme.black,
                              width: 1,
                            ),
                          ),
                          child: Text(
                            tag,
                            style: AppTheme.bodySmall(context).copyWith(
                              fontSize: 10,
                            ),
                          ),
                        ),).toList(),
                    ),
                  const SizedBox(height: 8),
                  // 地点名称
                  Text(
                    widget.spot.name,
                    style: AppTheme.labelLarge(context),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  // 评分和人数
                  Row(
                    children: [
                      const Icon(
                        Icons.star,
                        size: 14,
                        color: AppTheme.primaryYellow,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        widget.spot.rating.toStringAsFixed(1),
                        style: AppTheme.bodySmall(context).copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        formatRatingCount(widget.spot.ratingCount),
                        style: AppTheme.bodySmall(context).copyWith(
                          color: AppTheme.mediumGray,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
}
