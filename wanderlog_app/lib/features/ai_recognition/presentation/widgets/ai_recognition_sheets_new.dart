import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/ai_recognition/data/models/ai_recognition_result.dart';
import 'package:wanderlog/features/ai_recognition/data/models/ai_recognition_history.dart';
import 'package:wanderlog/features/ai_recognition/data/services/ai_recognition_service.dart';
import 'package:wanderlog/features/ai_recognition/data/services/ai_recognition_history_service.dart';
import 'package:wanderlog/features/ai_recognition/presentation/pages/ai_recognition_history_chat_page.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart';
import 'package:dio/dio.dart';

/// AI识别引导底部弹窗
class AIRecognitionIntroSheet extends StatelessWidget {
  const AIRecognitionIntroSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => const AIRecognitionIntroSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
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
          // 标题和历史记录按钮
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    'AI recognize and add spots\nto your wishlist',
                    textAlign: TextAlign.left,
                    style: AppTheme.headlineMedium(context),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.history),
                  onPressed: () {
                    Navigator.pop(context);
                    AIRecognitionHistoryChatPage.show(context);
                  },
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  tooltip: '识别历史',
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          // 描述
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'You can upload screenshots from Xiaohongshu,\nother platforms or take picture directly',
                textAlign: TextAlign.left,
                style: AppTheme.bodyMedium(context).copyWith(
                  color: AppTheme.mediumGray,
                ),
              ),
            ),
          ),
          const SizedBox(height: 24),
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
                      color: AppTheme.mediumGray.withValues(alpha: 0.5),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      '📱 → 🤖 → 📍',
                      style: TextStyle(
                        fontSize: 32,
                        color: AppTheme.mediumGray.withValues(alpha: 0.8),
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
          // 按钮区域（相册 + 拍照）
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Row(
              children: [
                // 打开相册按钮
                Expanded(
                  child: SizedBox(
                    height: 52,
                    child: ElevatedButton.icon(
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
                      icon: const Icon(Icons.photo_library),
                      label: Text(
                        'Album',
                        style: AppTheme.labelLarge(context),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                // 拍照按钮
                Expanded(
                  child: SizedBox(
                    height: 52,
                    child: ElevatedButton.icon(
                      onPressed: () => _handleTakePhoto(context),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.background,
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
                      icon: const Icon(Icons.camera_alt),
                      label: Text(
                        'Camera',
                        style: AppTheme.labelLarge(context),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          SizedBox(height: MediaQuery.of(context).padding.bottom + 24),
        ],
      ),
    );
  }

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
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('未选择图片')),
        );
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
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('选择图片失败: $e')),
        );
      }
    }
  }
  
  Future<void> _handleTakePhoto(BuildContext context) async {
    final picker = ImagePicker();
    try {
      print('开始拍照...');
      final image = await picker.pickImage(
        source: ImageSource.camera,
        maxWidth: 1920,
        maxHeight: 1920,
        imageQuality: 85,
      );

      if (!context.mounted) {
        print('Context已失效');
        return;
      }

      if (image == null) {
        print('未拍照');
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('未拍照')),
        );
        return;
      }

      print('拍照完成，准备显示AI识别对话框');

      // 先关闭引导弹窗
      Navigator.of(context).pop();

      // 等待一小段时间确保弹窗完全关闭
      await Future<void>.delayed(const Duration(milliseconds: 200));

      // 打开AI识别对话框
      if (context.mounted) {
        print('打开AI识别对话框');
        await AIRecognitionChatSheet.show(context, [image]);
      }
    } catch (e) {
      print('拍照错误: $e');
      if (context.mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('拍照失败: $e')),
        );
      }
    }
  }
}

/// AI识别聊天式底部弹窗 - 重新设计为对话风格
class AIRecognitionChatSheet extends StatefulWidget {
  const AIRecognitionChatSheet({
    super.key,
    required this.images,
    this.historyResult,
  });

  final List<XFile> images;
  final AIRecognitionResult? historyResult;

  static Future<void> show(BuildContext context, List<XFile> images) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      isDismissible: false,
      enableDrag: false,
      builder: (context) => AIRecognitionChatSheet(images: images),
    );
  }

  /// 从历史记录打开
  static Future<void> showFromHistory(
    BuildContext context,
    AIRecognitionHistory history,
  ) {
    final images = history.imageUrls.map((path) => XFile(path)).toList();
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      isDismissible: true,
      enableDrag: true,
      builder: (context) => AIRecognitionChatSheet(
        images: images,
        historyResult: history.result,
      ),
    );
  }

  @override
  State<AIRecognitionChatSheet> createState() => _AIRecognitionChatSheetState();
}

class _AIRecognitionChatSheetState extends State<AIRecognitionChatSheet> {
  bool _isLoading = true;
  AIRecognitionResult? _result;
  String? _error;
  final _historyService = AIRecognitionHistoryService();

