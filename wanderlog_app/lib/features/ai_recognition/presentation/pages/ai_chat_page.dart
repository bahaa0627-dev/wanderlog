import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:dio/dio.dart';
import 'package:geolocator/geolocator.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/core/supabase/supabase_config.dart';
import 'package:wanderlog/core/supabase/services/quota_service.dart';
import 'package:wanderlog/core/utils/dialog_utils.dart';
import 'package:wanderlog/features/ai_recognition/data/models/ai_recognition_history.dart';
import 'package:wanderlog/features/ai_recognition/data/services/ai_recognition_history_service.dart';
import 'package:wanderlog/features/ai_recognition/data/services/ai_recognition_service.dart';
import 'package:wanderlog/features/ai_recognition/data/services/chatgpt_service.dart';
import 'package:wanderlog/features/auth/presentation/pages/login_page.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart' show TripSpotStatus;
import 'package:wanderlog/shared/utils/destination_utils.dart';
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

/// AI Chat 页面 - 对话式全屏页面
class AIChatPage extends StatefulWidget {
  const AIChatPage({super.key});

  @override
  State<AIChatPage> createState() => _AIChatPageState();
}

class _AIChatPageState extends State<AIChatPage> {
  final _historyService = AIRecognitionHistoryService();
  final _chatGPTService = ChatGPTService(dio: Dio());
  final _aiService = AIRecognitionService(dio: Dio());
  final _quotaService = QuotaService();
  final _scrollController = ScrollController();
  final _messageController = TextEditingController();
  final _focusNode = FocusNode();
  
  // 用户位置
  double? _userLat;
  double? _userLng;
  
  // 配额状态
  QuotaStatus? _quotaStatus;

  final List<_ChatMessage> _messages = [];
  bool _isLoading = true;
  bool _isSendingMessage = false;
  bool _isCancelled = false;
  final List<XFile> _selectedImages = [];
  CancelToken? _cancelToken;

  @override
  void initState() {
    super.initState();
    _loadHistories();
    _tryGetUserLocation();
    _loadQuotaStatus();
  }

  /// 加载配额状态
  Future<void> _loadQuotaStatus() async {
    if (!SupabaseConfig.isAuthenticated) return;
    
    try {
      final status = await _quotaService.getQuotaStatus();
      if (mounted) {
        setState(() => _quotaStatus = status);
      }
    } catch (e) {
      print('⚠️ Failed to load quota status: $e');
    }
  }

  /// 取消当前请求
  void _handleCancelRequest() {
    if (_cancelToken != null && !_cancelToken!.isCancelled) {
      _cancelToken!.cancel('User cancelled the request');
    }
    setState(() {
      _isCancelled = true;
      _isSendingMessage = false;
      _messages.add(_ChatMessage(
        id: 'cancelled_${DateTime.now().millisecondsSinceEpoch}',
        isUser: false,
        text: 'Cancelled answering.',
        timestamp: DateTime.now(),
      ));
    });
    _scrollToBottom(animated: true);
  }

  /// 尝试获取用户位置（不强制，只是预先获取）
  Future<void> _tryGetUserLocation() async {
    try {
      final permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied || 
          permission == LocationPermission.deniedForever) {
        return; // 没有权限，不获取
      }
      
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.medium,
      );
      
