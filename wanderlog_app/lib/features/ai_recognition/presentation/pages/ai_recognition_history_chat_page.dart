import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/ai_recognition/data/models/ai_recognition_history.dart';
import 'package:wanderlog/features/ai_recognition/data/services/ai_recognition_history_service.dart';
import 'package:wanderlog/features/ai_recognition/presentation/widgets/ai_recognition_sheets_new.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart' show Spot;

/// AI识别历史会话页面 - 展示所有历史对话（完全复刻会话界面）
class AIRecognitionHistoryChatPage extends StatefulWidget {
  const AIRecognitionHistoryChatPage({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      isDismissible: true,
      enableDrag: true,
      builder: (context) => const AIRecognitionHistoryChatPage(),
    );
  }

  @override
  State<AIRecognitionHistoryChatPage> createState() => _AIRecognitionHistoryChatPageState();
}

class _AIRecognitionHistoryChatPageState extends State<AIRecognitionHistoryChatPage> {
  final _historyService = AIRecognitionHistoryService();
  final _scrollController = ScrollController();
  final _messageController = TextEditingController();
  
  List<AIRecognitionHistory> _allHistories = [];
  List<AIRecognitionHistory> _displayedHistories = [];
  bool _isLoading = true;
  bool _isLoadingMore = false;
  
  static const int _pageSize = 20;
  int _currentPage = 1;
  
  // 选中的图片列表（用于发送消息）
  List<XFile> _selectedImages = [];

  @override
  void initState() {
    super.initState();
    _loadInitialHistories();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _loadInitialHistories() async {
    setState(() => _isLoading = true);
    
    _allHistories = await _historyService.getHistories();
    // 倒序排列（新的在前）
    _allHistories = _allHistories.reversed.toList();
    _displayedHistories = _allHistories.take(_pageSize).toList();
    
    setState(() => _isLoading = false);
  }

  void _onScroll() {
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200) {
      if (!_isLoadingMore && _displayedHistories.length < _allHistories.length) {
        _loadMoreHistories();
      }
    }
  }

