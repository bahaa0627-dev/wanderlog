import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as path;
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/ai_recognition/data/models/ai_recognition_history.dart';
import 'package:wanderlog/features/ai_recognition/data/services/ai_recognition_history_service.dart';
import 'package:wanderlog/features/ai_recognition/data/services/ai_recognition_service.dart';
import 'package:wanderlog/features/ai_recognition/data/services/chatgpt_service.dart';
import 'package:wanderlog/features/ai_recognition/presentation/widgets/ai_recognition_sheets_new.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart'
    show Spot;

/// 聊天消息模型
class ChatMessage {
  ChatMessage({
    required this.id,
    required this.isUser,
    required this.timestamp,
    this.text,
    this.imageUrls,
    this.spots,
  });

  final String id;
  final bool isUser;
  final String? text;
  final List<String>? imageUrls;
  final List<Spot>? spots;
  final DateTime timestamp;
}

/// AI识别历史会话页面 - 展示所有历史对话（完全复刻会话界面）
class AIRecognitionHistoryChatPage extends StatefulWidget {
  const AIRecognitionHistoryChatPage({super.key});

  static Future<void> show(BuildContext context) => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        isDismissible: true,
        enableDrag: true,
        builder: (context) => const AIRecognitionHistoryChatPage(),
      );

  @override
  State<AIRecognitionHistoryChatPage> createState() =>
      _AIRecognitionHistoryChatPageState();
}

