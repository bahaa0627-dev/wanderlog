import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:dio/dio.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/ai_recognition/data/models/ai_recognition_history.dart';
import 'package:wanderlog/features/ai_recognition/data/models/ai_recognition_result.dart';
import 'package:wanderlog/features/ai_recognition/data/services/ai_recognition_history_service.dart';
import 'package:wanderlog/features/ai_recognition/data/services/ai_recognition_service.dart';
import 'package:wanderlog/features/ai_recognition/data/services/chatgpt_service.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart' show Spot;
import 'package:wanderlog/shared/widgets/unified_spot_detail_modal.dart';

/// 聊天消息模型
class _ChatMessage {
  _ChatMessage({
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

/// AI Assistant 页面 - 聊天式全屏页面
class AIAssistantPage extends StatefulWidget {
  const AIAssistantPage({super.key});

  @override
  State<AIAssistantPage> createState() => _AIAssistantPageState();
}

class _AIAssistantPageState extends State<AIAssistantPage> {
  final _historyService = AIRecognitionHistoryService();
  final _chatGPTService = ChatGPTService(dio: Dio());
  final _aiService = AIRecognitionService(dio: Dio());
  final _scrollController = ScrollController();
  final _messageController = TextEditingController();
  final _focusNode = FocusNode();

  final List<_ChatMessage> _messages = [];
  bool _isLoading = true;
  bool _isSendingMessage = false;
  final List<XFile> _selectedImages = [];
  CancelToken? _cancelToken;

  @override
  void initState() {
    super.initState();
    print('🚀 AIAssistantPage initState called');
    _loadHistories();
  }

  Future<void> _loadHistories() async {
    setState(() => _isLoading = true);
    final histories = await _historyService.getHistories();
    final reversedHistories = histories.reversed.toList();

    for (final history in reversedHistories) {
      if (history.imageUrls.isNotEmpty) {
        _messages.add(_ChatMessage(
          id: '${history.id}_user_img',
          isUser: true,
          imageUrls: history.imageUrls,
          text: 'Help me find these places',
          timestamp: history.timestamp,
        ));
      }
      _messages.add(_ChatMessage(
        id: '${history.id}_ai_text',
        isUser: false,
        text: history.result.message,
        timestamp: history.timestamp,
      ));
      if (history.result.spots.isNotEmpty) {
        _messages.add(_ChatMessage(
          id: '${history.id}_ai_spots',
          isUser: false,
          spots: history.result.spots.cast<Spot>(),
          timestamp: history.timestamp,
        ));
      }
    }

    setState(() => _isLoading = false);
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());
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
              _buildOptionButton(
                icon: Icons.camera_alt,
                label: 'Camera',
                onTap: () { Navigator.pop(context); _takePhoto(); },
              ),
              const SizedBox(width: 16),
              _buildOptionButton(
                icon: Icons.photo_library,
                label: 'Album',
                onTap: () { Navigator.pop(context); _pickFromGallery(); },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildOptionButton({required IconData icon, required String label, required VoidCallback onTap}) =>
    Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppTheme.primaryYellow.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, size: 32, color: AppTheme.black),
              ),
              const SizedBox(height: 12),
              Text(label, style: AppTheme.labelLarge(context)),
            ],
          ),
        ),
      ),
    );

  Future<void> _pickFromGallery() async {
    final picker = ImagePicker();
    try {
      final remaining = 5 - _selectedImages.length;
      final images = await picker.pickMultiImage(maxWidth: 1920, maxHeight: 1920, imageQuality: 85);
      if (images.isNotEmpty) setState(() => _selectedImages.addAll(images.take(remaining)));
    } catch (e) { print('选择图片错误: $e'); }
  }

  Future<void> _takePhoto() async {
    final picker = ImagePicker();
    try {
      final image = await picker.pickImage(source: ImageSource.camera, maxWidth: 1920, maxHeight: 1920, imageQuality: 85);
      if (image != null) setState(() => _selectedImages.add(image));
    } catch (e) { print('拍照错误: $e'); }
  }

  bool _isSendEnabled() => _selectedImages.isNotEmpty || _messageController.text.trim().isNotEmpty;

  Future<void> _handleSendMessage() async {
    final message = _messageController.text.trim();
    if (_selectedImages.isEmpty && message.isEmpty) return;

    final imagesToSend = List<XFile>.from(_selectedImages);
    final textToSend = message;

    setState(() => _selectedImages.clear());
    _messageController.clear();
    _focusNode.unfocus();

    final userMessageId = 'user_${DateTime.now().millisecondsSinceEpoch}';
    setState(() {
      if (imagesToSend.isNotEmpty) {
        _messages.add(_ChatMessage(
          id: userMessageId, isUser: true,
          imageUrls: imagesToSend.map((e) => e.path).toList(),
          text: textToSend.isNotEmpty ? textToSend : 'Help me find these places',
          timestamp: DateTime.now(),
        ));
      } else {
        _messages.add(_ChatMessage(id: userMessageId, isUser: true, text: textToSend, timestamp: DateTime.now()));
      }
      _isSendingMessage = true;
      _cancelToken = CancelToken();
    });
    _scrollToBottom(animated: true);

    try {
      if (imagesToSend.isNotEmpty) {
        await _handleImageRecognition(imagesToSend, textToSend);
      } else {
        await _handleTextChat(textToSend);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _messages.add(_ChatMessage(
            id: 'error_${DateTime.now().millisecondsSinceEpoch}',
            isUser: false, text: '抱歉，处理消息时出错了：$e', timestamp: DateTime.now(),
          ));
        });
      }
    } finally {
      if (mounted && _isSendingMessage) setState(() { _isSendingMessage = false; _cancelToken = null; });
      _scrollToBottom(animated: true);
    }
  }

  Future<void> _handleImageRecognition(List<XFile> images, String? additionalText) async {
    final files = images.map((xfile) => File(xfile.path)).toList();
    final result = await _aiService.recognizeLocations(files, cancelToken: _cancelToken);

    if (mounted) {
      setState(() {
        _messages.add(_ChatMessage(
          id: 'ai_text_${DateTime.now().millisecondsSinceEpoch}',
          isUser: false, text: result.message, timestamp: DateTime.now(),
        ));
        if (result.spots.isNotEmpty) {
          _messages.add(_ChatMessage(
            id: 'ai_spots_${DateTime.now().millisecondsSinceEpoch}',
            isUser: false, spots: result.spots.cast<Spot>(), timestamp: DateTime.now(),
          ));
        }
      });

      // 保存历史
      final history = AIRecognitionHistory(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        timestamp: DateTime.now(),
        imageUrls: images.map((img) => img.path).toList(),
        result: result,
      );
      await _historyService.saveHistory(history);
    }
  }

  Future<void> _handleTextChat(String message) async {
    final response = await _chatGPTService.chat(message, cancelToken: _cancelToken);
    if (mounted) {
      setState(() {
        _messages.add(_ChatMessage(
          id: 'ai_text_${DateTime.now().millisecondsSinceEpoch}',
          isUser: false, text: response, timestamp: DateTime.now(),
        ));
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    print('🎨 AIAssistantPage build called, isLoading: $_isLoading, messages: ${_messages.length}');
    return Scaffold(
    backgroundColor: Colors.white,
    appBar: AppBar(
      backgroundColor: Colors.white,
      elevation: 0,
      leading: IconButton(
        icon: const Icon(Icons.arrow_back_ios, color: AppTheme.black, size: 20),
        onPressed: () => Navigator.pop(context),
      ),
      title: Text('AI Travel Assistant', style: AppTheme.headlineMedium(context).copyWith(fontSize: 18)),
      centerTitle: false,
    ),
    body: Column(
      children: [
        Expanded(
          child: _isLoading
              ? const Center(child: CircularProgressIndicator(valueColor: AlwaysStoppedAnimation<Color>(AppTheme.primaryYellow)))
              : _messages.isEmpty ? _buildEmptyState() : _buildMessageList(),
        ),
        _buildInputArea(),
      ],
    ),
  );
  }

  Widget _buildEmptyState() => Center(
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // 灰色圆形图标
          Container(
            width: 120,
            height: 120,
            decoration: BoxDecoration(
              color: Colors.grey[200],
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(height: 32),
          // 提示文字
          Text(
            'You can input links, upload photos or just describe your interest to find the place you "VAGO".',
            style: AppTheme.bodyMedium(context).copyWith(
              color: AppTheme.mediumGray,
              height: 1.5,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    ),
  );

  Widget _buildMessageList() => ListView.builder(
    controller: _scrollController,
    padding: const EdgeInsets.all(16),
    itemCount: _messages.length + (_isSendingMessage ? 1 : 0),
    itemBuilder: (context, index) {
      if (index == _messages.length) return _buildLoadingIndicator();
      final message = _messages[index];
      return Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: message.isUser ? _buildUserMessage(message) : _buildAIMessage(message),
      );
    },
  );

  Widget _buildLoadingIndicator() => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      _buildAIAvatar(),
      const SizedBox(width: 12),
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppTheme.background,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTheme.black, width: 1.5),
        ),
        child: const SizedBox(width: 20, height: 20,
          child: CircularProgressIndicator(strokeWidth: 2, valueColor: AlwaysStoppedAnimation<Color>(AppTheme.black))),
      ),
    ],
  );

  Widget _buildUserMessage(_ChatMessage message) => Row(
    mainAxisAlignment: MainAxisAlignment.end,
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Flexible(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            if (message.imageUrls != null && message.imageUrls!.isNotEmpty)
              Container(
                margin: message.text != null ? const EdgeInsets.only(bottom: 8) : EdgeInsets.zero,
                padding: const EdgeInsets.all(8),
                constraints: const BoxConstraints(maxWidth: 280),
                decoration: BoxDecoration(
                  color: AppTheme.primaryYellow.withValues(alpha: 0.3),
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(16), topRight: Radius.circular(4),
                    bottomLeft: Radius.circular(16), bottomRight: Radius.circular(16),
                  ),
                  border: Border.all(color: AppTheme.black, width: 1.5),
                ),
                child: _buildImageGrid(message.imageUrls!),
              ),
            if (message.text != null && message.text!.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                constraints: const BoxConstraints(maxWidth: 280),
                decoration: BoxDecoration(
                  color: AppTheme.primaryYellow.withValues(alpha: 0.3),
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(16), topRight: Radius.circular(4),
                    bottomLeft: Radius.circular(16), bottomRight: Radius.circular(16),
                  ),
                  border: Border.all(color: AppTheme.black, width: 1.5),
                ),
                child: Text(message.text!, style: AppTheme.bodyMedium(context).copyWith(fontWeight: FontWeight.w500)),
              ),
          ],
        ),
      ),
    ],
  );

  Widget _buildAIMessage(_ChatMessage message) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      _buildAIAvatar(),
      const SizedBox(width: 12),
      Flexible(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (message.text != null && message.text!.isNotEmpty)
              Container(
                padding: const EdgeInsets.all(16),
                constraints: const BoxConstraints(maxWidth: 320),
                decoration: BoxDecoration(
                  color: AppTheme.background,
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(4), topRight: Radius.circular(16),
                    bottomLeft: Radius.circular(16), bottomRight: Radius.circular(16),
                  ),
                  border: Border.all(color: AppTheme.black, width: 1.5),
                ),
                child: Text(message.text!, style: AppTheme.bodyMedium(context)),
              ),
            if (message.spots != null && message.spots!.isNotEmpty)
              ...message.spots!.map((spot) => Padding(
                padding: const EdgeInsets.only(top: 12),
                child: _SpotCardOverlay(spot: spot),
              )),
          ],
        ),
      ),
    ],
  );

  Widget _buildAIAvatar() => Container(
    width: 32, height: 32,
    decoration: BoxDecoration(
      color: AppTheme.primaryYellow,
      shape: BoxShape.circle,
      border: Border.all(color: AppTheme.black, width: 2),
    ),
    child: const Center(child: Text('🤖', style: TextStyle(fontSize: 16))),
  );

  Widget _buildImageGrid(List<String> imageUrls) {
    if (imageUrls.length == 1) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.file(File(imageUrls.first), width: 200, height: 150, fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => Container(width: 200, height: 150, color: AppTheme.lightGray,
            child: const Icon(Icons.broken_image, color: AppTheme.mediumGray))),
      );
    }
    return Wrap(
      spacing: 4, runSpacing: 4,
      children: imageUrls.take(5).map((url) => ClipRRect(
        borderRadius: BorderRadius.circular(6),
        child: Image.file(File(url), width: 80, height: 80, fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => Container(width: 80, height: 80, color: AppTheme.lightGray,
            child: const Icon(Icons.broken_image, size: 24, color: AppTheme.mediumGray))),
      )).toList(),
    );
  }

  Widget _buildInputArea() => Container(
    padding: EdgeInsets.only(left: 16, right: 16, top: 12, bottom: MediaQuery.of(context).padding.bottom + 12),
    decoration: const BoxDecoration(
      color: Colors.white,
      border: Border(top: BorderSide(color: AppTheme.lightGray, width: 1)),
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (_selectedImages.isNotEmpty) _buildSelectedImagesPreview(),
        Row(
          children: [
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: AppTheme.background,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: AppTheme.lightGray, width: 1),
                ),
                child: TextField(
                  controller: _messageController,
                  focusNode: _focusNode,
                  decoration: const InputDecoration(
                    hintText: 'Type a message...',
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  ),
                  onChanged: (_) => setState(() {}),
                  onSubmitted: (_) => _handleSendMessage(),
                ),
              ),
            ),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: _handleAddMore,
              child: Container(
                width: 44, height: 44,
                decoration: BoxDecoration(
                  color: AppTheme.background,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppTheme.lightGray, width: 1),
                ),
                child: const Icon(Icons.camera_alt_outlined, color: AppTheme.mediumGray, size: 22),
              ),
            ),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: _isSendEnabled() ? _handleSendMessage : null,
              child: Container(
                width: 44, height: 44,
                decoration: BoxDecoration(
                  color: _isSendEnabled() ? AppTheme.primaryYellow : AppTheme.lightGray,
                  shape: BoxShape.circle,
                  border: Border.all(color: _isSendEnabled() ? AppTheme.black : AppTheme.lightGray, width: 1.5),
                ),
                child: Icon(Icons.arrow_forward, color: _isSendEnabled() ? AppTheme.black : AppTheme.mediumGray, size: 20),
              ),
            ),
          ],
        ),
      ],
    ),
  );

  Widget _buildSelectedImagesPreview() => Container(
    margin: const EdgeInsets.only(bottom: 12),
    height: 80,
    child: ListView.separated(
      scrollDirection: Axis.horizontal,
      itemCount: _selectedImages.length,
      separatorBuilder: (_, __) => const SizedBox(width: 8),
      itemBuilder: (context, index) => Stack(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.file(File(_selectedImages[index].path), width: 80, height: 80, fit: BoxFit.cover),
          ),
          Positioned(
            top: 4, right: 4,
            child: GestureDetector(
              onTap: () => setState(() => _selectedImages.removeAt(index)),
              child: Container(
                width: 20, height: 20,
                decoration: const BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
                child: const Icon(Icons.close, color: Colors.white, size: 14),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}


/// 地点卡片 - 4:3比例，信息叠加在图片上
class _SpotCardOverlay extends StatefulWidget {
  const _SpotCardOverlay({required this.spot});
  final Spot spot;
  @override
  State<_SpotCardOverlay> createState() => _SpotCardOverlayState();
}

class _SpotCardOverlayState extends State<_SpotCardOverlay> {
  bool _isInWishlist = false;

  Uint8List? _decodeBase64Image(String dataUri) {
    try { return base64Decode(dataUri.split(',').last); } catch (_) { return null; }
  }

  Widget _buildCoverImage(String imageUrl) {
    const placeholder = ColoredBox(color: AppTheme.lightGray,
      child: Center(child: Icon(Icons.image_not_supported, size: 48, color: AppTheme.mediumGray)));
    if (imageUrl.isEmpty) return placeholder;
    if (imageUrl.startsWith('data:')) {
      final bytes = _decodeBase64Image(imageUrl);
      if (bytes != null) return Image.memory(bytes, fit: BoxFit.cover, errorBuilder: (_, __, ___) => placeholder);
      return placeholder;
    }
    return Image.network(imageUrl, fit: BoxFit.cover, errorBuilder: (_, __, ___) => placeholder);
  }

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: () => showModalBottomSheet<void>(
      context: context, isScrollControlled: true, backgroundColor: Colors.transparent,
      builder: (context) => UnifiedSpotDetailModal(spot: widget.spot, keepOpenOnAction: true),
    ),
    child: AspectRatio(
      aspectRatio: 4 / 3,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 300),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
          border: Border.all(color: AppTheme.black, width: AppTheme.borderMedium),
          boxShadow: AppTheme.cardShadow,
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium - 2),
          child: Stack(
            fit: StackFit.expand,
            children: [
              _buildCoverImage(widget.spot.coverImage),
              Positioned.fill(
                child: Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter, end: Alignment.bottomCenter,
                      colors: [Colors.transparent, Colors.black.withValues(alpha: 0.7)],
                      stops: const [0.4, 1.0],
                    ),
                  ),
                ),
              ),
              Positioned(
                left: 12, right: 12, bottom: 12,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (widget.spot.tags.isNotEmpty)
                      Wrap(
                        spacing: 4, runSpacing: 4,
                        children: widget.spot.tags.take(3).map((tag) => Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppTheme.primaryYellow,
                            borderRadius: BorderRadius.circular(4),
                            border: Border.all(color: AppTheme.black, width: 1),
                          ),
                          child: Text(tag, style: AppTheme.bodySmall(context).copyWith(fontSize: 10, fontWeight: FontWeight.w600)),
                        )).toList(),
                      ),
                    const SizedBox(height: 8),
                    Text(widget.spot.name,
                      style: AppTheme.labelLarge(context).copyWith(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                      maxLines: 2, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 4),
                    Row(children: [
                      const Icon(Icons.star, size: 16, color: AppTheme.primaryYellow),
                      const SizedBox(width: 4),
                      Text(widget.spot.rating.toStringAsFixed(1),
                        style: AppTheme.bodySmall(context).copyWith(color: Colors.white, fontWeight: FontWeight.w600)),
                      const SizedBox(width: 4),
                      Text('(${widget.spot.ratingCount})',
                        style: AppTheme.bodySmall(context).copyWith(color: Colors.white.withValues(alpha: 0.8), fontSize: 12)),
                    ]),
                  ],
                ),
              ),
              Positioned(
                top: 12, right: 12,
                child: GestureDetector(
                  onTap: () {
                    setState(() => _isInWishlist = !_isInWishlist);
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                      content: Text(_isInWishlist ? 'Added to Wishlist' : 'Removed from Wishlist'),
                      duration: const Duration(seconds: 1)));
                  },
                  child: Container(
                    width: 36, height: 36,
                    decoration: BoxDecoration(
                      color: Colors.white, shape: BoxShape.circle,
                      border: Border.all(color: AppTheme.black, width: 2),
                    ),
                    child: Icon(_isInWishlist ? Icons.favorite : Icons.favorite_border,
                      size: 20, color: _isInWishlist ? Colors.red : AppTheme.black),
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