      if (mounted) {
        setState(() {
          _userLat = position.latitude;
          _userLng = position.longitude;
        });
        print('📍 Got user location: $_userLat, $_userLng');
      }
    } catch (e) {
      print('⚠️ Could not get user location: $e');
    }
  }

  /// 请求定位权限（会弹出系统权限对话框）
  Future<bool> _requestLocationPermission() async {
    try {
      // 检查定位服务是否开启
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        // 定位服务未开启，提示用户
        if (mounted) {
          DialogUtils.showInfoSnackBar(context, '请在设备设置中开启定位服务');
        }
        return false;
      }

      // 检查当前权限状态
      var permission = await Geolocator.checkPermission();
      
      if (permission == LocationPermission.denied) {
        // 请求权限（会弹出系统对话框）
        permission = await Geolocator.requestPermission();
      }
      
      if (permission == LocationPermission.deniedForever) {
        // 权限被永久拒绝，引导用户去设置
        if (mounted) {
          DialogUtils.showInfoSnackBar(context, '需要定位权限，请在设置中开启');
          Geolocator.openAppSettings();
        }
        return false;
      }
      
      if (permission == LocationPermission.whileInUse || 
          permission == LocationPermission.always) {
        // 权限已授予，获取位置
        final position = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.medium,
        );
        
        if (mounted) {
          setState(() {
            _userLat = position.latitude;
            _userLng = position.longitude;
          });
          print('📍 Got user location after permission: $_userLat, $_userLng');
        }
        return true;
      }
      
      return false;
    } catch (e) {
      print('❌ Error requesting location permission: $e');
      return false;
    }
  }

  Future<void> _loadHistories() async {
    setState(() => _isLoading = true);
    final histories = await _historyService.getHistories();
    final reversedHistories = histories.reversed.toList();

    for (final history in reversedHistories) {
      // 文本搜索历史
      if (history.isTextQuery) {
        _messages.add(_ChatMessage(
          id: '${history.id}_user_text',
          isUser: true,
          text: history.queryText,
          timestamp: history.timestamp,
        ));
      }
      // 图片识别历史
      else if (history.imageUrls.isNotEmpty) {
        _messages.add(_ChatMessage(
          id: '${history.id}_user_img',
          isUser: true,
          imageUrls: history.imageUrls,
          text: 'Help me find these places',
          timestamp: history.timestamp,
        ));
      }
      
      // AI 回复消息
      _messages.add(_ChatMessage(
        id: '${history.id}_ai_text',
        isUser: false,
        text: history.result.message,
        timestamp: history.timestamp,
      ));
      
      // AI 返回的地点卡片
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
    // 延迟滚动确保列表完全渲染
    Future.delayed(const Duration(milliseconds: 100), () {
      _scrollToBottom();
    });
  }

  void _scrollToBottom({bool animated = false}) {
    if (!_scrollController.hasClients) return;
    
    final maxExtent = _scrollController.position.maxScrollExtent;
    if (animated) {
      _scrollController.animateTo(
        maxExtent,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    } else {
      _scrollController.jumpTo(maxExtent);
    }
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
      DialogUtils.showInfoSnackBar(context, '最多只能选择5张图片');
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
                  color: AppTheme.primaryYellow.withOpacity(0.2),
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
    } catch (e) { debugPrint('选择图片错误: $e'); }
  }

  Future<void> _takePhoto() async {
    final picker = ImagePicker();
    try {
      final image = await picker.pickImage(source: ImageSource.camera, maxWidth: 1920, maxHeight: 1920, imageQuality: 85);
      if (image != null) setState(() => _selectedImages.add(image));
    } catch (e) { debugPrint('拍照错误: $e'); }
  }

  bool _isSendEnabled() => _selectedImages.isNotEmpty || _messageController.text.trim().isNotEmpty;

  /// 检查用户是否已登录，未登录则跳转登录页
  Future<bool> _checkLoginAndNavigate() async {
    if (SupabaseConfig.isAuthenticated) {
      return true;
    }
    
    // 未登录，跳转到登录页
    final result = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (context) => const LoginPage()),
    );
    
    // 返回登录结果
    return result == true;
  }

  Future<void> _handleSendMessage() async {
    final message = _messageController.text.trim();
    if (_selectedImages.isEmpty && message.isEmpty) return;

    // 检查登录状态
    final isLoggedIn = await _checkLoginAndNavigate();
    if (!isLoggedIn) {
      // 用户未登录或取消登录，保留输入内容，不清空
      return;
    }

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
      _isCancelled = false;
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
      if (mounted && !_isCancelled) {
        // 检查是否是取消导致的错误
        final isCancelError = e.toString().contains('cancel') || 
                              e.toString().contains('Cancel') ||
                              (e is DioException && e.type == DioExceptionType.cancel);
        if (!isCancelError) {
          setState(() {
            _messages.add(_ChatMessage(
              id: 'error_${DateTime.now().millisecondsSinceEpoch}',
              isUser: false, text: 'Sorry, something went wrong: $e', timestamp: DateTime.now(),
            ));
          });
        }
      }
    } finally {
      if (mounted && _isSendingMessage) setState(() { _isSendingMessage = false; _cancelToken = null; });
      _scrollToBottom(animated: true);
    }
  }

  Future<void> _handleImageRecognition(List<XFile> images, String? additionalText) async {
    final files = images.map((xfile) => File(xfile.path)).toList();
    final result = await _aiService.recognizeLocations(files);

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
    // 使用新的搜索方法：先查数据库，没有再调 AI + Google Maps
    // 传入用户位置（如果有的话）和取消令牌
    var result = await _aiService.searchByQuery(
      message,
      userLat: _userLat,
      userLng: _userLng,
      cancelToken: _cancelToken,
    );
    
    // 检查是否已取消
    if (_isCancelled) return;
    
    // 如果需要定位权限，请求权限并重试
    if (result.needsLocationPermission) {
      final granted = await _requestLocationPermission();
      if (_isCancelled) return;
      
      if (granted && _userLat != null && _userLng != null) {
        // 权限已授予，重新搜索
        result = await _aiService.searchByQuery(
          message,
          userLat: _userLat,
          userLng: _userLng,
          cancelToken: _cancelToken,
        );
        if (_isCancelled) return;
      }
    }
    
    // 刷新配额状态
    _loadQuotaStatus();
    
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

      // 保存文本搜索历史
      final history = AIRecognitionHistory(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        timestamp: DateTime.now(),
        imageUrls: [],
        result: result,
        queryText: message,
      );
      await _historyService.saveHistory(history);
    }
  }

  @override
  Widget build(BuildContext context) {
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
        actions: [
          if (_quotaStatus != null) _buildQuotaIndicator(),
        ],
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

  /// 构建配额指示器
  Widget _buildQuotaIndicator() {
    final status = _quotaStatus;
    if (status == null) return const SizedBox.shrink();
    
    final isLow = status.isDeepSearchLow;
    final remaining = status.deepSearchRemaining;
    final total = QuotaService.deepSearchLimit;
    
    return GestureDetector(
      onTap: _showQuotaDetails,
      child: Container(
        margin: const EdgeInsets.only(right: 16),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: isLow ? AppTheme.error.withOpacity(0.1) : AppTheme.background,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isLow ? AppTheme.error : AppTheme.lightGray,
            width: 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.bolt,
              size: 16,
              color: isLow ? AppTheme.error : AppTheme.mediumGray,
            ),
            const SizedBox(width: 4),
            Text(
              '$remaining/$total',
              style: AppTheme.labelSmall(context).copyWith(
                color: isLow ? AppTheme.error : AppTheme.mediumGray,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// 显示配额详情弹窗
  void _showQuotaDetails() {
    final status = _quotaStatus;
    if (status == null) return;
    
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        padding: const EdgeInsets.all(24),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Daily Usage',
                style: AppTheme.headlineMedium(context).copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 20),
              _buildQuotaRow(
                icon: Icons.search,
                label: 'AI Searches',
                used: status.deepSearchCount,
                total: QuotaService.deepSearchLimit,
                isLow: status.isDeepSearchLow,
              ),
              const SizedBox(height: 12),
              _buildQuotaRow(
                icon: Icons.visibility,
                label: 'Detail Views',
                used: status.detailViewCount,
                total: QuotaService.detailViewLimit,
                isLow: status.isDetailViewLow,
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppTheme.background,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.info_outline, size: 18, color: AppTheme.mediumGray),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Resets at midnight UTC (${_quotaService.formatResetTime(status.resetTime)})',
                        style: AppTheme.bodySmall(context).copyWith(color: AppTheme.mediumGray),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              GestureDetector(
                onTap: () => Navigator.pop(context),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryYellow,
                    borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                    border: Border.all(color: AppTheme.black, width: 2),
                  ),
                  child: Center(
                    child: Text(
                      'Got it',
                      style: AppTheme.labelLarge(context).copyWith(
                        color: AppTheme.black,
                        fontWeight: FontWeight.bold,
                      ),
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

  Widget _buildQuotaRow({
    required IconData icon,
    required String label,
    required int used,
    required int total,
    required bool isLow,
  }) {
    final remaining = total - used;
    final progress = used / total;
    
    return Row(
      children: [
        Icon(icon, size: 20, color: isLow ? AppTheme.error : AppTheme.black),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(label, style: AppTheme.bodyMedium(context)),
                  Text(
                    '$remaining left',
                    style: AppTheme.bodySmall(context).copyWith(
                      color: isLow ? AppTheme.error : AppTheme.mediumGray,
                      fontWeight: isLow ? FontWeight.w600 : FontWeight.normal,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: progress,
                  backgroundColor: AppTheme.lightGray,
                  valueColor: AlwaysStoppedAnimation<Color>(
                    isLow ? AppTheme.error : AppTheme.primaryYellow,
                  ),
                  minHeight: 6,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildEmptyState() => Center(
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 120,
            height: 120,
            decoration: BoxDecoration(
              color: Colors.grey[200],
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(height: 32),
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
                  color: AppTheme.primaryYellow.withOpacity(0.3),
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
                  color: AppTheme.primaryYellow.withOpacity(0.3),
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
              onTap: _isSendingMessage 
                  ? _handleCancelRequest 
                  : (_isSendEnabled() ? _handleSendMessage : null),
              child: Container(
                width: 44, height: 44,
                decoration: BoxDecoration(
                  color: _isSendingMessage 
                      ? AppTheme.background
                      : (_isSendEnabled() ? AppTheme.primaryYellow : AppTheme.lightGray),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: _isSendingMessage 
                        ? AppTheme.black 
                        : (_isSendEnabled() ? AppTheme.black : AppTheme.lightGray), 
                    width: 1.5,
                  ),
                ),
                child: Icon(
                  _isSendingMessage ? Icons.stop : Icons.arrow_forward, 
                  color: _isSendingMessage 
                      ? AppTheme.black 
                      : (_isSendEnabled() ? AppTheme.black : AppTheme.mediumGray), 
                  size: 20,
                ),
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
      itemCount: _selectedImages.length + (_selectedImages.length < 5 ? 1 : 0),
      separatorBuilder: (_, __) => const SizedBox(width: 8),
      itemBuilder: (context, index) {
        // 最后一个是添加按钮（如果图片数量小于5）
        if (index == _selectedImages.length && _selectedImages.length < 5) {
          return GestureDetector(
            onTap: _handleAddMore,
            child: Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: AppTheme.lightGray,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppTheme.mediumGray, width: 1),
              ),
              child: const Icon(Icons.add, color: AppTheme.mediumGray, size: 32),
            ),
          );
        }
        
        return Stack(
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
        );
      },
    ),
  );
}

class _SpotCardOverlay extends ConsumerStatefulWidget {
  const _SpotCardOverlay({required this.spot});
  final Spot spot;
  
  // Static cache to prevent repeated API calls
  static final Map<String, bool> _wishlistCache = {};
  static final Map<String, String?> _destinationCache = {};
  static bool _isLoadingCache = false;
  static DateTime? _lastCacheLoad;
  
  @override
  ConsumerState<_SpotCardOverlay> createState() => _SpotCardOverlayState();
}

class _SpotCardOverlayState extends ConsumerState<_SpotCardOverlay> {
  bool _isInWishlist = false;
  String? _destinationId;

  @override
  void initState() {
    super.initState();
    _loadWishlistStatus();
  }

  Future<void> _loadWishlistStatus() async {
    // Check cache first
    final spotId = widget.spot.id;
    if (_SpotCardOverlay._wishlistCache.containsKey(spotId)) {
      if (mounted) {
        setState(() {
          _isInWishlist = _SpotCardOverlay._wishlistCache[spotId] ?? false;
          _destinationId = _SpotCardOverlay._destinationCache[spotId];
        });
      }
      return;
    }
    
    // Prevent concurrent cache loads
    if (_SpotCardOverlay._isLoadingCache) {
      // Wait a bit and check cache again
      await Future.delayed(const Duration(milliseconds: 500));
      if (_SpotCardOverlay._wishlistCache.containsKey(spotId)) {
        if (mounted) {
          setState(() {
            _isInWishlist = _SpotCardOverlay._wishlistCache[spotId] ?? false;
            _destinationId = _SpotCardOverlay._destinationCache[spotId];
          });
        }
      }
      return;
    }
    
    final auth = ref.read(authProvider);
    if (!auth.isAuthenticated) return;
    
    // Only reload cache if it's been more than 30 seconds
    final now = DateTime.now();
    if (_SpotCardOverlay._lastCacheLoad != null && 
        now.difference(_SpotCardOverlay._lastCacheLoad!).inSeconds < 30) {
      return;
    }
    
    _SpotCardOverlay._isLoadingCache = true;
    _SpotCardOverlay._lastCacheLoad = now;
    
    try {
      final repo = ref.read(tripRepositoryProvider);
      final trips = await repo.getMyTrips();
      for (final t in trips) {
        try {
          final detail = await repo.getTripById(t.id);
          for (final ts in detail.tripSpots ?? []) {
            _SpotCardOverlay._wishlistCache[ts.spotId] = true;
            _SpotCardOverlay._destinationCache[ts.spotId] = detail.id;
          }
        } catch (_) {}
      }
      
      // Check if current spot is in wishlist
      if (mounted && _SpotCardOverlay._wishlistCache.containsKey(spotId)) {
        setState(() {
          _isInWishlist = true;
          _destinationId = _SpotCardOverlay._destinationCache[spotId];
        });
      }
    } catch (_) {}
    finally {
      _SpotCardOverlay._isLoadingCache = false;
    }
  }

  Future<void> _handleWishlistToggle() async {
    // 检查登录状态
    final auth = ref.read(authProvider);
    if (!auth.isAuthenticated) {
      // 跳转登录
      final result = await Navigator.of(context).push<bool>(
        MaterialPageRoute(builder: (context) => const LoginPage()),
      );
      if (result != true) return;
    }
    
    // Optimistic UI update - change state immediately
    final wasInWishlist = _isInWishlist;
    final oldDestinationId = _destinationId;
    
    if (wasInWishlist) {
      // Optimistically remove
      setState(() => _isInWishlist = false);
      _SpotCardOverlay._wishlistCache.remove(widget.spot.id);
      _showToast('已从心愿单移除');
    } else {
      // Optimistically add
      setState(() => _isInWishlist = true);
      _SpotCardOverlay._wishlistCache[widget.spot.id] = true;
      _showToast('已添加到心愿单');
    }
    
    // Do the actual API call in background
    try {
      final repo = ref.read(tripRepositoryProvider);
      
      if (wasInWishlist && oldDestinationId != null) {
        // 取消收藏
        await repo.manageTripSpot(
          tripId: oldDestinationId,
          spotId: widget.spot.id,
          remove: true,
        );
        _SpotCardOverlay._destinationCache.remove(widget.spot.id);
        ref.invalidate(tripsProvider);
      } else {
        // 添加收藏
        final destId = await ensureDestinationForCity(ref, widget.spot.city);
        if (destId == null) {
          // Revert on failure
          if (mounted) setState(() => _isInWishlist = false);
          _SpotCardOverlay._wishlistCache.remove(widget.spot.id);
          _showToast('保存失败');
          return;
        }
        _destinationId = destId;
        
        await repo.manageTripSpot(
          tripId: destId,
          spotId: widget.spot.id,
          status: TripSpotStatus.wishlist,
          spotPayload: {
            'name': widget.spot.name,
            'city': widget.spot.city,
            'country': widget.spot.city,
            'latitude': widget.spot.latitude,
            'longitude': widget.spot.longitude,
            'rating': widget.spot.rating,
            'ratingCount': widget.spot.ratingCount,
            'category': widget.spot.category,
            'tags': widget.spot.tags,
            'coverImage': widget.spot.coverImage,
            'images': widget.spot.images,
            'googlePlaceId': widget.spot.id,
            'source': 'ai_search',
          },
        );
        _SpotCardOverlay._destinationCache[widget.spot.id] = destId;
        ref.invalidate(tripsProvider);
      }
    } catch (e) {
      // Revert on error
      if (mounted) {
        setState(() => _isInWishlist = wasInWishlist);
        if (wasInWishlist) {
          _SpotCardOverlay._wishlistCache[widget.spot.id] = true;
        } else {
          _SpotCardOverlay._wishlistCache.remove(widget.spot.id);
        }
      }
      _showToast('操作失败: $e');
    }
  }

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

  void _showToast(String message) {
    DialogUtils.showToast(context, message);
  }

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: () => showModalBottomSheet<void>(
      context: context, isScrollControlled: true, backgroundColor: Colors.transparent,
      builder: (context) => UnifiedSpotDetailModal(spot: widget.spot, keepOpenOnAction: true, hideCollectionEntry: true),
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
                      colors: [Colors.transparent, Colors.black.withOpacity(0.7)],
                      stops: const [0.4, 1.0],
                    ),
                  ),
                ),
              ),
              // AI badge - top left (subtle style) - only show for AI results
              if (widget.spot.isFromAI)
                Positioned(
                  top: 12, left: 12,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.85),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text('✨', style: TextStyle(fontSize: 9)),
                        const SizedBox(width: 2),
                        Text('AI', style: AppTheme.bodySmall(context).copyWith(
                          fontSize: 9,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.black.withOpacity(0.6),
                        )),
                      ],
                    ),
                  ),
                ),
              Positioned(
                left: 12, right: 12, bottom: 12,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Tags - 64% white background, 20% black border, 48% black text
                    if (widget.spot.tags.isNotEmpty)
                      Wrap(
                        spacing: 6, runSpacing: 6,
                        children: widget.spot.tags.take(3).map((tag) => Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.64),
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(color: Colors.black.withOpacity(0.2), width: 1),
                          ),
                          child: Text(tag, style: AppTheme.bodySmall(context).copyWith(
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                            color: Colors.black.withOpacity(0.48),
                          )),
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
                        style: AppTheme.bodySmall(context).copyWith(color: Colors.white.withOpacity(0.8), fontSize: 12)),
                    ]),
                  ],
                ),
              ),
              // Neo brutalism style favorite button - circular
              Positioned(
                top: 12, right: 12,
                child: GestureDetector(
                  onTap: _handleWishlistToggle,
                  child: Container(
                    width: 40, height: 40,
                    decoration: BoxDecoration(
                      color: _isInWishlist ? AppTheme.primaryYellow : Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: AppTheme.black, width: 2),
                      boxShadow: const [
                        BoxShadow(
                          color: AppTheme.black,
                          offset: Offset(2, 2),
                          blurRadius: 0,
                        ),
                      ],
                    ),
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        // Heart icon with stroke effect using two icons
                        Icon(
                          Icons.favorite,
                          size: 22,
                          color: _isInWishlist ? AppTheme.primaryYellow : Colors.white,
                        ),
                        Icon(
                          Icons.favorite_border,
                          size: 22,
                          color: AppTheme.black,
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
    ),
  );
}