class _AIRecognitionHistoryChatPageState
    extends State<AIRecognitionHistoryChatPage> {
  final _historyService = AIRecognitionHistoryService();
  final _chatGPTService = ChatGPTService(dio: Dio());
  final _aiService = AIRecognitionService(dio: Dio());
  final _scrollController = ScrollController();
  final _messageController = TextEditingController();
  final _focusNode = FocusNode();

  // 统一的聊天消息列表
  final List<ChatMessage> _messages = [];
  bool _isLoading = true;
  bool _isSendingMessage = false;
  bool _isCancelled = false; // 跟踪是否已被取消

  // 选中的图片列表（用于发送消息）
  final List<XFile> _selectedImages = [];

  // 取消请求的token
  CancelToken? _cancelToken;

  @override
  void initState() {
    super.initState();
    _loadInitialHistories();
  }

  Future<void> _loadInitialHistories() async {
    setState(() => _isLoading = true);

    final histories = await _historyService.getHistories();

    // 反转历史记录顺序，让最旧的在前面，最新的在后面
    final reversedHistories = histories.reversed.toList();

    // 转换历史记录为统一的消息格式
    for (final history in reversedHistories) {
      // 用户消息（图片）
      if (history.imageUrls.isNotEmpty) {
        _messages.add(
          ChatMessage(
            id: '${history.id}_user_img',
            isUser: true,
            imageUrls: history.imageUrls,
            text: 'Help me find these places',
            timestamp: history.timestamp,
          ),
        );
      }

      // AI回复（文字）
      _messages.add(
        ChatMessage(
          id: '${history.id}_ai_text',
          isUser: false,
          text: history.result.message,
          timestamp: history.timestamp,
        ),
      );

      // AI回复（地点卡片）
      if (history.result.spots.isNotEmpty) {
        _messages.add(
          ChatMessage(
            id: '${history.id}_ai_spots',
            isUser: false,
            spots: history.result.spots.cast<Spot>(),
            timestamp: history.timestamp,
          ),
        );
      }
    }

    setState(() => _isLoading = false);

    // 等待UI渲染完成后滚动到底部（显示最新消息）
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scrollToBottom();
    });
  }

  void _scrollToBottom({bool animated = false}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        if (animated) {
          _scrollController.animateTo(
            _scrollController.position.maxScrollExtent,
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOut,
          );
        } else {
          _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
        }
      }
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _messageController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _handleAddMore() async {
    // 检查是否已达上限
    if (_selectedImages.length >= 5) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('最多只能选择5张图片')),
      );
      return;
    }

    await showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              // Camera option
              Expanded(
                child: InkWell(
                  onTap: () {
                    Navigator.pop(context);
                    _takePhoto();
                  },
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color:
                                AppTheme.primaryYellow.withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(
                            Icons.camera_alt,
                            size: 32,
                            color: AppTheme.black,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'Camera',
                          style: AppTheme.labelLarge(context),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              // Album option
              Expanded(
                child: InkWell(
                  onTap: () {
                    Navigator.pop(context);
                    _pickFromGallery();
                  },
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color:
                                AppTheme.primaryYellow.withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(
                            Icons.photo_library,
                            size: 32,
                            color: AppTheme.black,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'Album',
                          style: AppTheme.labelLarge(context),
                        ),
                      ],
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

  Future<void> _pickFromGallery() async {
    final picker = ImagePicker();
    try {
      final remaining = 5 - _selectedImages.length;
      final images = await picker.pickMultiImage(
        maxWidth: 1920,
        maxHeight: 1920,
        imageQuality: 85,
      );

      if (images.isEmpty) return;

      setState(() {
        _selectedImages.addAll(images.take(remaining));
      });
    } catch (e) {
      print('选择图片错误: $e');
    }
  }

  Future<void> _takePhoto() async {
    final picker = ImagePicker();
    try {
      print('开始拍照...');
      final image = await picker.pickImage(
        source: ImageSource.camera,
        maxWidth: 1920,
        maxHeight: 1920,
        imageQuality: 85,
        preferredCameraDevice: CameraDevice.rear,
      );

      if (image == null) {
        print('拍照取消');
        return;
      }

      print('拍照成功: ${image.path}');

      // 显示确认对话框
      if (mounted) {
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) => Dialog(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ClipRRect(
                  borderRadius:
                      const BorderRadius.vertical(top: Radius.circular(16)),
                  child: Image.file(
                    File(image.path),
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stackTrace) => Container(
                      height: 200,
                      color: AppTheme.lightGray,
                      child: const Center(
                        child: Icon(Icons.broken_image, size: 48),
                      ),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      TextButton(
                        onPressed: () => Navigator.pop(context, false),
                        style: TextButton.styleFrom(
                          foregroundColor: AppTheme.mediumGray,
                        ),
                        child: const Text('取消'),
                      ),
                      TextButton(
                        onPressed: () {
                          Navigator.pop(context, false);
                          Future.delayed(
                            const Duration(milliseconds: 200),
                            _takePhoto,
                          );
                        },
                        style: TextButton.styleFrom(
                          foregroundColor: AppTheme.black,
                        ),
                        child: const Text('重拍'),
                      ),
                      ElevatedButton(
                        onPressed: () => Navigator.pop(context, true),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.primaryYellow,
                          foregroundColor: AppTheme.black,
                        ),
                        child: const Text('确认'),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );

        if ((confirmed ?? false) && mounted) {
          setState(() {
            _selectedImages.add(image);
          });
        }
      }
    } catch (e) {
      print('拍照错误: $e');
    }
  }

  bool _isSendEnabled() =>
      _selectedImages.isNotEmpty || _messageController.text.trim().isNotEmpty;

  void _handleCancelRequest() {
    if (_cancelToken != null && !_cancelToken!.isCancelled) {
      // 立即取消请求
      _cancelToken!.cancel('User cancelled');

      // 立即停止发送状态并添加停止消息
      if (mounted) {
        setState(() {
          _isSendingMessage = false;
          _isCancelled = true; // 设置取消标志
          _cancelToken = null;

          // 添加取消消息提示
          _messages.add(
            ChatMessage(
              id: 'cancelled_${DateTime.now().millisecondsSinceEpoch}',
              isUser: false,
              text: 'Cancel response',
              timestamp: DateTime.now(),
            ),
          );
        });
        _scrollToBottom(animated: true);
      }
    }
  }

  Future<void> _handleSendMessage() async {
    final message = _messageController.text.trim();

    // 必须有图片或文字
    if (_selectedImages.isEmpty && message.isEmpty) {
      return;
    }

    // 保存输入内容
    final imagesToSend = List<XFile>.from(_selectedImages);
    final textToSend = message;

    // 立即清空输入并关闭键盘
    setState(() {
      _selectedImages.clear();
    });
    _messageController.clear();
    _focusNode.unfocus();

    // 添加用户消息到对话中
    final userMessageId = 'user_${DateTime.now().millisecondsSinceEpoch}';
    setState(() {
      if (imagesToSend.isNotEmpty) {
        _messages.add(
          ChatMessage(
            id: userMessageId,
            isUser: true,
            imageUrls: imagesToSend.map((e) => e.path).toList(),
            text: textToSend.isNotEmpty ? textToSend : null,
            timestamp: DateTime.now(),
          ),
        );
      } else {
        _messages.add(
          ChatMessage(
            id: userMessageId,
            isUser: true,
            text: textToSend,
            timestamp: DateTime.now(),
          ),
        );
      }
      _isSendingMessage = true;
      _isCancelled = false; // 重置取消标志
      _cancelToken = CancelToken();
    });

    _scrollToBottom(animated: true);

    try {
      if (imagesToSend.isNotEmpty) {
        // 图片识别（可能带文字）
        await _handleImageRecognition(imagesToSend, textToSend);
      } else {
        // 纯文字对话
        await _handleTextChat(textToSend);
      }
    } on DioException catch (e) {
      // 检查是否是用户取消
      if (e.type == DioExceptionType.cancel) {
        // 用户取消，不显示错误消息（已在_handleCancelRequest中显示）
        return;
      }
      // 其他错误才显示错误消息
      if (mounted) {
        setState(() {
          _messages.add(
            ChatMessage(
              id: 'error_${DateTime.now().millisecondsSinceEpoch}',
              isUser: false,
              text: '抱歉，处理消息时出错了：${e.message}',
              timestamp: DateTime.now(),
            ),
          );
        });
      }
    } catch (e) {
      // 其他类型的异常
      if (mounted) {
        setState(() {
          _messages.add(
            ChatMessage(
              id: 'error_${DateTime.now().millisecondsSinceEpoch}',
              isUser: false,
              text: '抱歉，处理消息时出错了：$e',
              timestamp: DateTime.now(),
            ),
          );
        });
      }
    } finally {
      // 只有在没有被取消的情况下才清理状态
      if (mounted && _isSendingMessage) {
        setState(() {
          _isSendingMessage = false;
          _cancelToken = null;
        });
        _scrollToBottom(animated: true);
      }
    }
  }

  Future<void> _handleTextChat(String message) async {
    try {
      // 使用Mock服务进行测试
      final response = await _chatGPTService.sendMessageMock(message);

      // 检查是否已被取消
      if (_isCancelled) {
        return; // 已取消，不添加任何消息
      }

      if (mounted) {
        setState(() {
          _messages.add(
            ChatMessage(
              id: 'ai_${DateTime.now().millisecondsSinceEpoch}',
              isUser: false,
              text: response,
              timestamp: DateTime.now(),
            ),
          );
        });
      }
    } catch (e) {
      rethrow;
    }
  }

  /// 将图片复制到永久存储
  Future<List<String>> _copyImagesToPermanentStorage(List<XFile> images) async {
    try {
      final appDir = await getApplicationDocumentsDirectory();
      final imagesDir = Directory('${appDir.path}/ai_recognition_images');

      // 确保目录存在
      if (!await imagesDir.exists()) {
        await imagesDir.create(recursive: true);
      }

      final permanentPaths = <String>[];

      for (final image in images) {
        final fileName =
            '${DateTime.now().millisecondsSinceEpoch}_${path.basename(image.path)}';
        final permanentPath = '${imagesDir.path}/$fileName';

        // 复制文件
        await File(image.path).copy(permanentPath);
        permanentPaths.add(permanentPath);
      }

      return permanentPaths;
    } catch (e) {
      print('复制图片到永久存储失败: $e');
      // 如果复制失败，返回原始路径
      return images.map((e) => e.path).toList();
    }
  }

  Future<void> _handleImageRecognition(List<XFile> images, String? text) async {
    try {
      // 转换为File列表
      final files = images.map((xfile) => File(xfile.path)).toList();

      // 调用真实的AI识别服务（Gemini + Google Maps）
      final result = await _aiService.recognizeLocations(files);

      // 检查是否已被取消
      if (_isCancelled) {
        return; // 已取消，不添加任何消息
      }

      if (mounted) {
        // 添加AI文字回复
        setState(() {
          _messages.add(
            ChatMessage(
              id: 'ai_text_${DateTime.now().millisecondsSinceEpoch}',
              isUser: false,
              text: result.message,
              timestamp: DateTime.now(),
            ),
          );

          // 添加地点卡片（如果识别到地点）
          if (result.spots.isNotEmpty) {
            _messages.add(
              ChatMessage(
                id: 'ai_spots_${DateTime.now().millisecondsSinceEpoch}',
                isUser: false,
                spots: result.spots,
                timestamp: DateTime.now(),
              ),
            );
          }
        });

        // 保存到历史记录（使用永久存储路径）
        try {
          final permanentImagePaths =
              await _copyImagesToPermanentStorage(images);
          final history = AIRecognitionHistory(
            id: 'history_${DateTime.now().millisecondsSinceEpoch}',
            timestamp: DateTime.now(),
            imageUrls: permanentImagePaths,
            result: result,
          );
          await _historyService.saveHistory(history);
          print('历史记录已保存: ${history.id}');
        } catch (e) {
          print('保存历史记录失败: $e');
        }
      }
    } catch (e) {
      rethrow;
    }
  }

  @override
  Widget build(BuildContext context) => Container(
        height: MediaQuery.of(context).size.height * 0.9,
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            // Header
            _buildHeader(),
            // Content
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : _messages.isEmpty
                      ? _buildEmptyState()
                      : _buildMessageList(),
            ),
            // 底部输入框
            _buildInputArea(),
          ],
        ),
      );

  Widget _buildHeader() => Container(
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
            // AI头像
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: AppTheme.primaryYellow,
                shape: BoxShape.circle,
                border: Border.all(
                  color: AppTheme.black,
                  width: 2,
                ),
              ),
              child: const Center(
                child: Text('🤖', style: TextStyle(fontSize: 18)),
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

  Widget _buildEmptyState() => Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.chat_bubble_outline,
              size: 80,
              color: Colors.grey[300],
            ),
            const SizedBox(height: 16),
            Text(
              'No recognition history',
              style: TextStyle(
                fontSize: 16,
                color: Colors.grey[600],
              ),
            ),
          ],
        ),
      );

  Widget _buildMessageList() => ListView.builder(
        controller: _scrollController,
        padding: const EdgeInsets.all(16),
        itemCount: _messages.length + (_isSendingMessage ? 1 : 0),
        itemBuilder: (context, index) {
          // 显示加载指示器
          if (index == _messages.length) {
            return _buildLoadingIndicator();
          }

          final message = _messages[index];

          return Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: message.isUser
                ? _buildUserMessage(message)
                : _buildAIMessage(message),
          );
        },
      );

  Widget _buildLoadingIndicator() => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // AI头像
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
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppTheme.background,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: AppTheme.black,
                width: 1.5,
              ),
            ),
            child: const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation<Color>(AppTheme.black),
              ),
            ),
          ),
        ],
      );

  /// 用户消息（右侧对齐）
  Widget _buildUserMessage(ChatMessage message) => Row(
        mainAxisAlignment: MainAxisAlignment.end,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                // 图片（如果有）
                if (message.imageUrls != null && message.imageUrls!.isNotEmpty)
                  Container(
                    margin: message.text != null
                        ? const EdgeInsets.only(bottom: 8)
                        : EdgeInsets.zero,
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
                    child: _buildImageGrid(message.imageUrls!),
                  ),
                // 文字（如果有）
                if (message.text != null && message.text!.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 12,),
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
                    child: Text(
                      message.text!,
                      style: AppTheme.bodyMedium(context).copyWith(
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      );

  /// AI消息（左侧对齐，带头像）
  Widget _buildAIMessage(ChatMessage message) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildAIAvatar(),
          const SizedBox(width: 12),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 文字消息
                if (message.text != null && message.text!.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.all(16),
                    constraints: const BoxConstraints(maxWidth: 320),
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
                      message.text!,
                      style: AppTheme.bodyMedium(context),
                    ),
                  ),
                // 地点卡片
                if (message.spots != null && message.spots!.isNotEmpty)
                  ...message.spots!.map(
                    (spot) => Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: SpotCardOverlay(spot: spot),
                    ),
                  ),
              ],
            ),
          ),
        ],
      );

  Widget _buildAIAvatar() => Container(
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

  Widget _buildImageGrid(List<String> imageUrls) => Wrap(
        spacing: 4,
        runSpacing: 4,
        children: imageUrls.asMap().entries.map((entry) {
          final index = entry.key;
          final imagePath = entry.value;
          final imageFile = File(imagePath);
          final fileExists = imageFile.existsSync();

          return GestureDetector(
            onTap: fileExists ? () => _showFullImage(index, imageUrls) : null,
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
                child: fileExists
                    ? Image.file(
                        imageFile,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) => Container(
                          color: Colors.grey[200],
                          child: const Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  Icons.broken_image,
                                  color: Colors.grey,
                                  size: 24,
                                ),
                                SizedBox(height: 2),
                                Text(
                                  '图片失效',
                                  style: TextStyle(
                                    fontSize: 8,
                                    color: Colors.grey,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      )
                    : Container(
                        color: Colors.grey[200],
                        child: const Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.image_not_supported,
                                color: Colors.grey,
                                size: 24,
                              ),
                              SizedBox(height: 2),
                              Text(
                                '图片失效',
                                style: TextStyle(
                                  fontSize: 8,
                                  color: Colors.grey,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
              ),
            ),
          );
        }).toList(),
      );

  void _showFullImage(int initialIndex, List<String> imageUrls) {
    // 过滤出存在的图片
    final validImageUrls =
        imageUrls.where((url) => File(url).existsSync()).toList();

    if (validImageUrls.isEmpty) {
      // 如果没有有效图片，显示提示
      showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('图片不可用'),
          content: const Text('所选图片已失效或不存在'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('确定'),
            ),
          ],
        ),
      );
      return;
    }

    // 计算有效图片的索引
    int validInitialIndex = 0;
    if (initialIndex < imageUrls.length) {
      final selectedUrl = imageUrls[initialIndex];
      validInitialIndex = validImageUrls.indexOf(selectedUrl);
      if (validInitialIndex == -1) validInitialIndex = 0;
    }

    showDialog<void>(
      context: context,
      builder: (context) => Dialog(
        backgroundColor: Colors.black,
        child: Stack(
          children: [
            PageView.builder(
              itemCount: validImageUrls.length,
              controller: PageController(initialPage: validInitialIndex),
              itemBuilder: (context, index) => Center(
                child: InteractiveViewer(
                  child: Image.file(
                    File(validImageUrls[index]),
                    fit: BoxFit.contain,
                    errorBuilder: (context, error, stackTrace) => const ColoredBox(
                        color: Colors.black,
                        child: Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.broken_image,
                                color: Colors.white54,
                                size: 64,
                              ),
                              SizedBox(height: 16),
                              Text(
                                '图片加载失败',
                                style: TextStyle(
                                  color: Colors.white54,
                                  fontSize: 16,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ),
                ),
              ),
            ),
            Positioned(
              top: 16,
              right: 16,
              child: IconButton(
                icon: const Icon(Icons.close, color: Colors.white, size: 32),
                onPressed: () => Navigator.pop(context),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInputArea() => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(
            top: BorderSide(
              color: AppTheme.lightGray,
              width: 1,
            ),
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // 图片预览区域（左对齐）
            if (_selectedImages.isNotEmpty)
              Container(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                alignment: Alignment.centerLeft,
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      ..._selectedImages.asMap().entries.map((entry) {
                        final index = entry.key;
                        final image = entry.value;
                        return Container(
                          margin: const EdgeInsets.only(right: 8),
                          child: Stack(
                            children: [
                              Container(
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
                                    errorBuilder: (context, error, stackTrace) => const ColoredBox(
                                        color: AppTheme.lightGray,
                                        child: Icon(
                                          Icons.broken_image,
                                          color: AppTheme.mediumGray,
                                        ),
                                      ),
                                  ),
                                ),
                              ),
                              Positioned(
                                top: -4,
                                right: -4,
                                child: GestureDetector(
                                  onTap: () {
                                    setState(() {
                                      _selectedImages.removeAt(index);
                                    });
                                  },
                                  child: Container(
                                    padding: const EdgeInsets.all(4),
                                    decoration: BoxDecoration(
                                      color: AppTheme.mediumGray
                                          .withValues(alpha: 0.9),
                                      shape: BoxShape.circle,
                                    ),
                                    child: const Icon(
                                      Icons.close,
                                      size: 16,
                                      color: Colors.white,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        );
                      }),
                      // 添加更多按钮
                      if (_selectedImages.length < 5)
                        GestureDetector(
                          onTap: _handleAddMore,
                          child: Container(
                            width: 80,
                            height: 80,
                            decoration: BoxDecoration(
                              color: AppTheme.lightGray,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: AppTheme.black,
                                width: 1.5,
                              ),
                            ),
                            child: const Icon(
                              Icons.add,
                              size: 32,
                              color: AppTheme.mediumGray,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            // 输入栏
            Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 12,
                bottom: MediaQuery.of(context).padding.bottom + 12,
              ),
              child: Row(
                children: [
                  // 输入框
                  Expanded(
                    child: TextField(
                      controller: _messageController,
                      decoration: InputDecoration(
                        hintText: 'Type a message...',
                        hintStyle: TextStyle(color: Colors.grey[400]),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide: const BorderSide(
                              color: AppTheme.black, width: 1.5,),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide: const BorderSide(
                              color: AppTheme.black, width: 1.5,),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide:
                              const BorderSide(color: AppTheme.black, width: 2),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                      ),
                      maxLines: null,
                      keyboardType: TextInputType.multiline,
                      textInputAction: TextInputAction.newline,
                      onChanged: (text) {
                        setState(() {}); // 更新UI以反映发送按钮状态
                      },
                      onSubmitted: (_) {
                        if (_isSendEnabled()) {
                          _handleSendMessage();
                        }
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  // + 按钮（添加图片）- 正在回复时隐藏
                  if (!_isSendingMessage)
                    GestureDetector(
                      onTap: _handleAddMore,
                      child: Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: AppTheme.background,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: AppTheme.black,
                            width: 2,
                          ),
                        ),
                        child: const Icon(Icons.add,
                            color: AppTheme.black, size: 24,),
                      ),
                    ),
                  if (!_isSendingMessage) const SizedBox(width: 8),
                  // 发送/暂停按钮
                  GestureDetector(
                    onTap: _isSendingMessage
                        ? _handleCancelRequest
                        : (_isSendEnabled() ? _handleSendMessage : null),
                    child: Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: _isSendingMessage
                            ? AppTheme.black
                            : (_isSendEnabled()
                                ? AppTheme.primaryYellow
                                : AppTheme.lightGray),
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: _isSendingMessage
                              ? AppTheme.black
                              : (_isSendEnabled()
                                  ? AppTheme.black
                                  : AppTheme.mediumGray),
                          width: 2,
                        ),
                      ),
                      child: Icon(
                        _isSendingMessage ? Icons.stop : Icons.send,
                        color: _isSendingMessage
                            ? Colors.white
                            : (_isSendEnabled()
                                ? AppTheme.black
                                : AppTheme.mediumGray),
                        size: 20,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}