  @override
  void initState() {
    super.initState();
    // 如果是从历史记录打开，直接显示结果
    if (widget.historyResult != null) {
      print('从历史记录打开，直接显示结果');
      _result = widget.historyResult;
      _isLoading = false;
    } else {
      print('AI识别对话框初始化，图片数量: ${widget.images.length}');
      _recognizeImages();
    }
  }

  Future<void> _recognizeImages() async {
    print('开始识别图片...');
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      // 使用真实AI服务
      final service = AIRecognitionService(dio: Dio());
      final files = widget.images.map((xfile) => File(xfile.path)).toList();
      
      print('调用AI服务识别 ${files.length} 张图片');
      // 使用真实AI识别
      final result = await service.recognizeLocations(files);
      
      print('识别完成，找到 ${result.spots.length} 个地点');

      if (mounted) {
        setState(() {
          _result = result;
          _isLoading = false;
        });

        // 保存到历史记录
        await _saveToHistory(result);
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

  /// 保存识别结果到历史记录
  Future<void> _saveToHistory(AIRecognitionResult result) async {
    try {
      final history = AIRecognitionHistory(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        timestamp: DateTime.now(),
        imageUrls: widget.images.map((img) => img.path).toList(),
        result: result,
      );
      await _historyService.saveHistory(history);
      print('已保存到历史记录');
    } catch (e) {
      print('保存历史记录失败: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.9,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          // 顶部栏
          _buildHeader(),
          // 聊天内容区域
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // 用户消息：上传的图片（右侧）
                  _buildUserMessage(),
                  const SizedBox(height: 16),
                  // AI响应（左侧）
                  if (_isLoading)
                    _buildLoadingMessage()
                  else if (_error != null)
                    _buildErrorMessage()
                  else if (_result != null)
                    _buildAIResponse(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(
            color: AppTheme.lightGray,
            width: 1,
          ),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: AppTheme.primaryYellow,
              shape: BoxShape.circle,
              border: Border.all(
                color: AppTheme.black,
                width: 2,
              ),
            ),
            child: const Center(
              child: Text('🤖', style: TextStyle(fontSize: 16)),
            ),
          ),
          const SizedBox(width: 12),
          Text(
            'AI Travel Assistant',
            style: AppTheme.headlineMedium(context).copyWith(fontSize: 18),
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
    );
  }

  /// 用户消息：显示上传的图片（右侧对齐）
  Widget _buildUserMessage() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Flexible(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                constraints: const BoxConstraints(maxWidth: 280),
                decoration: BoxDecoration(
                  color: AppTheme.primaryYellow.withValues(alpha: 0.3),
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(16),
                    topRight: Radius.circular(4),
                    bottomLeft: Radius.circular(16),
                    bottomRight: Radius.circular(16),
                  ),
                  border: Border.all(
                    color: AppTheme.black,
                    width: 1.5,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Help me find these places',
                      style: AppTheme.bodyMedium(context).copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 4,
                      runSpacing: 4,
                      children: widget.images.asMap().entries.map((entry) {
                        final index = entry.key;
                        final image = entry.value;
                        return GestureDetector(
                          onTap: () => _showFullImage(index),
                          child: Container(
                            width: 80,
                            height: 80,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: AppTheme.black,
                                width: 1.5,
                              ),
                            ),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(6),
                              child: Image.file(
                                File(image.path),
                                fit: BoxFit.cover,
                              ),
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Just now',
                style: AppTheme.bodySmall(context).copyWith(
                  color: AppTheme.mediumGray,
                  fontSize: 11,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  /// AI加载消息
  Widget _buildLoadingMessage() {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildAIAvatar(),
        const SizedBox(width: 12),
        Flexible(
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.background,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(4),
                topRight: Radius.circular(16),
                bottomLeft: Radius.circular(16),
                bottomRight: Radius.circular(16),
              ),
              border: Border.all(
                color: AppTheme.black,
                width: 1.5,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation<Color>(AppTheme.black),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Text(
                      'Analyzing images...',
                      style: AppTheme.bodyMedium(context),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  /// AI错误消息
  Widget _buildErrorMessage() {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildAIAvatar(),
        const SizedBox(width: 12),
        Flexible(
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.red.shade50,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(4),
                topRight: Radius.circular(16),
                bottomLeft: Radius.circular(16),
                bottomRight: Radius.circular(16),
              ),
              border: Border.all(
                color: Colors.red,
                width: 1.5,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Sorry, I encountered an error',
                  style: AppTheme.bodyMedium(context).copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  _error ?? 'Unknown error',
                  style: AppTheme.bodySmall(context),
                ),
                const SizedBox(height: 12),
                ElevatedButton(
                  onPressed: _recognizeImages,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.red,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  ),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  /// AI响应消息（包含文案和地点卡片）
  Widget _buildAIResponse() {
    if (_result == null) return const SizedBox.shrink();

    return Column(
      children: [
        // AI文案
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildAIAvatar(),
            const SizedBox(width: 12),
            Flexible(
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppTheme.background,
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(4),
                    topRight: Radius.circular(16),
                    bottomLeft: Radius.circular(16),
                    bottomRight: Radius.circular(16),
                  ),
                  border: Border.all(
                    color: AppTheme.black,
                    width: 1.5,
                  ),
                ),
                child: Text(
                  _result!.message,
                  style: AppTheme.bodyMedium(context),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        // 地点卡片
        if (_result!.spots.isNotEmpty) ...[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildAIAvatar(),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Found ${_result!.spots.length} amazing place${_result!.spots.length > 1 ? 's' : ''}',
                      style: AppTheme.labelMedium(context).copyWith(
                        color: AppTheme.mediumGray,
                      ),
                    ),
                    const SizedBox(height: 12),
                    // 地点卡片列表
                    ..._result!.spots.map((spot) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: SpotCardOverlay(spot: spot),
                        )),
                  ],
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }

  Widget _buildAIAvatar() {
    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(
        color: AppTheme.primaryYellow,
        shape: BoxShape.circle,
        border: Border.all(
          color: AppTheme.black,
          width: 2,
        ),
      ),
      child: const Center(
        child: Text('🤖', style: TextStyle(fontSize: 16)),
      ),
    );
  }

  void _showFullImage(int index) {
    showDialog<void>(
      context: context,
      builder: (context) => Dialog(
        backgroundColor: Colors.black,
        child: Stack(
          children: [
            Center(
              child: Image.file(File(widget.images[index].path)),
            ),
            Positioned(
              top: 16,
              right: 16,
              child: IconButton(
                icon: const Icon(Icons.close, color: Colors.white),
                onPressed: () => Navigator.pop(context),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 地点卡片 - 4:3比例，信息叠加在图片上
class SpotCardOverlay extends StatefulWidget {
  const SpotCardOverlay({
    super.key,
    required this.spot,
  });

  final Spot spot;

  @override
  State<SpotCardOverlay> createState() => _SpotCardOverlayState();
}

class _SpotCardOverlayState extends State<SpotCardOverlay> {
  bool _isInWishlist = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        // 打开地点详情页面
        showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          backgroundColor: Colors.transparent,
          builder: (context) => SpotDetailModal(spot: widget.spot),
        );
      },
      child: AspectRatio(
        aspectRatio: 4 / 3,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
            border: Border.all(
              color: AppTheme.black,
              width: AppTheme.borderMedium,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.1),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppTheme.radiusMedium - 2),
            child: Stack(
              fit: StackFit.expand,
              children: [
                // 背景图片
                Image.network(
                  widget.spot.coverImage,
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) {
                    return Container(
                      color: AppTheme.lightGray,
                      child: const Center(
                        child: Icon(
                          Icons.image_not_supported,
                          size: 48,
                          color: AppTheme.mediumGray,
                        ),
                      ),
                    );
                  },
                ),
                // 渐变遮罩
                Positioned.fill(
                  child: Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          Colors.black.withValues(alpha: 0.7),
                        ],
                        stops: const [0.4, 1.0],
                      ),
                    ),
                  ),
                ),
                // 内容叠加
                Positioned(
                  left: 12,
                  right: 12,
                  bottom: 12,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // 标签
                      if (widget.spot.tags.isNotEmpty)
                        Wrap(
                          spacing: 4,
                          runSpacing: 4,
                          children: widget.spot.tags.take(3).map((tag) {
                            return Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: AppTheme.primaryYellow,
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
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            );
                          }).toList(),
                        ),
                      const SizedBox(height: 8),
                      // 地点名称
                      Text(
                        widget.spot.name,
                        style: AppTheme.labelLarge(context).copyWith(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      // 评分和人数
                      Row(
                        children: [
                          const Icon(
                            Icons.star,
                            size: 16,
                            color: AppTheme.primaryYellow,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            widget.spot.rating.toStringAsFixed(1),
                            style: AppTheme.bodySmall(context).copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            '(${widget.spot.ratingCount})',
                            style: AppTheme.bodySmall(context).copyWith(
                              color: Colors.white.withValues(alpha: 0.8),
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                // Wishlist按钮
                Positioned(
                  top: 12,
                  right: 12,
                  child: GestureDetector(
                    onTap: () {
                      setState(() {
                        _isInWishlist = !_isInWishlist;
                      });
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            _isInWishlist
                                ? 'Added to Wishlist'
                                : 'Removed from Wishlist',
                          ),
                          duration: const Duration(seconds: 1),
                        ),
                      );
                    },
                    child: Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: AppTheme.black,
                          width: 2,
                        ),
                      ),
                      child: Icon(
                        _isInWishlist ? Icons.favorite : Icons.favorite_border,
                        size: 20,
                        color: _isInWishlist ? Colors.red : AppTheme.black,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