  Future<void> _loadMoreHistories() async {
    if (_isLoadingMore) return;
    
    setState(() => _isLoadingMore = true);
    
    await Future<void>.delayed(const Duration(milliseconds: 300));
    
    final nextPage = _currentPage + 1;
    final startIndex = _currentPage * _pageSize;
    final endIndex = (startIndex + _pageSize).clamp(0, _allHistories.length);
    
    final moreHistories = _allHistories.sublist(startIndex, endIndex);
    
    setState(() {
      _displayedHistories.addAll(moreHistories);
      _currentPage = nextPage;
      _isLoadingMore = false;
    });
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
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('从相册选择'),
              onTap: () {
                Navigator.pop(context);
                _pickFromGallery();
              },
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: const Text('拍照'),
              onTap: () {
                Navigator.pop(context);
                _takePhoto();
              },
            ),
          ],
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
      final image = await picker.pickImage(
        source: ImageSource.camera,
        maxWidth: 1920,
        maxHeight: 1920,
        imageQuality: 85,
      );

      if (image == null) return;

      // 显示确认对话框
      if (mounted) {
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) => Dialog(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Image.file(File(image.path)),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      TextButton(
                        onPressed: () => Navigator.pop(context, false),
                        child: const Text('取消'),
                      ),
                      TextButton(
                        onPressed: () {
                          Navigator.pop(context, false);
                          _takePhoto(); // 重拍
                        },
                        child: const Text('重拍'),
                      ),
                      ElevatedButton(
                        onPressed: () => Navigator.pop(context, true),
                        child: const Text('确认'),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
        
        if (confirmed == true) {
          setState(() {
            _selectedImages.add(image);
          });
        }
      }
    } catch (e) {
      print('拍照错误: $e');
    }
  }

  void _handleSendMessage() {
    final message = _messageController.text.trim();
    
    // 必须有图片或文字
    if (_selectedImages.isEmpty && message.isEmpty) {
      return;
    }

    // 有图片且无文字 -> 识别地点
    // 有图片且有文字 -> 结合图片和文字回答
    // 无图片有文字 -> 纯文字对话
    
    // TODO: 实现实际的发送逻辑
    if (mounted) {
      if (_selectedImages.isNotEmpty && message.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('正在识别地点...')),
        );
      } else if (_selectedImages.isNotEmpty && message.isNotEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('结合图片和文字: $message')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('文字消息: $message')),
        );
      }
    }
    
    // 清空输入
    setState(() {
      _selectedImages.clear();
    });
    _messageController.clear();
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
          // Header
          _buildHeader(),
          // Content
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _displayedHistories.isEmpty
                    ? _buildEmptyState()
                    : _buildChatList(),
          ),
          // 底部输入框
          _buildInputArea(),
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
          // 左侧：返回按钮
          IconButton(
            icon: const Icon(Icons.arrow_back, size: 24),
            onPressed: () {
              Navigator.pop(context);
              // 显示引导上传半层
              AIRecognitionIntroSheet.show(context);
            },
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
          ),
          const SizedBox(width: 12),
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
          Text(
            'AI Travel Assistant',
            style: AppTheme.headlineMedium(context).copyWith(fontSize: 18),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
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
  }

  Widget _buildChatList() {
    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.all(16),
      itemCount: _displayedHistories.length + (_isLoadingMore ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == _displayedHistories.length) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: CircularProgressIndicator(),
            ),
          );
        }
        
        final history = _displayedHistories[index];
        final isLastInPage = (index + 1) % _pageSize == 0;
        
        return Column(
          children: [
            _buildConversation(history),
            if (isLastInPage && index < _displayedHistories.length - 1)
              _buildPageDivider(index ~/ _pageSize + 1),
          ],
        );
      },
    );
  }

  Widget _buildPageDivider(int pageNumber) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 24),
      child: Row(
        children: [
          Expanded(child: Divider(color: Colors.grey[300])),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              '第 $pageNumber 页',
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey[500],
              ),
            ),
          ),
          Expanded(child: Divider(color: Colors.grey[300])),
        ],
      ),
    );
  }

  Widget _buildConversation(AIRecognitionHistory history) {
    return Container(
      margin: const EdgeInsets.only(bottom: 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 时间戳
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              history.formattedTime,
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey[500],
              ),
            ),
          ),
          
          // 用户消息（图片）- 右侧对齐
          _buildUserImageMessage(history.imageUrls),
          
          const SizedBox(height: 8),
          
          // 用户消息（文字）- 右侧对齐
          _buildUserTextMessage(),
          
          const SizedBox(height: 16),
          
          // AI回复（文案）- 左侧对齐，有头像
          _buildAITextMessage(history.result.message),
          
          const SizedBox(height: 16),
          
          // AI回复（地点卡片）- 左侧对齐，有头像
          if (history.result.spots.isNotEmpty)
            _buildAISpotCards(history.result.spots),
        ],
      ),
    );
  }

  /// 用户图片消息（右侧，黄色气泡）
  Widget _buildUserImageMessage(List<String> imageUrls) {
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
                child: _buildImageGrid(imageUrls),
              ),
            ],
          ),
        ),
      ],
    );
  }

  /// 用户文字消息（右侧，黄色气泡）
  Widget _buildUserTextMessage() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Flexible(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
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
              'Help me find these places',
              style: AppTheme.bodyMedium(context).copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      ],
    );
  }

  /// AI文字消息（左侧，有头像）
  Widget _buildAITextMessage(String message) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildAIAvatar(),
        const SizedBox(width: 12),
        Flexible(
          child: Container(
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
              message,
              style: AppTheme.bodyMedium(context),
            ),
          ),
        ),
      ],
    );
  }

  /// AI地点卡片（左侧，有头像）
  Widget _buildAISpotCards(List<dynamic> spots) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildAIAvatar(),
        const SizedBox(width: 12),
        Flexible(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: spots.map<Widget>((spotData) {
              // 从dynamic转换为Spot
              final spot = spotData as Spot;
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: SpotCardOverlay(spot: spot),
              );
            }).toList(),
          ),
        ),
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

  Widget _buildImageGrid(List<String> imageUrls) {
    return Wrap(
      spacing: 4,
      runSpacing: 4,
      children: imageUrls.asMap().entries.map((entry) {
        final index = entry.key;
        final imagePath = entry.value;
        return GestureDetector(
          onTap: () => _showFullImage(index, imageUrls),
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
                File(imagePath),
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) {
                  return Container(
                    color: Colors.grey[200],
                    child: const Icon(Icons.broken_image, color: Colors.grey, size: 24),
                  );
                },
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  void _showFullImage(int initialIndex, List<String> imageUrls) {
    showDialog<void>(
      context: context,
      builder: (context) => Dialog(
        backgroundColor: Colors.black,
        child: Stack(
          children: [
            PageView.builder(
              itemCount: imageUrls.length,
              controller: PageController(initialPage: initialIndex),
              itemBuilder: (context, index) {
                return Center(
                  child: InteractiveViewer(
                    child: Image.file(
                      File(imageUrls[index]),
                      fit: BoxFit.contain,
                    ),
                  ),
                );
              },
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

  Widget _buildInputArea() {
    return Container(
      decoration: BoxDecoration(
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
          // 图片预览区域
          if (_selectedImages.isNotEmpty)
            Container(
              padding: const EdgeInsets.all(12),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
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
                                  decoration: const BoxDecoration(
                                    color: Colors.red,
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
                        borderSide: const BorderSide(color: AppTheme.black, width: 1.5),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide: const BorderSide(color: AppTheme.black, width: 1.5),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide: const BorderSide(color: AppTheme.black, width: 2),
                      ),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    ),
                    maxLines: null,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => _handleSendMessage(),
                  ),
                ),
                const SizedBox(width: 12),
                // + 按钮（添加图片）
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
                    child: const Icon(Icons.add, color: AppTheme.black, size: 24),
                  ),
                ),
                const SizedBox(width: 8),
                // 发送按钮
                GestureDetector(
                  onTap: _handleSendMessage,
                  child: Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: AppTheme.primaryYellow,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: AppTheme.black,
                        width: 2,
                      ),
                    ),
                    child: const Icon(Icons.send, color: AppTheme.black, size: 20),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
