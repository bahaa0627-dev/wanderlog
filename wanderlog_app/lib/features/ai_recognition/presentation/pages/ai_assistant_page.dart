import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import 'package:image_picker/image_picker.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/core/l10n/app_localizations.dart';
import 'package:wanderlog/features/ai_recognition/data/models/ai_recognition_history.dart';
import 'package:wanderlog/features/ai_recognition/data/models/ai_recognition_result.dart';
import 'package:wanderlog/features/ai_recognition/data/models/search_v2_result.dart';
import 'package:wanderlog/features/ai_recognition/data/services/ai_recognition_history_service.dart';
import 'package:wanderlog/features/ai_recognition/data/services/ai_recognition_service.dart';
import 'package:wanderlog/features/ai_recognition/data/services/search_v2_service.dart';
import 'package:wanderlog/features/ai_recognition/presentation/widgets/category_section.dart';
import 'package:wanderlog/features/ai_recognition/presentation/widgets/flat_place_list.dart';
import 'package:wanderlog/features/ai_recognition/presentation/widgets/recommendation_map_view.dart';
import 'package:wanderlog/features/ai_recognition/providers/wishlist_status_provider.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart'
    show Spot, SpotSource;
import 'package:wanderlog/features/map/data/models/public_place_dto.dart'
    show PlaceCustomFields;
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/features/collections/providers/collection_providers.dart';
import 'package:wanderlog/shared/models/trip_model.dart';
import 'package:wanderlog/core/providers/locale_provider.dart';
import 'package:wanderlog/core/utils/dialog_utils.dart';
import 'package:wanderlog/shared/widgets/unified_spot_detail_modal.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';
import 'package:wanderlog/shared/utils/destination_utils.dart';
import 'package:wanderlog/shared/utils/number_format_utils.dart';
import 'dart:math' as math;
import 'package:wanderlog/shared/models/trip_spot_model.dart'
    show TripSpot, TripSpotStatus;

/// 聊天消息模型
class _ChatMessage {
  _ChatMessage({
    required this.id,
    required this.isUser,
    required this.timestamp,
    this.text,
    this.imageUrls,
    this.spots,
    this.searchV2Result,
    this.isNew = false,
  });

  final String id;
  final bool isUser;
  final String? text;
  final List<String>? imageUrls;
  final List<Spot>? spots;
  final SearchV2Result? searchV2Result;
  final DateTime timestamp;
  bool isNew; // 标记是否是新消息，用于触发渐显动画
}

/// AI Assistant 页面 - 聊天式全屏页面
///
/// Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 9.1, 10.1, 10.2, 12.1, 12.2, 12.3, 13.3, 13.4
class AIAssistantPage extends ConsumerStatefulWidget {
  const AIAssistantPage({super.key});

  @override
  ConsumerState<AIAssistantPage> createState() => _AIAssistantPageState();
}

class _AIAssistantPageState extends ConsumerState<AIAssistantPage> {
  final _historyService = AIRecognitionHistoryService();
  final _aiService = AIRecognitionService(dio: Dio());
  late final SearchV2Service _searchV2Service;
  final _scrollController = ScrollController();
  final _messageController = TextEditingController();
  final _focusNode = FocusNode();

  final List<_ChatMessage> _messages = [];
  bool _isLoading = true;
  bool _isSendingMessage = false;
  final List<XFile> _selectedImages = [];
  CancelToken? _cancelToken;

  // SearchV2 状态
  SearchLoadingState _searchLoadingState = const SearchLoadingState.complete();

  @override
  void initState() {
    super.initState();
    _searchV2Service = SearchV2Service(dio: Dio());
    print('🚀 AIAssistantPage initState called');
    _preloadWishlistStatus();
    _loadHistories();

    // 首次构建完成后滚动到底部
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scrollToBottomWithRetry();
    });
  }

  /// 预加载收藏状态，确保卡片显示时状态已就绪
  Future<void> _preloadWishlistStatus() async {
    // 触发 wishlistStatusProvider 加载
    ref.read(wishlistStatusProvider);
  }

  Future<void> _loadHistories() async {
    setState(() => _isLoading = true);
    final histories = await _historyService.getHistories();
    final reversedHistories = histories.reversed.toList();

    for (final history in reversedHistories) {
      // 添加用户消息
      if (history.imageUrls.isNotEmpty) {
        // 图片识别历史
        _messages.add(
          _ChatMessage(
            id: '${history.id}_user_img',
            isUser: true,
            imageUrls: history.imageUrls,
            text: history.queryText ?? 'Help me find these places',
            timestamp: history.timestamp,
          ),
        );
      } else if (history.queryText != null && history.queryText!.isNotEmpty) {
        // 文本搜索历史
        _messages.add(
          _ChatMessage(
            id: '${history.id}_user_text',
            isUser: true,
            text: history.queryText,
            timestamp: history.timestamp,
          ),
        );
      }

      // 添加 AI 回复消息
      if (history.hasSearchV2Result) {
        // 新格式：使用 SearchV2Result 展示（包含分类、地图等）
        _messages.add(
          _ChatMessage(
            id: '${history.id}_ai_v2',
            isUser: false,
            searchV2Result: history.searchV2Result,
            timestamp: history.timestamp,
          ),
        );
      } else {
        // 旧格式：兼容旧的历史记录
        _messages.add(
          _ChatMessage(
            id: '${history.id}_ai_text',
            isUser: false,
            text: history.result.message,
            timestamp: history.timestamp,
          ),
        );
        if (history.result.spots.isNotEmpty) {
          _messages.add(
            _ChatMessage(
              id: '${history.id}_ai_spots',
              isUser: false,
              spots: history.result.spots.cast<Spot>(),
              timestamp: history.timestamp,
            ),
          );
        }
      }
    }

    setState(() => _isLoading = false);
    // 多次尝试滚动，确保内容完全渲染后滚动到底部
    _scrollToBottomWithRetry();
  }

  /// 多次尝试滚动到底部，确保内容完全渲染
  void _scrollToBottomWithRetry() {
    // 立即尝试一次
    _scrollToBottom();
    // 100ms 后再试
    Future.delayed(const Duration(milliseconds: 100), _scrollToBottom);
    // 300ms 后再试（等待图片等异步内容）
    Future.delayed(const Duration(milliseconds: 300), _scrollToBottom);
    // 500ms 后最后一次
    Future.delayed(const Duration(milliseconds: 500), _scrollToBottom);
  }

  void _scrollToBottom({bool animated = false}) {
    if (!mounted) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (_scrollController.hasClients) {
        final maxExtent = _scrollController.position.maxScrollExtent;
        if (maxExtent > 0) {
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
    return;
    if (_selectedImages.length >= 5) {
      final l10n = AppLocalizations(ref.read(localeProvider).languageCode);
      DialogUtils.showInfoSnackBar(context, l10n.maxImagesReached);
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
                onTap: () {
                  Navigator.pop(context);
                  _takePhoto();
                },
              ),
              const SizedBox(width: 16),
              _buildOptionButton(
                icon: Icons.photo_library,
                label: 'Album',
                onTap: () {
                  Navigator.pop(context);
                  _pickFromGallery();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildOptionButton(
          {required IconData icon,
          required String label,
          required VoidCallback onTap}) =>
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
      final images = await picker.pickMultiImage(
          maxWidth: 1920, maxHeight: 1920, imageQuality: 85);
      if (images.isNotEmpty)
        setState(() => _selectedImages.addAll(images.take(remaining)));
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
          imageQuality: 85);
      if (image != null) setState(() => _selectedImages.add(image));
    } catch (e) {
      print('拍照错误: $e');
    }
  }

  bool _isSendEnabled() =>
      _selectedImages.isNotEmpty || _messageController.text.trim().isNotEmpty;

  Future<void> _handleSendMessage() async {
    final message = _messageController.text.trim();
    if (_selectedImages.isEmpty && message.isEmpty) return;

    // If user is not logged in, ensure we don't append the message or send the
    // query. If user cancels login and returns, keep the page in empty state.
    final existingUser = ref.read(authProvider).user;
    if (existingUser == null) {
      final authed = await requireAuth(context, ref);
      if (!authed || !mounted) return;
    }

    final imagesToSend = List<XFile>.from(_selectedImages);
    final textToSend = message;

    setState(() => _selectedImages.clear());
    _messageController.clear();
    _focusNode.unfocus();

    final userMessageId = 'user_${DateTime.now().millisecondsSinceEpoch}';
    setState(() {
      if (imagesToSend.isNotEmpty) {
        _messages.add(
          _ChatMessage(
            id: userMessageId,
            isUser: true,
            imageUrls: imagesToSend.map((e) => e.path).toList(),
            text: textToSend.isNotEmpty
                ? textToSend
                : 'Help me find these places',
            timestamp: DateTime.now(),
          ),
        );
      } else {
        _messages.add(_ChatMessage(
            id: userMessageId,
            isUser: true,
            text: textToSend,
            timestamp: DateTime.now()));
      }
      _isSendingMessage = true;
      _cancelToken = CancelToken();
    });
    _scrollToBottom(animated: true);

    try {
      if (imagesToSend.isNotEmpty) {
        debugPrint(
            '🖼️ [AIAssistant] Has images, calling _handleImageRecognition');
        await _handleImageRecognition(imagesToSend, textToSend);
      } else {
        // 使用 SearchV2 进行文本搜索
        debugPrint(
            '📝 [AIAssistant] Text only, calling _handleSearchV2: $textToSend');
        await _handleSearchV2(textToSend);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _messages.add(
            _ChatMessage(
              id: 'error_${DateTime.now().millisecondsSinceEpoch}',
              isUser: false,
              text: '抱歉，处理消息时出错了：$e',
              timestamp: DateTime.now(),
            ),
          );
        });
      }
    } finally {
      if (mounted && _isSendingMessage) {
        setState(() {
          _isSendingMessage = false;
          _cancelToken = null;
          _searchLoadingState = const SearchLoadingState.complete();
        });
      }
      _scrollToBottom(animated: true);
    }
  }

  /// 取消当前请求
  void _handleCancelRequest() {
    if (_cancelToken != null && !_cancelToken!.isCancelled) {
      _cancelToken!.cancel('User cancelled the request');
      setState(() {
        _isSendingMessage = false;
        _cancelToken = null;
        _searchLoadingState = const SearchLoadingState.complete();
      });
    }
  }

  /// 使用 SearchV2 进行搜索
  /// Requirements: 7.1, 7.2, 7.3, 7.4
  Future<void> _handleSearchV2(String query) async {
    debugPrint('🔍 [SearchV2] Starting search for: $query');
    var user = ref.read(authProvider).user;
    if (user == null) {
      // 未登录时跳转到登录页面
      final authed = await requireAuth(context, ref);
      if (!authed || !mounted) return;
      // 登录成功后重新获取用户信息
      user = ref.read(authProvider).user;
      if (user == null) return;
    }

    // 不在前端检查配额，让后端来判断
    // 后端会返回 429 错误如果配额用完

    // 语言检测逻辑：用户用什么语言就回复什么语言（只支持中英文）
    final userSettingsLanguage = ref.read(localeProvider).languageCode;
    final language = _detectQueryLanguage(query, userSettingsLanguage);
    debugPrint(
        '🌐 [SearchV2] Settings language: $userSettingsLanguage, Detected/Using: $language');

    final result = await _searchV2Service.searchV2(
      query: query,
      userId: user.id,
      language: language,
      onStageChange: (state) {
        if (mounted) {
          setState(() => _searchLoadingState = state);
          // 每次阶段变化时自动滚动到底部，确保用户能看到最新输出
          _scrollToBottom(animated: true);
        }
      },
      cancelToken: _cancelToken,
    );

    if (!mounted) return;

    if (result.error != null) {
      setState(() {
        _messages.add(
          _ChatMessage(
            id: 'error_${DateTime.now().millisecondsSinceEpoch}',
            isUser: false,
            text: result.error!,
            timestamp: DateTime.now(),
          ),
        );
      });
      return;
    }

    // 添加 SearchV2 结果消息（标记为新消息，触发渐显动画）
    setState(() {
      _messages.add(
        _ChatMessage(
          id: 'ai_v2_${DateTime.now().millisecondsSinceEpoch}',
          isUser: false,
          searchV2Result: result,
          timestamp: DateTime.now(),
          isNew: true,
        ),
      );
    });

    // 🚀 修复：添加结果后自动滚动到底部，确保用户能看到完整响应
    _scrollToBottomWithRetry();

    // 保存历史记录（保存完整的 SearchV2Result）
    if (result.success) {
      final spots = result.allPlaces.map(_placeResultToSpot).toList();
      final history = AIRecognitionHistory(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        timestamp: DateTime.now(),
        imageUrls: [],
        result: AIRecognitionResult(
          message: result.acknowledgment,
          spots: spots,
          imageUrls: [],
        ),
        queryText: query,
        searchV2Result: result, // 保存完整的 SearchV2Result
      );
      await _historyService.saveHistory(history);
      debugPrint('✅ [SearchV2] History saved for query: $query');
    }
  }

  Future<void> _handleImageRecognition(
      List<XFile> images, String? additionalText) async {
    if (mounted) {
      setState(
        () => _searchLoadingState = const SearchLoadingState.analyzing(),
      );
    }
    await Future<void>.delayed(const Duration(seconds: 3));
    if (mounted) {
      setState(
        () => _searchLoadingState = const SearchLoadingState.searching(),
      );
    }

    final files = images.map((xfile) => File(xfile.path)).toList();
    final result = await _aiService.recognizeLocations(files);

    if (mounted) {
      setState(
        () => _searchLoadingState = const SearchLoadingState.summarizing(),
      );
    }
    await Future<void>.delayed(const Duration(seconds: 5));

    if (mounted) {
      setState(() {
        _messages.add(
          _ChatMessage(
            id: 'ai_text_${DateTime.now().millisecondsSinceEpoch}',
            isUser: false,
            text: result.message,
            timestamp: DateTime.now(),
          ),
        );
        if (result.spots.isNotEmpty) {
          _messages.add(
            _ChatMessage(
              id: 'ai_spots_${DateTime.now().millisecondsSinceEpoch}',
              isUser: false,
              spots: result.spots.cast<Spot>(),
              timestamp: DateTime.now(),
            ),
          );
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

  /// 检测用户输入的语言（只支持中文和英文）
  /// 有中文字符 → 中文回复，否则 → 英文回复
  String _detectQueryLanguage(String query, String defaultLanguage) {
    if (query.trim().isEmpty) {
      return 'en'; // 默认英文
    }

    // 检测中文字符
    final chineseRegex = RegExp(r'[\u4e00-\u9fff\u3400-\u4dbf]');
    final hasChinese = chineseRegex.hasMatch(query);

    // 有中文就用中文，否则用英文
    return hasChinese ? 'zh' : 'en';
  }

  /// 检测文本是否包含中文字符
  bool _containsChinese(String text) {
    if (text.trim().isEmpty) return false;
    final chineseRegex = RegExp(r'[\u4e00-\u9fff\u3400-\u4dbf]');
    return chineseRegex.hasMatch(text);
  }

  /// 将 PlaceResult 转换为 Spot
  Spot _placeResultToSpot(PlaceResult place) {
    debugPrint(
        '🏷️ [_placeResultToSpot] Converting "${place.name}" - tags: ${place.tags}');

    // 解析 openingHours（可能是 JSON 字符串数组或 Map）
    Map<String, dynamic>? parsedOpeningHours;
    if (place.openingHours != null && place.openingHours!.isNotEmpty) {
      try {
        final decoded = jsonDecode(place.openingHours!);
        if (decoded is Map<String, dynamic>) {
          // 已经是正确的格式
          parsedOpeningHours = decoded;
        } else if (decoded is List) {
          // 后端返回的是字符串数组，转换为 weekday_text 格式
          parsedOpeningHours = {
            'weekday_text': decoded.map((e) => e.toString()).toList(),
          };
        }
      } catch (_) {
        // 如果解析失败，忽略
      }
    }

    // 组装展示标签（优先 displayTagsEn，否则用 tags + 推断分类）
    List<String> effectiveDisplayTags =
        place.displayTagsEn?.where((t) => t.isNotEmpty).toList() ?? [];
    if (effectiveDisplayTags.isEmpty) {
      final tags = place.tags ?? [];
      String? inferredCategory;
      final lowerTags = tags.map((t) => t.toLowerCase()).toList();
      if (lowerTags.any((t) =>
          t.contains('restaurant') ||
          t.contains('ramen') ||
          t.contains('food') ||
          t.contains('cafe'))) {
        inferredCategory = 'Restaurant';
      } else if (lowerTags.any((t) => t.contains('museum'))) {
        inferredCategory = 'Museum';
      } else if (lowerTags.any((t) => t.contains('park'))) {
        inferredCategory = 'Park';
      }
      if (inferredCategory != null && inferredCategory.isNotEmpty) {
        effectiveDisplayTags.add(inferredCategory);
      }
      for (final tag in tags) {
        if (tag.isEmpty) continue;
        if (!effectiveDisplayTags.contains(tag)) {
          effectiveDisplayTags.add(tag);
        }
      }
    }

    // 从 displayTagsEn 获取 category（第一个标签）
    String category = 'Place';
    if (effectiveDisplayTags.isNotEmpty) {
      category = effectiveDisplayTags.first;
    } else if (place.tags?.isNotEmpty ?? false) {
      category = place.tags!.first;
    }
    debugPrint(
        '🏷️ [_placeResultToSpot] "${place.name}" category: $category, displayTagsEn: ${place.displayTagsEn}, all tags: ${place.tags}');

    return Spot(
      id: place.id ?? place.name,
      name: place.name,
      city: place.city ?? '',
      category: category,
      latitude: place.latitude,
      longitude: place.longitude,
      rating: place.rating ?? 0.0,
      ratingCount: place.ratingCount ?? 0,
      coverImage: place.coverImage,
      images: place.images.isNotEmpty ? place.images : [place.coverImage],
      tags: place.tags ?? [],
      displayTagsEn: effectiveDisplayTags,
      aiSummary: place.summary,
      isFromAI: place.source == PlaceSource.ai,
      isVerified: place.isVerified,
      recommendationPhrase: place.recommendationPhrase,
      source: _convertSource(place.source),
      // 详情页需要的额外字段
      address: place.address,
      phoneNumber: place.phoneNumber,
      website: place.website,
      openingHours: parsedOpeningHours,
      customFields: place.customFields != null
          ? PlaceCustomFields.fromJson(place.customFields)
          : null,
    );
  }

  SpotSource _convertSource(PlaceSource source) {
    switch (source) {
      case PlaceSource.google:
        return SpotSource.google;
      case PlaceSource.cache:
        return SpotSource.cache;
      case PlaceSource.ai:
        return SpotSource.ai;
    }
  }

  /// 显示地点详情
  /// 如果详情字段缺失但有 ID，会从后端获取完整数据
  void _showPlaceDetail(PlaceResult place) async {
    debugPrint('🔍 [AIAssistant] _showPlaceDetail for: ${place.name}');

    final placeId = place.id;
    final isAiGeneratedPlace = (place.source == PlaceSource.ai) ||
        (placeId?.startsWith('ai_') ?? false);
    final isUuid = placeId != null &&
        RegExp(
          r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
        ).hasMatch(placeId);

    // 检查是否需要从后端获取详情（有 ID 但缺少详情字段或缺少 customFields）
    // 注意：AI 生成的 placeId（ai_xxx）不是数据库 UUID，后端通常无法按 ID 返回详情。
    // 当 customFields 缺失时也需要获取，以确保剧照等数据能正确显示
    final needsFetch = isUuid &&
        !isAiGeneratedPlace &&
        (place.customFields == null ||
            (place.address == null &&
                place.phoneNumber == null &&
                place.website == null));

    if (needsFetch) {
      debugPrint(
          '🔍 [AIAssistant] Fetching fresh data for place ID: ${place.id}');

      // 先显示 loading 状态的 modal
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (context) => _PlaceDetailLoader(
          placeId: place.id!,
          fallbackPlace: place,
          placeResultToSpot: _placeResultToSpot,
        ),
      );
    } else {
      // 已有详情数据，从服务器加载最新状态
      final spot = _placeResultToSpot(place);
      final spotId = spot.id;

      bool? initialIsSaved;
      bool? initialIsMustGo;
      bool? initialIsTodaysPlan;
      bool? initialIsVisited;
      DateTime? initialVisitDate;
      int? initialUserRating;
      String? initialUserNotes;
      List<String>? initialUserPhotos;
      String? initialDestinationId;
      Map<String, dynamic>? linkedCollection;

      try {
        final authState = ref.read(authProvider);
        if (authState.isAuthenticated) {
          // 显示loading indicator
          if (mounted) {
            showDialog<void>(
              context: context,
              barrierDismissible: false,
              builder: (context) => const Center(
                child: CircularProgressIndicator(color: AppTheme.primaryYellow),
              ),
            );
          }

          // 等待可能正在进行的收藏/取消收藏操作完成
          await WishlistStatusCache.awaitPendingOperation(spotId);
          if (spot.name.isNotEmpty) {
            await WishlistStatusCache.awaitPendingOperation(spot.name);
          }

          final tripRepo = ref.read(tripRepositoryProvider);
          final trips = await tripRepo
              .getMyTrips()
              .timeout(
                const Duration(seconds: 2),
                onTimeout: () => <Trip>[],
              )
              .timeout(
                const Duration(seconds: 2),
                onTimeout: () => <Trip>[],
              );

          for (final trip in trips) {
            // 优先使用 getMyTrips 已包含的 tripSpots，避免额外请求
            List<TripSpot> tripSpots = trip.tripSpots ?? [];
            if (tripSpots.isEmpty) {
              final tripDetail = await tripRepo.getTripById(trip.id);
              tripSpots = tripDetail.tripSpots ?? [];
            }

            for (final ts in tripSpots) {
              bool isMatch = false;
              if (ts.spot?.id == spotId) {
                isMatch = true;
              } else if (ts.spot?.name == spot.name && spot.name.isNotEmpty) {
                isMatch = true;
              } else if (ts.spot?.googlePlaceId != null &&
                  ts.spot?.googlePlaceId == spotId) {
                isMatch = true;
              }

              if (isMatch) {
                initialIsSaved = ts.isSaved == true;
                initialIsMustGo = ts.isMustGo == true;
                initialIsTodaysPlan = ts.isTodaysPlan == true;
                initialIsVisited = ts.isVisited == true;
                initialVisitDate = ts.visitDate;
                initialUserRating = ts.userRating;
                initialUserNotes = ts.userNotes;
                initialUserPhotos = ts.userPhotos?.cast<String>();
                initialDestinationId = trip.id;
                break;
              }
            }
            if (initialDestinationId != null) break;
          }

          // 💾 保存到缓存供后续使用
          WishlistStatusCache.updateFullStatus(
            spotId,
            destinationId: initialDestinationId,
            isSaved: initialIsSaved ?? false,
            isMustGo: initialIsMustGo,
            isTodaysPlan: initialIsTodaysPlan,
            isVisited: initialIsVisited,
            visitDate: initialVisitDate,
            userRating: initialUserRating,
            userNotes: initialUserNotes,
            userPhotos: initialUserPhotos,
          );

          // 预加载合集数据（避免详情页闪现）
          try {
            final uuidRegex = RegExp(
              r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
              caseSensitive: false,
            );
            if (uuidRegex.hasMatch(spotId)) {
              final collectionRepo = ref.read(collectionRepositoryProvider);
              final collections = await collectionRepo
                  .getCollectionsForPlace(spotId)
                  .timeout(const Duration(milliseconds: 1200), onTimeout: () => <Map<String, dynamic>>[]);
              if (collections.isNotEmpty) {
                // 随机选择一个合集展示
                final random = math.Random();
                linkedCollection = collections[random.nextInt(collections.length)];
              }
            }
          } catch (e) {
            debugPrint('⚠️ [AIAssistant] Error loading linked collection: $e');
          }

          // 关闭loading dialog
          if (mounted && Navigator.canPop(context)) {
            Navigator.pop(context);
          }
        }
      } catch (e) {
        debugPrint('❌ [AIAssistant] Error loading status: $e');
        // 关闭loading dialog
        if (mounted && Navigator.canPop(context)) {
          Navigator.pop(context);
        }
        // 回退到缓存
        final fullStatus = WishlistStatusCache.getFullStatus(spotId);
        initialIsSaved =
            fullStatus?.isSaved ?? fullStatus?.destinationId != null;
        initialIsMustGo = fullStatus?.isMustGo;
        initialIsTodaysPlan = fullStatus?.isTodaysPlan;
        initialIsVisited = fullStatus?.isVisited;
        initialVisitDate = fullStatus?.visitDate;
        initialUserRating = fullStatus?.userRating;
        initialUserNotes = fullStatus?.userNotes;
        initialUserPhotos = fullStatus?.userPhotos;
        initialDestinationId = fullStatus?.destinationId;
      }

      if (!mounted) return;

      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (context) => UnifiedSpotDetailModal(
          spot: spot,
          keepOpenOnAction: true,
          linkedCollection: linkedCollection,
          initialIsSaved: initialIsSaved,
          initialIsMustGo: initialIsMustGo,
          initialIsTodaysPlan: initialIsTodaysPlan,
          initialIsVisited: initialIsVisited,
          initialVisitDate: initialVisitDate,
          initialUserRating: initialUserRating,
          initialUserNotes: initialUserNotes,
          initialUserPhotos: initialUserPhotos,
          initialDestinationId: initialDestinationId,
        ),
      );
    }
  }

  /// 打开外部 URL
  Future<void> _launchUrl(String url) async {
    String fullUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      fullUrl = 'https://$url';
    }
    final uri = Uri.tryParse(fullUrl);
    if (uri != null && await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      debugPrint('🔗 Cannot launch URL: $fullUrl');
    }
  }

  @override
  Widget build(BuildContext context) {
    print(
        '🎨 AIAssistantPage build called, isLoading: $_isLoading, messages: ${_messages.length}');
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon:
              const Icon(Icons.arrow_back_ios, color: AppTheme.black, size: 20),
          onPressed: () {
            ref.invalidate(wishlistStatusProvider);
            ref.invalidate(tripsProvider);
            Navigator.pop(context);
          },
        ),
        title: Text('VAGO AI',
            style: AppTheme.headlineMedium(context).copyWith(fontSize: 18)),
        centerTitle: false,
        actions: const [],
      ),
      body: Column(
        children: [
          Expanded(
            child: _isLoading
                ? const Center(
                    child: CircularProgressIndicator(
                        valueColor: AlwaysStoppedAnimation<Color>(
                            AppTheme.primaryYellow)))
                : _messages.isEmpty
                    ? _buildEmptyState()
                    : _buildMessageList(),
          ),
          _buildInputArea(),
        ],
      ),
    );
  }

  Widget _buildEmptyState() => Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final double imageSize =
                  (constraints.maxWidth * 0.9).clamp(300.0, 420.0).toDouble();

              return Column(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: imageSize,
                    height: imageSize,
                    child: Image.asset(
                      'assets/images/AI default.png',
                      fit: BoxFit.contain,
                    ),
                  ),
                  Transform.translate(
                    offset: const Offset(0, -20),
                    child: Text(
                      'Find anywhere you VAGO',
                      style: AppTheme.bodyMedium(context).copyWith(
                        color: AppTheme.mediumGray,
                        height: 1.35,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      );

  Widget _buildMessageList() => ListView.builder(
        controller: _scrollController,
        padding: const EdgeInsets.all(16),
        itemCount: _messages.length + (_isSendingMessage ? 1 : 0),
        // 确保列表可以滚动到底部
        shrinkWrap: false,
        itemBuilder: (context, index) {
          if (index == _messages.length) return _buildLoadingIndicator();
          final message = _messages[index];
          return Padding(
            padding: const EdgeInsets.only(bottom: 24),
            child: message.isUser
                ? _buildUserMessage(message)
                : _AnimatedAIMessage(
                    key: ValueKey(message.id),
                    message: message,
                    builder: _buildAIMessage,
                  ),
          );
        },
      );

  /// 构建三阶段 loading 指示器
  /// Requirements: 7.1, 7.2, 7.3, 7.4
  Widget _buildLoadingIndicator() {
    final locale = Localizations.localeOf(context).languageCode;
    final message = _searchLoadingState.getLocalizedMessage(locale);
    final progress = _searchLoadingState.progress;

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 直接显示文本，不使用 AI 头像和底卡 - Requirements: 12.1, 12.2, 12.3
          Row(
            children: [
              SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  value: progress < 1.0 ? null : progress,
                  valueColor: const AlwaysStoppedAnimation<Color>(
                      AppTheme.primaryYellow),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  message.isNotEmpty ? message : 'Processing...',
                  style: AppTheme.bodyMedium(context).copyWith(
                    color: AppTheme.mediumGray,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

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
                      border: Border.all(color: AppTheme.black, width: 1.5),
                    ),
                    child: _buildImageGrid(message.imageUrls!),
                  ),
                if (message.text != null && message.text!.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 12),
                    constraints: const BoxConstraints(maxWidth: 280),
                    decoration: BoxDecoration(
                      color: AppTheme.primaryYellow.withValues(alpha: 0.3),
                      borderRadius: const BorderRadius.only(
                        topLeft: Radius.circular(16),
                        topRight: Radius.circular(4),
                        bottomLeft: Radius.circular(16),
                        bottomRight: Radius.circular(16),
                      ),
                      border: Border.all(color: AppTheme.black, width: 1.5),
                    ),
                    child: Text(message.text!,
                        style: AppTheme.bodyMedium(context)
                            .copyWith(fontWeight: FontWeight.w500)),
                  ),
              ],
            ),
          ),
        ],
      );

  /// 构建 AI 消息 - 移除头像和底卡
  /// Requirements: 12.1, 12.2, 12.3
  Widget _buildAIMessage(_ChatMessage message) {
    // 如果是 SearchV2 结果，使用专门的展示组件
    if (message.searchV2Result != null) {
      return _buildSearchV2Result(message.searchV2Result!);
    }

    // 普通文本消息 - 直接显示文本，不使用头像和底卡
    // 只显示有有效封面图的地点卡片
    final spotsWithImage =
        message.spots?.where((spot) => spot.hasValidCoverImage).toList() ?? [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (message.text != null && message.text!.isNotEmpty)
          _buildMarkdownText(message.text!),
        if (spotsWithImage.isNotEmpty)
          ...spotsWithImage.map(
            (spot) => Padding(
              padding: const EdgeInsets.only(top: 12),
              child: _SpotCardOverlay(spot: spot),
            ),
          ),
      ],
    );
  }

  /// 构建 SearchV2 结果展示
  /// Requirements: 8.1, 8.2, 8.3, 9.1, 10.1, 10.2
  Widget _buildSearchV2Result(SearchV2Result result) {
    debugPrint('🎨 [_buildSearchV2Result] intent: ${result.intent}');
    debugPrint(
        '🎨 [_buildSearchV2Result] isTextResponse: ${result.isTextResponse}');
    debugPrint(
        '🎨 [_buildSearchV2Result] textContent: ${result.textContent?.length ?? 0} chars');
    debugPrint(
        '🎨 [_buildSearchV2Result] acknowledgment: ${result.acknowledgment.length} chars');
    debugPrint(
        '🎨 [_buildSearchV2Result] hasCategories: ${result.hasCategories}');
    debugPrint('🎨 [_buildSearchV2Result] places: ${result.places.length}');
    debugPrint(
        '🎨 [_buildSearchV2Result] cityPlaces: ${result.cityPlaces?.length ?? 0}');

    // 处理文本响应（non_travel 或 travel_consultation 或 general_search_text）
    if (result.isTextResponse) {
      final textContent = result.textContent ?? '';
      // 合并所有地点来源：优先使用 mapPlaces（有坐标的地点），然后是 places，最后是 textOnlyPlaces
      final List<PlaceResult> allAvailablePlaces = [
        ...(result.mapPlaces ?? <PlaceResult>[]),
        ...result.places,
        ...result.textOnlyPlaces,
      ];
      final textPlaces = _mergePlacesForText(allAvailablePlaces, []);

      debugPrint(
          '🗺️ [_buildSearchV2Result] Text mode - mapPlaces: ${result.mapPlaces?.length ?? 0}, places: ${result.places.length}, textOnlyPlaces: ${result.textOnlyPlaces.length}, merged: ${textPlaces.length}');

      // 如果没有文本内容，显示默认消息
      if (textContent.isEmpty) {
        return Text(
          'Sorry, unable to generate a response. Please try again.',
          style: AppTheme.bodyMedium(context).copyWith(
            color: AppTheme.mediumGray,
            height: 1.5,
          ),
        );
      }

      // travel_consultation 有城市分组时，穿插显示文本和卡片
      if (result.cityPlaces != null && result.cityPlaces!.isNotEmpty) {
        return _buildInterleavedCityContent(
          textContent,
          result.cityPlaces!,
          textOnlyPlaces: result.textOnlyPlaces,
          nameMapping: result.nameMapping,
        );
      }

      // 普通文本响应（non_travel 或没有城市分组的 travel_consultation 或 general_search_text）
      // 分开有图片和无图片的地点
      final placesWithImage =
          textPlaces.where((p) => p.hasValidCoverImage).toList();
      // 优先使用 mapPlaces 获取有坐标的地点，否则从 textPlaces 中筛选
      final placesWithCoordinates =
          textPlaces.where((p) => p.latitude != 0 && p.longitude != 0).toList();
      debugPrint(
          '🖼️ [_buildSearchV2Result] Places: ${placesWithImage.length} with image, ${placesWithCoordinates.length} with coordinates');

      // 检查是否为行程类文本（Day 1/第一天 + 时间段格式）
      final isItinerary = _looksLikeItinerary(textContent);
      debugPrint('📅 [_buildSearchV2Result] isItinerary: $isItinerary');

      // 🆕 如果 nameMapping 为空，自动从 textContent 中提取中文地点名并尝试匹配
      List<PlaceNameMapping>? effectiveNameMapping = result.nameMapping;
      if ((effectiveNameMapping == null || effectiveNameMapping.isEmpty) &&
          textPlaces.isNotEmpty) {
        effectiveNameMapping =
            _generateNameMappingFromText(textContent, textPlaces);
        if (effectiveNameMapping.isNotEmpty) {
          debugPrint(
              '🗺️ [_buildSearchV2Result] Generated ${effectiveNameMapping.length} name mappings from text');
        }
      }

      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 文本内容 - 行程使用卡片式展示，普通文本使用 Markdown
          // 传入 nameMapping 用于匹配中文地点名到英文数据库名
          if (isItinerary)
            _buildItineraryPlan(textContent,
                places: textPlaces, nameMapping: effectiveNameMapping)
          else
            _buildMarkdownText(textContent,
                places: textPlaces, nameMapping: effectiveNameMapping),

          // 显示地点卡片和地图的条件：
          // 1. 不是 non_travel 意图
          // 2. 不是纯城市推荐（没有具体景点），或者是 regular_travel 且有匹配到的地点
          // regular_travel 会返回 matchedPlaces（如罗马斗兽场、卢浮宫等具体景点），应该展示
          if (!result.isNonTravel &&
              (!result.isCityRecommendation ||
                  (result.isRegularTravel && placesWithImage.isNotEmpty))) ...[
            // 有图片的地点：显示大卡片
            if (placesWithImage.isNotEmpty) ...[
              const SizedBox(height: 20),
              _buildHorizontalPlaceCards(placesWithImage),
            ],

            // 地图展示（只显示有坐标的地点）
            if (placesWithCoordinates.isNotEmpty) ...[
              const SizedBox(height: 20),
              RecommendationMapView(
                places: placesWithCoordinates,
                height: 200,
                onPlaceTap: _showPlaceDetail,
              ),
            ],
          ],
        ],
      );
    }

    // 处理 specific_place 意图（单个地点）
    if (result.isSpecificPlace) {
      // 如果有匹配到数据库的地点且有图片，显示卡片
      final validPlaces =
          result.places.where((p) => p.hasValidCoverImage).toList();
      final hasMatchedPlace = validPlaces.isNotEmpty;

      if (hasMatchedPlace) {
        // 只有一个地点时，不显示地图，卡片放大
        final isSinglePlace = validPlaces.length == 1;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 描述文案
            if (result.acknowledgment.isNotEmpty) ...[
              _buildMarkdownText(result.acknowledgment, places: validPlaces),
              const SizedBox(height: 20),
            ],

            // 单个地点卡片 - 使用更大的卡片
            if (isSinglePlace)
              _LargePlaceCard(
                place: validPlaces.first,
                onTap: () => _showPlaceDetail(validPlaces.first),
              )
            else ...[
              FlatPlaceList(
                places: validPlaces,
                onPlaceTap: _showPlaceDetail,
              ),
              const SizedBox(height: 20),
              // 多个地点时显示地图
              RecommendationMapView(
                places: validPlaces,
                height: 200,
                onPlaceTap: _showPlaceDetail,
              ),
            ],
          ],
        );
      } else {
        // 没有匹配到数据库或没有图片，显示纯文字
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 如果 AI 识别出了地点名称，显示标题
            if (result.identifiedPlaceName != null &&
                result.identifiedPlaceName!.isNotEmpty) ...[
              Text(
                result.identifiedPlaceName!,
                style: AppTheme.headlineMedium(context).copyWith(
                  color: AppTheme.black,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 12),
            ],
            // 描述文案
            if (result.acknowledgment.isNotEmpty)
              _buildMarkdownText(result.acknowledgment),
          ],
        );
      }
    }

    // 默认处理（general_search）

    // 判断是否应该分类展示（超过5个地点且有分类信息）
    final shouldShowCategories =
        result.hasCategories && result.places.length > 5;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 承接文案 - Requirements: 8.1, 8.2, 8.3 - 黑色文字
        if (result.acknowledgment.isNotEmpty) ...[
          Text(
            result.acknowledgment,
            style: AppTheme.bodyMedium(context).copyWith(
              color: AppTheme.black,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 20),
        ],

        // overallSummary 只在最后作为结束语显示，不在地点列表前重复

        // 地点展示逻辑：
        // 1. 有分类且超过5个地点 -> 分类展示
        // 2. 有 textOnlyPlaces（AI 文字地点）时 -> 数据库地点用横滑卡片（带 AI description）
        // 3. 其他情况 -> 平铺展示（带 AI description）
        if (shouldShowCategories)
          // 有分类时使用分类展示组件
          CategorizedPlacesList(
            categories: result.categories!,
            onPlaceTap: _showPlaceDetail,
          )
        else if (result.textOnlyPlaces.isNotEmpty)
          // 有 AI 文字地点时，数据库地点使用横滑卡片展示（带 AI description）
          _buildHorizontalPlaceCardsWithSummary(result.places)
        else
          // 使用平铺展示组件（带 AI description）
          FlatPlaceList(
            places: result.places,
            onPlaceTap: _showPlaceDetail,
          ),

        // 展示所有 textOnlyPlaces 的详细信息（评分、地址、网站等）
        // 替代 supplementText，直接展示完整的 AI 地点卡片
        if (result.textOnlyPlaces.isNotEmpty) ...[
          const SizedBox(height: 24),
          // 添加标题
          Text(
            _containsChinese(result.acknowledgment)
                ? '📍 更多推荐'
                : '📍 More Recommendations',
            style: AppTheme.titleMedium(context).copyWith(
              color: AppTheme.black,
              fontWeight: FontWeight.w700,
              fontSize: 18,
            ),
          ),
          const SizedBox(height: 12),
          _buildTextOnlyPlacesList(result.textOnlyPlaces),
        ],

        // 地图展示 - 放在 More Recommendations 之后
        // 显示所有有坐标的地点（包括没有图片的文本补充地点）
        if (_getAllPlacesWithCoordinates(result).isNotEmpty) ...[
          const SizedBox(height: 20),
          _buildMapWithBottomCards(
            _getAllPlacesWithCoordinates(result),
            isEnglish: !_containsChinese(result.acknowledgment),
          ),
        ],

        // 结束语 - 放在最后
        if (result.overallSummary.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text(
            result.overallSummary,
            style: AppTheme.bodyMedium(context).copyWith(
              color: AppTheme.black,
              height: 1.5,
            ),
          ),
        ],
      ],
    );
  }

  /// 构建城市内容展示（文本 + 卡片 + 地图）
  /// 改进版：检测是否为城市推荐模式，如果是则在每个城市后显示该城市的地点卡片
  Widget _buildInterleavedCityContent(
    String textContent,
    List<CityPlacesGroup> cityPlaces, {
    List<PlaceResult> textOnlyPlaces = const [],
    List<PlaceNameMapping>? nameMapping,
  }) {
    final widgets = <Widget>[];

    // 收集所有地点用于点击跳转
    final allPlaces = _mergePlacesForText(
      cityPlaces.expand((g) => g.places).toList(),
      textOnlyPlaces,
    );

    debugPrint(
        '🏙️ Building city content for ${cityPlaces.length} city groups, total ${allPlaces.length} places');

    // 检测是否为城市推荐模式（多个城市，每个城市有简短描述）
    // 特征：多个城市（>=3）且每个城市的地点数较少（<=5）
    final isCityRecommendation =
        cityPlaces.length >= 3 && cityPlaces.every((g) => g.places.length <= 5);
    debugPrint(
        '🏙️ [_buildInterleavedCityContent] isCityRecommendation: $isCityRecommendation');

    final isItinerary = _looksLikeItinerary(textContent);
    debugPrint('📅 [_buildInterleavedCityContent] isItinerary: $isItinerary');

    if (isCityRecommendation && !isItinerary) {
      // 城市推荐模式：按城市分段显示，每个城市后显示该城市的景点卡片
      widgets.addAll(_buildCityRecommendationContent(
        textContent,
        cityPlaces,
        allPlaces,
        nameMapping: nameMapping,
      ));
    } else if (isItinerary) {
      // 行程模式
      widgets.add(_buildItineraryPlan(textContent,
          places: allPlaces, nameMapping: nameMapping));
      // 收集所有有图片的地点在末尾显示
      final allPlacesWithImage = cityPlaces
          .expand((g) => g.places)
          .where((p) => p.hasValidCoverImage)
          .toList();
      if (allPlacesWithImage.isNotEmpty) {
        widgets.add(const SizedBox(height: 20));
        widgets.add(_buildHorizontalSpotCards(allPlacesWithImage));
      }
    } else {
      // 默认模式：文本 + 所有卡片在末尾
      widgets.add(_buildMarkdownText(textContent,
          places: allPlaces, nameMapping: nameMapping));

      // 收集所有有图片的地点在末尾显示
      final allPlacesWithImage = <PlaceResult>[];
      for (final group in cityPlaces) {
        final placesWithImage =
            group.places.where((p) => p.hasValidCoverImage).toList();
        allPlacesWithImage.addAll(placesWithImage);
        debugPrint(
            '🏙️ [_buildInterleavedCityContent] City "${group.city}": ${group.places.length} total, ${placesWithImage.length} with images');
      }

      if (allPlacesWithImage.isNotEmpty) {
        widgets.add(const SizedBox(height: 20));
        widgets.add(_buildHorizontalSpotCards(allPlacesWithImage));
      }
    }

    // 最底部显示地图（有坐标的地点）
    final placesWithCoordinates =
        allPlaces.where((p) => p.latitude != 0 && p.longitude != 0).toList();
    debugPrint(
        '🗺️ [_buildInterleavedCityContent] All places: ${allPlaces.length}');
    for (final p in allPlaces) {
      debugPrint(
          '🗺️ [_buildInterleavedCityContent] "${p.name}": lat=${p.latitude}, lng=${p.longitude}');
    }
    debugPrint(
        '🗺️ [_buildInterleavedCityContent] Places with valid coordinates: ${placesWithCoordinates.length}');
    if (placesWithCoordinates.isNotEmpty) {
      widgets.add(const SizedBox(height: 20));
      widgets.add(
        RecommendationMapView(
          places: placesWithCoordinates,
          height: 200,
          onPlaceTap: _showPlaceDetail,
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: widgets,
    );
  }

  /// 构建城市推荐内容：按城市分段显示，每个城市后显示该城市的景点卡片
  List<Widget> _buildCityRecommendationContent(
    String textContent,
    List<CityPlacesGroup> cityPlaces,
    List<PlaceResult> allPlaces, {
    List<PlaceNameMapping>? nameMapping,
  }) {
    final widgets = <Widget>[];

    // 按城市名称分割文本内容
    // 城市标题格式：## �🇷 CityName (Country) 或 ## 🏙️ CityName (Country) 或 ## **CityName**
    // 国旗 emoji 是由两个 Regional Indicator Symbol 组成的，例如 🇫🇷 = \uD83C\uDDEB\uD83C\uDDF7
    // 使用 Unicode 范围匹配国旗：[\u{1F1E6}-\u{1F1FF}]{2}
    final cityHeaderRegex = RegExp(
      r'^##\s*(?:[\u{1F1E6}-\u{1F1FF}]{2}|🏙️)?\s*(?:\*\*)?([A-Za-z\u4e00-\u9fff]+(?:\s*[A-Za-z\u4e00-\u9fff]+)*)(?:\*\*)?\s*(?:\([^)]+\))?',
      multiLine: true,
      unicode: true,
    );

    // 将文本分割成城市块
    final cityBlocks = <String, String>{};
    final matches = cityHeaderRegex.allMatches(textContent).toList();

    if (matches.isEmpty) {
      // 没有检测到城市标题，使用默认模式
      widgets.add(_buildMarkdownText(textContent,
          places: allPlaces, nameMapping: nameMapping));
      return widgets;
    }

    for (int i = 0; i < matches.length; i++) {
      final match = matches[i];
      final cityName = match.group(1)?.trim() ?? '';
      final startIndex = match.start;
      final endIndex =
          i < matches.length - 1 ? matches[i + 1].start : textContent.length;
      final blockText = textContent.substring(startIndex, endIndex).trim();
      cityBlocks[cityName.toLowerCase()] = blockText;
      debugPrint(
          '🏙️ [_buildCityRecommendationContent] City block "$cityName": ${blockText.length} chars');
    }

    // 按 cityPlaces 顺序显示每个城市
    final processedCities = <String>{};

    for (final group in cityPlaces) {
      final cityLower = group.city.toLowerCase();

      // 查找对应的文本块
      String? blockText;
      for (final key in cityBlocks.keys) {
        if (key.contains(cityLower) || cityLower.contains(key)) {
          blockText = cityBlocks[key];
          processedCities.add(key);
          break;
        }
      }

      if (blockText != null && blockText.isNotEmpty) {
        // 显示该城市的文本
        widgets.add(_buildMarkdownText(blockText,
            places: allPlaces, nameMapping: nameMapping));
      }

      // 显示该城市的景点卡片
      final placesWithImage =
          group.places.where((p) => p.hasValidCoverImage).toList();
      if (placesWithImage.isNotEmpty) {
        widgets.add(const SizedBox(height: 12));
        widgets.add(_buildHorizontalSpotCards(placesWithImage));
        widgets.add(const SizedBox(height: 16));
      }
    }

    // 显示未处理的城市文本块（如果有）
    for (final entry in cityBlocks.entries) {
      if (!processedCities.contains(entry.key)) {
        widgets.add(_buildMarkdownText(entry.value,
            places: allPlaces, nameMapping: nameMapping));
        widgets.add(const SizedBox(height: 12));
      }
    }

    return widgets;
  }

  /// 构建横滑 Spot 卡片（使用 AI 搜索的卡片样式）
  Widget _buildHorizontalSpotCards(List<PlaceResult> places) {
    // 过滤掉没有图片的地点
    debugPrint(
        '🖼️ [_buildHorizontalSpotCards] Input places: ${places.length}');
    for (final p in places) {
      debugPrint(
          '🖼️ [_buildHorizontalSpotCards] "${p.name}" coverImage: "${p.coverImage.isEmpty ? 'EMPTY' : p.coverImage.substring(0, 50)}..."');
    }
    final placesWithImage = places.where((p) => p.hasValidCoverImage).toList();
    debugPrint(
        '🖼️ [_buildHorizontalSpotCards] After filter: ${placesWithImage.length} places with images');
    if (placesWithImage.isEmpty) return const SizedBox.shrink();

    return SizedBox(
      height: 230, // 4:3 比例 + 边框 + 阴影边距
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        clipBehavior: Clip.none, // 允许阴影溢出
        itemCount: placesWithImage.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (context, index) {
          final place = placesWithImage[index];
          final spot = _placeResultToSpot(place);
          return SizedBox(
            width: 280, // 4:3 比例的宽度
            child: _SpotCardOverlay(spot: spot),
          );
        },
      ),
    );
  }

  bool _looksLikeItinerary(String text) {
    // 支持多种天数格式：第一天、Day 1、📅 Day 1
    final dayRegex = RegExp(r'(第[一二三四五六七八九十0-9]+天|Day\s*\d+|📅\s*Day\s*\d+)',
        caseSensitive: false);
    // 支持多种时间格式：上午、Morning、🌅 上午、🌅 Morning
    final timeRegex = RegExp(
      r'(上午|中午|下午|傍晚|晚上|夜晚|清晨|早上|午后|夜间|Morning|Afternoon|Evening|Night|🌅|☀️|🌆|🌙)',
      caseSensitive: false,
    );
    return dayRegex.hasMatch(text) && timeRegex.hasMatch(text);
  }

  Widget _buildItineraryPlan(String text,
      {List<PlaceResult>? places, List<PlaceNameMapping>? nameMapping}) {
    final days = _parseItinerary(text);
    if (days.isEmpty) {
      return _buildMarkdownText(text, places: places, nameMapping: nameMapping);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final day in days) _buildItineraryDay(day, places, nameMapping),
      ],
    );
  }

  /// 构建单个日期的内容
  Widget _buildItineraryDay(_ItineraryDay day, List<PlaceResult>? places,
      List<PlaceNameMapping>? nameMapping) {
    // 检测是否为实用贴士/Tips 类型的 day
    final isTipsSection = day.title.contains('实用贴士') ||
        day.title.contains('旅行贴士') ||
        day.title.toLowerCase().contains('tips');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 天数标题（加粗大字，无 emoji）
        Padding(
          padding: const EdgeInsets.only(top: 12, bottom: 6),
          child: Text(
            _cleanDayTitle(day.subtitle.isNotEmpty
                ? '${day.title}: ${day.subtitle}'
                : day.title),
            style: AppTheme.titleMedium(context).copyWith(
              color: AppTheme.black,
              fontWeight: FontWeight.bold,
              fontSize: 18,
            ),
          ),
        ),
        // 时间段内容
        for (final slot in day.slots) ...[
          _buildItinerarySlot(slot, places, nameMapping,
              isTipsSection: isTipsSection),
          const SizedBox(height: 8),
        ],
        // 备注
        if (day.notes.isNotEmpty) ...[
          for (final note in day.notes) ...[
            _buildRichText(note, places: places, nameMapping: nameMapping),
            const SizedBox(height: 4),
          ]
        ],
        const SizedBox(height: 8),
      ],
    );
  }

  /// 构建单个时间槽的内容
  Widget _buildItinerarySlot(_ItinerarySlot slot, List<PlaceResult>? places,
      List<PlaceNameMapping>? nameMapping,
      {bool isTipsSection = false}) {
    // 如果是实用贴士区域，不显示时间标签，直接显示普通文本内容
    if (isTipsSection) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final item in slot.items) ...[
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                item.trim(),
                style: AppTheme.bodyMedium(context).copyWith(
                  color: AppTheme.black,
                  height: 1.4,
                ),
              ),
            ),
            const SizedBox(height: 8),
          ],
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 时间标签（纯文字，加粗：上午/Morning, 下午/Afternoon, 傍晚/Evening）
        Text(
          slot.label,
          style: AppTheme.titleMedium(context).copyWith(
            color: AppTheme.black,
            fontWeight: FontWeight.w700,
            fontSize: 18,
          ),
        ),
        const SizedBox(height: 8),
        // 地点条目（Tip 紧跟上面的描述，地点之间拉开间距）
        for (int i = 0; i < slot.items.length; i++) ...[
          _buildPlaceEntry(slot.items[i], places, nameMapping),
          // Tip 后面间距大一些（12px），普通地点间距正常（6px）
          // 检测当前 item 是否为 Tip
          if (_isTipItem(slot.items[i]))
            const SizedBox(height: 12)
          else
            const SizedBox(height: 6),
        ],
      ],
    );
  }

  /// 检测是否为 Tip 行
  bool _isTipItem(String text) {
    return text.trim().startsWith('💡') ||
        text.trim().toLowerCase().startsWith('tip') ||
        text.contains('Tip:') ||
        text.contains('💡 Tip');
  }

  /// 构建单个地点条目（带可点击标题和元数据 bullet points）
  Widget _buildPlaceEntry(String text, List<PlaceResult>? places,
      List<PlaceNameMapping>? nameMapping) {
    final parsed = _parseSlotItem(text);

    // 检测是否为 Tip 行（💡 Tip: 或 Tip:）
    final isTip = parsed.title.contains('Tip') ||
        parsed.title.contains('💡') ||
        text.trim().startsWith('💡') ||
        text.trim().toLowerCase().startsWith('tip');

    if (isTip) {
      // Tip 不需要点击，也不需要地址描述，普通黑色字体
      return Text(
        text.trim(),
        style: AppTheme.bodyMedium(context).copyWith(
          color: AppTheme.black,
          height: 1.4,
        ),
      );
    }

    // 查找匹配的地点（使用 nameMapping 支持中文名到英文数据库名的映射）
    PlaceResult? matchedPlace;
    if (places != null && places.isNotEmpty) {
      // 清理标题（移除可能的 ** 标记和 markdown 标题符号）
      String cleanTitle = parsed.title
          .replaceAll(RegExp(r'^#{1,4}\s*'), '') // 移除 #, ##, ###, ####
          .replaceAll(RegExp(r'^\*\*'), '')
          .replaceAll(RegExp(r'\*\*$'), '')
          .trim();
      // 优先使用 nameMapping 查找，如果没有则回退到直接匹配
      matchedPlace = _findPlaceWithMapping(cleanTitle, places, nameMapping);
    }

    final description = _formatItineraryDescription(
      parsed.description,
      matchedPlace,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 地点标题（可点击）+ 评分
        _buildClickablePlaceTitleWithRating(parsed.title, matchedPlace),

        // 描述（30-50字，普通黑色字体）
        if (description != null && description.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(
            description,
            style: AppTheme.bodyMedium(context).copyWith(
              color: AppTheme.black,
              height: 1.4,
            ),
          ),
        ],
      ],
    );
  }

  String? _formatItineraryDescription(String? raw, PlaceResult? place) {
    final cleanedRaw = _cleanItinerarySummary(raw);
    final cleanedSummary = _cleanItinerarySummary(place?.summary);

    String? base;
    if (cleanedRaw.isNotEmpty) {
      base = cleanedRaw;
    } else if (cleanedSummary.isNotEmpty) {
      base = cleanedSummary;
    }

    if (base == null || base.isEmpty) return null;

    // 如果描述太短，尝试合并原始描述和 summary 来丰富内容
    if (base.length < 30 &&
        cleanedSummary.isNotEmpty &&
        base != cleanedSummary) {
      base = '${base.trim()} ${cleanedSummary.trim()}'.trim();
    } else if (base.length < 30 &&
        cleanedSummary.isNotEmpty &&
        cleanedRaw.isNotEmpty) {
      base = '${cleanedRaw.trim()} ${cleanedSummary.trim()}'.trim();
    }

    String cleaned = base;

    // 移除评分信息（如 "的(4.1⭐)。" "的(4.5☆)。"）
    // 使用 Unicode 转义来匹配星号 emoji
    cleaned = cleaned.replaceAll(
      RegExp(
          r'的\s*[\(\uff08]\s*[\d\.]+\s*[\u2b50\u2606\u2605\u2729\u272a\u{1F31F}]?\s*[\)\uff09]\s*[。\.]?',
          unicode: true),
      '。',
    );
    cleaned = cleaned.replaceAll(
      RegExp(
          r'[\(\uff08]\s*[\d\.]+\s*[\u2b50\u2606\u2605\u2729\u272a\u{1F31F}]?\s*[\)\uff09]\s*[。\.]?',
          unicode: true),
      '',
    );

    // 移除地理位置信息（如 "位于Copenhagen, Denmark的landmark...")
    cleaned = cleaned.replaceAll(
      RegExp(r'位于[A-Za-z\s,\.]+的[a-zA-Z]+\.{0,3}', caseSensitive: false),
      '',
    );
    // 移除英文地点信息（如 "位于Copenhagen, Denmark..."）
    cleaned = cleaned.replaceAll(
      RegExp(r'位于[A-Za-z][A-Za-z\s,\.]*\.{0,3}'),
      '',
    );
    cleaned = cleaned.replaceAll(
      RegExp(r'Located in [A-Za-z\s,]+\.{0,3}', caseSensitive: false),
      '',
    );
    cleaned = cleaned.replaceAll(
      RegExp(r'\d+th-century [a-zA-Z\s]+ of\.{0,3}', caseSensitive: false),
      '',
    );
    // 移除英文内容（如 "palaces, with a mus..."）
    cleaned = cleaned.replaceAll(
      RegExp(r'[a-zA-Z]{3,}[a-zA-Z\s,\.]*\.{2,3}'),
      '',
    );
    // 移除末尾的省略号和英文残留
    cleaned = cleaned.replaceAll(RegExp(r'[\.\u2026]+$'), '');
    cleaned = cleaned.replaceAll(RegExp(r'\s*[a-zA-Z]+\s*$'), '');
    // 移除句中的英文单词（保留中文内容）
    cleaned = cleaned.replaceAll(RegExp(r'\s+[a-zA-Z]+\s+'), ' ');
    cleaned = cleaned.replaceAll(RegExp(r'。\s*[a-zA-Z].*$'), '。');
    cleaned = cleaned.trim();

    // 不截断，完整展示
    return cleaned.isNotEmpty ? cleaned : null;
  }

  /// 清理日期标题，移除 emoji 和多余空格
  String _cleanDayTitle(String title) {
    // 移除常见 emoji（📅、💡、🗓 等）
    String cleaned = title
        .replaceAll(
            RegExp(r'[\u{1F4C5}\u{1F4A1}\u{1F5D3}\u{1F3AF}]', unicode: true),
            '')
        .replaceAll(RegExp(r'^[\s：:]+'), '')
        .trim();
    return cleaned;
  }

  String _cleanItinerarySummary(String? text) {
    if (text == null || text.trim().isEmpty) return '';
    String cleaned = text.trim();
    cleaned = cleaned.replaceAll(
      RegExp(r'(?:Website|网站|官网)[:：]\s*\S+', caseSensitive: false),
      '',
    );
    cleaned = cleaned.replaceAll(RegExp(r'https?://\S+'), '');
    cleaned = cleaned.replaceAll(RegExp(r'\s+'), ' ').trim();
    return cleaned;
  }

  String _clampTextRange(String text, {required int min, required int max}) {
    if (text.length < min) {
      return text;
    }
    if (text.length > max) {
      final end = max > 1 ? max - 1 : max;
      return '${text.substring(0, end).trimRight()}…';
    }
    return text;
  }

  /// 构建可点击的地点标题
  Widget _buildClickablePlaceTitle(String title, PlaceResult? place) {
    // 清理标题（移除 markdown 标题符号、** 标记和 AI 生成的评分）
    String cleanTitle = title
        .replaceAll(RegExp(r'^#{1,4}\s*'), '') // 移除 #, ##, ###, ####
        .replaceAll(RegExp(r'^\*\*'), '')
        .replaceAll(RegExp(r'\*\*$'), '')
        .trim();
    // 移除 AI 生成的评分（如 (4.7) 或 (4.7分) 或 （4.7））
    cleanTitle = _stripRatingFromTitle(cleanTitle);

    if (place != null) {
      // 有匹配的地点，显示可点击链接
      return GestureDetector(
        onTap: () {
          debugPrint('📍 Tapped on itinerary place: ${place.name}');
          _showPlaceDetail(place);
        },
        child: Text(
          cleanTitle,
          style: AppTheme.titleMedium(context).copyWith(
            color: AppTheme.accentBlue,
            fontWeight: FontWeight.bold,
            fontSize: 16,
            decoration: TextDecoration.underline,
            decorationColor: AppTheme.accentBlue,
          ),
        ),
      );
    } else {
      // 没有匹配的地点，显示普通加粗文本
      return Text(
        cleanTitle,
        style: AppTheme.titleMedium(context).copyWith(
          color: AppTheme.black,
          fontWeight: FontWeight.bold,
          fontSize: 16,
        ),
      );
    }
  }

  /// 构建可点击的地点标题（带评分）
  /// - 匹配到数据库的地点：显示可点击链接 + 数据库评分
  /// - 未匹配到数据库的地点：只显示名称，不显示评分
  Widget _buildClickablePlaceTitleWithRating(String title, PlaceResult? place) {
    // 清理标题（移除 markdown 标题符号、** 标记和 AI 生成的评分）
    String cleanTitle = title
        .replaceAll(RegExp(r'^#{1,4}\s*'), '') // 移除 #, ##, ###, ####
        .replaceAll(RegExp(r'^\*\*'), '')
        .replaceAll(RegExp(r'\*\*$'), '')
        .trim();
    // 移除 AI 生成的评分（如 (4.7) 或 (4.7分) 或 （4.7））
    cleanTitle = _stripRatingFromTitle(cleanTitle);

    // 只有匹配到数据库的地点才显示评分
    String? ratingText;
    if (place != null && place.rating != null && place.rating! > 0) {
      // 中文显示 "(4.5 分)"，英文显示 "(4.5)"
      final isChinese = RegExp(r'[\u4e00-\u9fff]').hasMatch(cleanTitle);
      if (isChinese) {
        ratingText = '（${place.rating!.toStringAsFixed(1)} 分）';
      } else {
        ratingText = ' (${place.rating!.toStringAsFixed(1)})';
      }
    }

    if (place != null) {
      // 有匹配的地点，显示可点击链接 + 数据库评分
      return GestureDetector(
        onTap: () {
          debugPrint('📍 Tapped on itinerary place: ${place.name}');
          _showPlaceDetail(place);
        },
        child: RichText(
          text: TextSpan(
            children: [
              TextSpan(
                text: cleanTitle,
                style: AppTheme.titleMedium(context).copyWith(
                  color: AppTheme.accentBlue,
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                  decoration: TextDecoration.underline,
                  decorationColor: AppTheme.accentBlue,
                ),
              ),
              if (ratingText != null)
                TextSpan(
                  text: ratingText,
                  style: AppTheme.titleMedium(context).copyWith(
                    color: AppTheme.black,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                    decoration: TextDecoration.none,
                  ),
                ),
            ],
          ),
        ),
      );
    } else {
      // 没有匹配的地点，只显示名称不显示评分
      return Text(
        cleanTitle,
        style: AppTheme.titleMedium(context).copyWith(
          color: AppTheme.black,
          fontWeight: FontWeight.bold,
          fontSize: 16,
        ),
      );
    }
  }

  /// 构建元数据 bullet point
  Widget _buildMetadataBullet(String label, String value, PlaceResult? place) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '• ',
            style: AppTheme.bodySmall(context).copyWith(
              color: AppTheme.darkGray,
            ),
          ),
          Text(
            '$label: ',
            style: AppTheme.bodySmall(context).copyWith(
              color: AppTheme.darkGray,
              fontWeight: FontWeight.w600,
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: AppTheme.bodySmall(context).copyWith(
                color: AppTheme.darkGray,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// 构建网站 bullet point（带可点击链接）
  Widget _buildWebsiteBullet(String websiteText, PlaceResult? place) {
    // 确定要显示的 URL
    String displayUrl = websiteText;
    String? actualUrl;

    // 检查 websiteText 是否已经是 URL
    if (websiteText.startsWith('http://') ||
        websiteText.startsWith('https://')) {
      actualUrl = websiteText;
      // 显示简化的域名
      try {
        final uri = Uri.parse(websiteText);
        displayUrl = uri.host.replaceFirst('www.', '');
      } catch (_) {
        displayUrl = websiteText;
      }
    } else if (RegExp(r'^[a-zA-Z0-9][\w\-\.]*\.[a-zA-Z]{2,}')
        .hasMatch(websiteText)) {
      // 看起来像域名
      actualUrl = 'https://$websiteText';
      displayUrl = websiteText;
    } else if (place?.website != null && place!.website!.isNotEmpty) {
      // 使用地点的实际网站 URL
      actualUrl = place.website;
      try {
        final uri = Uri.parse(place.website!);
        displayUrl = uri.host.replaceFirst('www.', '');
      } catch (_) {
        displayUrl = place.website!;
      }
    } else {
      // websiteText 可能是地点名称（AI 生成的错误格式），尝试从 place 获取
      if (place?.website != null && place!.website!.isNotEmpty) {
        actualUrl = place.website;
        try {
          final uri = Uri.parse(place.website!);
          displayUrl = uri.host.replaceFirst('www.', '');
        } catch (_) {
          displayUrl = place.website!;
        }
      } else {
        // 没有有效的 URL，显示为普通文本
        actualUrl = null;
      }
    }

    // 如果没有有效的 URL，返回空（不显示"网站未提供"）
    if (actualUrl == null || actualUrl.isEmpty) {
      return const SizedBox.shrink();
    }

    final validUrl = actualUrl; // 创建非空局部变量

    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: GestureDetector(
        onTap: () {
          debugPrint('🌐 Tapped on website: $validUrl');
          _launchUrl(validUrl);
        },
        child: Text(
          displayUrl,
          style: AppTheme.bodySmall(context).copyWith(
            color: AppTheme.black,
            decoration: TextDecoration.underline,
            decorationColor: AppTheme.black,
            fontWeight: FontWeight.normal,
          ),
        ),
      ),
    );
  }

  /// 通过名称查找地点（支持中英文匹配）
  PlaceResult? _findPlaceByName(String name, List<PlaceResult>? places) {
    if (places == null || places.isEmpty) return null;

    final searchLower = name.toLowerCase().trim();

    for (final place in places) {
      if (_matchPlaceName(searchLower, place.name)) {
        return place;
      }
    }
    return null;
  }

  List<_ItineraryDay> _parseItinerary(String text) {
    final normalized = text
        .replaceAll('\r\n', '\n')
        .replaceAll(RegExp(r'(^|[\s\u3000])\*(?!\*)(?=\s)'), '\n- ')
        .replaceAll(RegExp(r'(^|\n)\s*\*\s+'), '\n- ')
        .replaceAll(RegExp(r'(^|\n)\s*[•·]\s+'), '\n- ');

    final lines = normalized
        .split('\n')
        .map((line) {
          var trimmed = line.trim();
          // 移除 markdown 标题符号 (###, ####, ##, #)
          if (trimmed.startsWith('#### ')) {
            trimmed = trimmed.substring(5);
          } else if (trimmed.startsWith('### ')) {
            trimmed = trimmed.substring(4);
          } else if (trimmed.startsWith('## ')) {
            trimmed = trimmed.substring(3);
          } else if (trimmed.startsWith('# ')) {
            trimmed = trimmed.substring(2);
          }
          return trimmed;
        })
        .where((line) => line.isNotEmpty)
        .toList();

    // 支持多种天数格式：第一天、Day 1、📅 Day 1、💡 实用贴士、Tips
    // 使用 .{0,4} 来匹配可能的 emoji 前缀（emoji 可能占用多个字符）
    final dayRegex = RegExp(
      r'^.{0,4}(第[一二三四五六七八九十0-9]+天|Day\s*\d+|实用贴士|旅行贴士|Tips|Practical Tips)\s*[：:]*\s*(.*)$',
      caseSensitive: false,
    );
    // 支持多种时间格式：上午、Morning、🌅 上午、🌅 Morning
    // 修复：时间词必须独立存在（后面是冒号、空格、或行尾），不能后跟中文字符如"晚上开放"
    final timeRegex = RegExp(
      r'^(.{0,3}(?:上午|中午|下午|傍晚|晚上|夜晚|清晨|早上|午后|夜间|Morning|Afternoon|Evening|Night))(?:[：:\s]|$)(.*)$',
      caseSensitive: false,
    );

    final days = <_ItineraryDay>[];
    _ItineraryDay? currentDay;
    _ItinerarySlot? currentSlot;
    String? pendingPlaceName; // 用于合并地点名和描述（新格式：地点名和描述分行）

    for (final line in lines) {
      final dayMatch = dayRegex.firstMatch(line);
      if (dayMatch != null) {
        // 处理上一个待处理的地点名
        if (pendingPlaceName != null && currentSlot != null) {
          currentSlot.items.add(pendingPlaceName);
          pendingPlaceName = null;
        }
        currentDay = _ItineraryDay(
          title: dayMatch.group(1) ?? line,
          subtitle: (dayMatch.group(2) ?? '').trim(),
        );
        days.add(currentDay);
        currentSlot = null;
        continue;
      }

      final timeMatch = timeRegex.firstMatch(line);
      if (timeMatch != null) {
        // 处理上一个待处理的地点名
        if (pendingPlaceName != null && currentSlot != null) {
          currentSlot.items.add(pendingPlaceName);
          pendingPlaceName = null;
        }
        currentDay ??= _ItineraryDay(title: '行程安排', subtitle: '');
        if (!days.contains(currentDay)) days.add(currentDay);
        // 保留完整的时间标签包括 emoji
        currentSlot = _ItinerarySlot(label: timeMatch.group(1)?.trim() ?? line);
        currentDay.slots.add(currentSlot);
        final inline = (timeMatch.group(2) ?? '').trim();
        if (inline.isNotEmpty) {
          currentSlot.items.add(inline);
        }
        continue;
      }

      final content = line.startsWith('- ') ? line.substring(2).trim() : line;
      if (content.isEmpty) continue;

      currentDay ??= _ItineraryDay(title: '行程安排', subtitle: '');
      if (!days.contains(currentDay)) days.add(currentDay);

      if (currentSlot != null) {
        // 检测新格式：地点名和描述分行
        // 如果当前行是 **PlaceName** 格式（地点名），暂存等待下一行描述
        final isBoldPlaceName = RegExp(r'^\*\*[^*]+\*\*$').hasMatch(content);
        // 如果是中文地名（2-10个字，无标点），也可能是独立地点名
        final isChinesePlaceName = !content.contains(RegExp(r'[。，：:、]')) &&
            RegExp(r'^[\u4e00-\u9fff]{2,10}$').hasMatch(content);

        if (isBoldPlaceName || isChinesePlaceName) {
          // 如果有待处理的地点名，先添加
          if (pendingPlaceName != null) {
            currentSlot.items.add(pendingPlaceName);
          }
          pendingPlaceName = content;
        } else if (pendingPlaceName != null) {
          // 当前行是描述，与待处理的地点名合并
          currentSlot.items.add('$pendingPlaceName\n$content');
          pendingPlaceName = null;
        } else {
          // 普通项目（旧格式或 Tip）
          currentSlot.items.add(content);
        }
      } else {
        currentDay.notes.add(content);
      }
    }

    // 处理最后一个待处理的地点名
    if (pendingPlaceName != null && currentSlot != null) {
      currentSlot.items.add(pendingPlaceName);
    }

    return days;
  }

  /// 构建 Markdown 文本（简单实现）
  /// [nameMapping] 用于匹配中文地点名到英文数据库名
  Widget _buildMarkdownText(String text,
      {List<PlaceResult>? places, List<PlaceNameMapping>? nameMapping}) {
    final isItineraryLike = _looksLikeItinerary(text);
    // Debug: 打印原始文本内容
    debugPrint('📝 _buildMarkdownText input (first 500 chars):');
    debugPrint(text.substring(0, text.length > 500 ? 500 : text.length));
    if (nameMapping != null && nameMapping.isNotEmpty) {
      debugPrint(
          '📝 _buildMarkdownText nameMapping: ${nameMapping.length} entries');
      for (final mapping in nameMapping) {
        debugPrint('  "${mapping.displayName}" -> "${mapping.englishName}"');
      }
    }

    // 先预处理：将链接转换为特殊标记，避免被换行分割
    // 然后按行分割处理标题和列表
    String normalized = text.replaceAll('\r\n', '\n');
    normalized =
        normalized.replaceFirst(RegExp(r'^\s*"?response"?\s*:\s*'), '').trim();
    normalized = normalized
        .replaceFirst(RegExp(r'^"+'), '')
        .replaceFirst(RegExp(r'"+$'), '')
        .trim();
    // Strip JSON-like wrappers and brackets
    normalized = normalized
        .replaceFirst(RegExp(r'^[\[\{\"\s]+'), '')
        .replaceFirst(RegExp(r'[\]\}\"\s]+$'), '');
    // Remove horizontal rule separators (---, ***, ___) that appear on their own line
    normalized =
        normalized.replaceAll(RegExp(r'(?:^|\n)\s*[-*_]{3,}\s*(?=\n|$)'), '\n');
    // Ensure Website:/网站:/官网: labels start on a new line
    normalized = normalized.replaceAllMapped(
      RegExp(r'(?<!\n)\s*((?:Website|网站|官网)[：:]\s*)', caseSensitive: false),
      (m) => '\n${m.group(1)}',
    );
    // Normalize inline bullet markers so each place appears on its own line.
    normalized =
        normalized.replaceAll(RegExp(r'(^|[\s\u3000])\*(?!\*)(?=\s)'), '\n- ');
    normalized = normalized.replaceAll(RegExp(r'(^|\n)\s*\*\s+'), '\n- ');
    normalized = normalized.replaceAll(RegExp(r'(^|\n)\s*[•·]\s+'), '\n- ');

    final rawLines = normalized.split('\n').map((line) {
      var cleaned = line.trimLeft();
      cleaned = cleaned
          .replaceFirst(RegExp(r'^"+'), '')
          .replaceFirst(RegExp(r'"+$'), '')
          .trim();
      // 如果整行是 **text** 格式（独立的加粗行），转为标题格式
      final boldLineMatch = RegExp(r'^\*\*(.+)\*\*$').firstMatch(cleaned);
      if (boldLineMatch != null) {
        cleaned = '### ${boldLineMatch.group(1)}';
      }
      return cleaned;
    }).toList();
    // Promote standalone title lines to headings when followed by list content.
    bool looksLikeTitle(String value) {
      if (value.isEmpty) return false;
      if (value.length > 24) return false;
      if (value.startsWith('## ') || value.startsWith('### ')) return false;
      if (value.startsWith('- ') ||
          value.startsWith('•') ||
          value.startsWith('* ')) return false;
      if (RegExp(r'^\d+\.\s').hasMatch(value)) return false;
      if (RegExp(r'[。.!?;：:]').hasMatch(value)) return false;
      return true;
    }

    int findNextNonEmptyIndex(int start) {
      for (int i = start; i < rawLines.length; i++) {
        if (rawLines[i].trim().isNotEmpty) return i;
      }
      return -1;
    }

    for (int i = 0; i < rawLines.length; i++) {
      final trimmed = rawLines[i].trim();
      if (!looksLikeTitle(trimmed)) continue;
      final nextIndex = findNextNonEmptyIndex(i + 1);
      if (nextIndex == -1) continue;
      final nextTrim = rawLines[nextIndex].trim();
      final nextLooksLikeList = nextTrim.startsWith('- ') ||
          nextTrim.startsWith('* ') ||
          RegExp(r'^\d+\.\s').hasMatch(nextTrim) ||
          RegExp(r'^第.+天[：:]').hasMatch(nextTrim);
      if (nextLooksLikeList) {
        rawLines[i] = '## $trimmed';
      }
    }

    final lines = rawLines;
    final widgets = <Widget>[];

    // 合并连续的非标题、非列表行（可能是被换行的段落）
    final processedLines = <String>[];
    String currentParagraph = '';

    // 网站行正则：以 网站/官网/Website 开头
    final websiteLinePattern = RegExp(
      r'^(网站|官网|Website|website)[：:]',
      caseSensitive: false,
    );

    for (final line in lines) {
      final trimmed = line.trim();

      if (trimmed.isEmpty) {
        // 空行：结束当前段落
        if (currentParagraph.isNotEmpty) {
          processedLines.add(currentParagraph);
          currentParagraph = '';
        }
        processedLines.add(''); // 保留空行
      } else if (trimmed.startsWith('## ') ||
          trimmed.startsWith('### ') ||
          trimmed.startsWith('#### ') ||
          trimmed.startsWith('- ') ||
          trimmed.startsWith('  - ') ||
          RegExp(r'^\d+\.\s').hasMatch(trimmed) ||
          websiteLinePattern.hasMatch(trimmed)) {
        // 标题、列表项或网站行：结束当前段落，单独处理
        if (currentParagraph.isNotEmpty) {
          processedLines.add(currentParagraph);
          currentParagraph = '';
        }
        processedLines.add(line);
      } else {
        // 普通文本：可能是段落的一部分
        if (currentParagraph.isEmpty) {
          currentParagraph = trimmed;
        } else {
          currentParagraph += ' $trimmed';
        }
      }
    }
    // 添加最后一个段落
    if (currentParagraph.isNotEmpty) {
      processedLines.add(currentParagraph);
    }

    for (final line in processedLines) {
      if (line.trim().isEmpty) {
        widgets.add(const SizedBox(height: 8));
        continue;
      }

      if (line.startsWith('#### ')) {
        // 四级标题（时间段如 上午/下午）- 加粗显示
        var titleText = line.substring(5);
        titleText = titleText.replaceAllMapped(
          RegExp(r'\*\*([^*]+)\*\*'),
          (match) => match.group(1) ?? '',
        );
        widgets.add(
          Padding(
            padding: const EdgeInsets.only(top: 6, bottom: 4),
            child: Text(
              titleText,
              style: AppTheme.titleMedium(context).copyWith(
                color: AppTheme.black,
                fontWeight: FontWeight.bold,
                fontSize: 16,
              ),
            ),
          ),
        );
      } else if (line.startsWith('## ')) {
        // 二级标题 - 移除 ** 标记
        var titleText = line.substring(3);
        titleText = titleText.replaceAllMapped(
          RegExp(r'\*\*([^*]+)\*\*'),
          (match) => match.group(1) ?? '',
        );
        widgets.add(
          Padding(
            padding: const EdgeInsets.only(top: 12, bottom: 8),
            child: Text(
              titleText,
              style: AppTheme.titleMedium(context).copyWith(
                color: AppTheme.black,
                fontWeight: FontWeight.w700,
                fontSize: 20,
              ),
            ),
          ),
        );
      } else if (line.startsWith('### ')) {
        // 三级标题 - 移除 ** 标记，如果是地点名则可点击
        var titleText = line.substring(4);
        // 移除 **text** 标记，保留内部文本
        titleText = titleText.replaceAllMapped(
          RegExp(r'\*\*([^*]+)\*\*'),
          (match) => match.group(1) ?? '',
        );
        widgets.add(
          Padding(
            padding: const EdgeInsets.only(top: 8, bottom: 4),
            child: _buildClickableHeader(titleText,
                places: places, nameMapping: nameMapping),
          ),
        );
      } else if (line.startsWith('- ') || line.startsWith('  - ')) {
        // 无序列表项 (- 格式) - 不添加地点链接
        final indent = line.startsWith('  - ') ? 16.0 : 0.0;
        final content =
            line.startsWith('  - ') ? line.substring(4) : line.substring(2);
        if (isItineraryLike) {
          final timeHeading = _extractTimeHeading(content);
          if (timeHeading != null) {
            widgets.add(
              Padding(
                padding: EdgeInsets.only(left: indent, top: 6, bottom: 4),
                child: Text(
                  timeHeading,
                  style: AppTheme.titleMedium(context).copyWith(
                    color: AppTheme.black,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
              ),
            );

            final inlineContent = _extractTimeHeadingInlineContent(content);
            if (inlineContent != null && inlineContent.isNotEmpty) {
              widgets.add(
                Padding(
                  padding: EdgeInsets.only(left: indent, top: 2, bottom: 2),
                  child: _buildItineraryMarkdownPlace(
                    inlineContent,
                    places: places,
                    nameMapping: nameMapping,
                  ),
                ),
              );
            }
          } else if (_isItineraryPlaceLine(content)) {
            widgets.add(
              Padding(
                padding: EdgeInsets.only(left: indent, top: 4, bottom: 6),
                child: _buildItineraryMarkdownPlace(
                  content,
                  places: places,
                  nameMapping: nameMapping,
                ),
              ),
            );
          } else {
            widgets.add(
              Padding(
                padding: EdgeInsets.only(left: indent, top: 2, bottom: 2),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('• ',
                        style: AppTheme.bodyMedium(context)
                            .copyWith(color: AppTheme.black)),
                    Expanded(
                      child: _buildRichText(content,
                          places: null), // 不传places，禁用正文地点链接
                    ),
                  ],
                ),
              ),
            );
          }
        } else {
          widgets.add(
            Padding(
              padding: EdgeInsets.only(left: indent, top: 2, bottom: 2),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('• ',
                      style: AppTheme.bodyMedium(context)
                          .copyWith(color: AppTheme.black)),
                  Expanded(
                    child: _buildRichText(content,
                        places: null), // 不传places，禁用正文地点链接
                  ),
                ],
              ),
            ),
          );
        }
      } else if (line.trim().startsWith('•') || line.trim().startsWith('·')) {
        // Bullet point 列表项 (• 或 · 格式) - 移除bullet，直接显示内容
        final trimmed = line.trim();
        final content = trimmed.substring(1).trim();
        if (isItineraryLike) {
          final timeHeading = _extractTimeHeading(content);
          if (timeHeading != null) {
            widgets.add(
              Padding(
                padding: const EdgeInsets.only(top: 6, bottom: 4),
                child: Text(
                  timeHeading,
                  style: AppTheme.titleMedium(context).copyWith(
                    color: AppTheme.black,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
              ),
            );
          } else if (_isItineraryPlaceLine(content)) {
            widgets.add(
              Padding(
                padding: const EdgeInsets.only(top: 4, bottom: 6),
                child: _buildItineraryMarkdownPlace(
                  content,
                  places: places,
                  nameMapping: nameMapping,
                ),
              ),
            );
          } else {
            widgets.add(
              Padding(
                padding: const EdgeInsets.only(top: 2, bottom: 2),
                child: _buildRichText(content,
                    places: places, nameMapping: nameMapping),
              ),
            );
          }
        } else {
          widgets.add(
            Padding(
              padding: const EdgeInsets.only(top: 2, bottom: 2),
              child: _buildRichText(content,
                  places: places, nameMapping: nameMapping),
            ),
          );
        }
      } else if (RegExp(r'^\d+\.\s*').hasMatch(line.trim())) {
        // 有序列表项（如 "1. [Site Name](URL) - description" 或 "1.**Name**"）
        final match = RegExp(r'^(\d+)\.\s*(.*)$').firstMatch(line.trim());
        if (match != null) {
          final number = match.group(1)!;
          final content = match.group(2)!;
          if (isItineraryLike && _isItineraryPlaceLine(content)) {
            widgets.add(
              Padding(
                padding: const EdgeInsets.only(top: 4, bottom: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('$number. ',
                        style: AppTheme.bodyMedium(context)
                            .copyWith(color: AppTheme.black)),
                    Expanded(
                      child: _buildItineraryMarkdownPlace(
                        content,
                        places: places,
                        nameMapping: nameMapping,
                      ),
                    ),
                  ],
                ),
              ),
            );
          } else {
            widgets.add(
              Padding(
                padding: const EdgeInsets.only(top: 2, bottom: 2),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('$number. ',
                        style: AppTheme.bodyMedium(context)
                            .copyWith(color: AppTheme.black)),
                    Expanded(
                      child: _buildRichText(content,
                          places: places, nameMapping: nameMapping),
                    ),
                  ],
                ),
              ),
            );
          }
        } else {
          // fallback: 直接渲染
          widgets.add(
              _buildRichText(line, places: places, nameMapping: nameMapping));
        }
      } else {
        // 普通段落 - 支持内联加粗
        // 🔧 检查是否是网站行，如果是则单独处理
        // 支持两种格式：
        // 1. Markdown格式: 网站：[domain.com](https://domain.com)
        // 2. 纯文本格式: 网站：domain.com
        final websiteMarkdownRegex = RegExp(
          r'^(网站|官网|Website|website)[：:]\s*\[([^\]]+)\]\(([^\)]+)\)',
          caseSensitive: false,
        );
        final websitePlainRegex = RegExp(
          r'^(网站|官网|Website|website)[：:]\s*((?:https?:\/\/)?[a-zA-Z0-9][\w\-\.]*\.[a-zA-Z]{2,}(?:\/[^\s\(\）]*)?)',
          caseSensitive: false,
        );

        final websiteMarkdownMatch = websiteMarkdownRegex.firstMatch(line);
        final websitePlainMatch = websitePlainRegex.firstMatch(line);

        if (websiteMarkdownMatch != null) {
          // Markdown格式: [displayText](url)
          final displayText = websiteMarkdownMatch.group(2) ?? '';
          final fullUrl = websiteMarkdownMatch.group(3) ?? '';

          print(
              '🌐 Detected website line (markdown): $line -> display: $displayText, URL: $fullUrl');

          widgets.add(
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: GestureDetector(
                onTap: () async {
                  final uri = Uri.tryParse(fullUrl);
                  if (uri != null && await canLaunchUrl(uri)) {
                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                  }
                },
                child: RichText(
                  text: TextSpan(
                    children: [
                      TextSpan(
                        text: '网站：',
                        style: AppTheme.bodyMedium(context).copyWith(
                          color: AppTheme.black,
                          fontWeight: FontWeight.normal,
                        ),
                      ),
                      TextSpan(
                        text: displayText,
                        style: AppTheme.bodyMedium(context).copyWith(
                          color: AppTheme.black,
                          fontWeight: FontWeight.normal,
                          decoration: TextDecoration.underline,
                          decorationColor: AppTheme.black,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        } else if (websitePlainMatch != null) {
          // 纯文本格式: 网站：domain.com
          final websiteUrl = websitePlainMatch.group(2) ?? '';
          final fullUrl = websiteUrl.startsWith('http')
              ? websiteUrl
              : 'https://$websiteUrl';

          print('🌐 Detected website line (plain): $line -> URL: $fullUrl');

          widgets.add(
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: GestureDetector(
                onTap: () async {
                  final uri = Uri.tryParse(fullUrl);
                  if (uri != null && await canLaunchUrl(uri)) {
                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                  }
                },
                child: RichText(
                  text: TextSpan(
                    children: [
                      TextSpan(
                        text: '网站：',
                        style: AppTheme.bodyMedium(context).copyWith(
                          color: AppTheme.black,
                          fontWeight: FontWeight.normal,
                        ),
                      ),
                      TextSpan(
                        text: websiteUrl,
                        style: AppTheme.bodyMedium(context).copyWith(
                          color: AppTheme.black,
                          fontWeight: FontWeight.normal,
                          decoration: TextDecoration.underline,
                          decorationColor: AppTheme.black,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        } else if (isItineraryLike) {
          final timeHeading = _extractTimeHeading(line);
          if (timeHeading != null) {
            widgets.add(
              Padding(
                padding: const EdgeInsets.only(top: 6, bottom: 4),
                child: Text(
                  timeHeading,
                  style: AppTheme.titleMedium(context).copyWith(
                    color: AppTheme.black,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
              ),
            );
          } else {
            widgets.add(
                _buildRichText(line, places: places, nameMapping: nameMapping));
          }
        } else {
          widgets.add(
              _buildRichText(line, places: places, nameMapping: nameMapping));
        }
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: widgets,
    );
  }

  /// 构建可点击的标题（如果匹配到地点则可点击跳转详情页）
  /// 用于 ### 级别标题，匹配地点名称后变为可点击样式
  /// 支持 "金田家 Kanada-Ya" 格式（中文名 + 英文名）
  /// [nameMapping] 用于将中文显示名称映射到英文数据库名称
  Widget _buildClickableHeader(String titleText,
      {List<PlaceResult>? places, List<PlaceNameMapping>? nameMapping}) {
    // 🔧 清理可能遗留的 markdown 标题符号
    String cleanedTitle = titleText;
    if (cleanedTitle.startsWith('#### ')) {
      cleanedTitle = cleanedTitle.substring(5);
    } else if (cleanedTitle.startsWith('### ')) {
      cleanedTitle = cleanedTitle.substring(4);
    } else if (cleanedTitle.startsWith('## ')) {
      cleanedTitle = cleanedTitle.substring(3);
    } else if (cleanedTitle.startsWith('# ')) {
      cleanedTitle = cleanedTitle.substring(2);
    }
    titleText = cleanedTitle;

    // 提取地点名（移除评分部分，如 "Louvre Museum (4.6分)" -> "Louvre Museum"）
    String placeName = titleText;

    // 移除评分部分 (X.X分) 或 (X.X) - 评分不需要显示
    final ratingMatch =
        RegExp(r'\s*[（(](\d+\.?\d*)(分)?[）)]$').firstMatch(titleText);
    if (ratingMatch != null) {
      placeName = titleText.substring(0, ratingMatch.start).trim();
    }

    // 查找匹配的地点
    PlaceResult? matchedPlace;
    if (places != null && places.isNotEmpty) {
      final placeNameLower = placeName.toLowerCase().trim();

      // 🆕 首先通过 nameMapping 查找英文名称
      String? englishNameToSearch;
      if (nameMapping != null && nameMapping.isNotEmpty) {
        for (final mapping in nameMapping) {
          if (mapping.displayName.toLowerCase() == placeNameLower ||
              placeNameLower.contains(mapping.displayName.toLowerCase()) ||
              mapping.displayName.toLowerCase().contains(placeNameLower)) {
            englishNameToSearch = mapping.englishName.toLowerCase();
            debugPrint(
                '🗺️ _buildClickableHeader: Found mapping "$placeName" -> "${mapping.englishName}"');
            break;
          }
        }
      }

      // 提取可能的中文名和英文名部分（如 "金田家 Kanada-Ya" -> ["金田家", "Kanada-Ya"]）
      final nameParts = <String>[];
      nameParts.add(placeNameLower);

      // 🆕 如果有英文映射，优先添加
      if (englishNameToSearch != null) {
        nameParts.insert(0, englishNameToSearch);
      }

      // 尝试分割中文和英文部分
      final chineseEnglishMatch =
          RegExp(r'^([\u4e00-\u9fff]+)\s+(.+)$').firstMatch(placeName);
      if (chineseEnglishMatch != null) {
        nameParts.add(chineseEnglishMatch.group(1)!.toLowerCase()); // 中文部分
        nameParts.add(chineseEnglishMatch.group(2)!.toLowerCase()); // 英文部分
      }

      for (final place in places) {
        final pNameLower = place.name.toLowerCase().trim();

        // 检查所有可能的名称部分
        for (final namePart in nameParts) {
          if (namePart == pNameLower ||
              namePart.contains(pNameLower) ||
              pNameLower.contains(namePart)) {
            matchedPlace = place;
            debugPrint(
                '🗺️ _buildClickableHeader: Matched "$placeName" to place "${place.name}"');
            break;
          }
        }
        if (matchedPlace != null) break;
      }
    }

    if (matchedPlace != null) {
      // 匹配到地点，显示可点击样式（带评分）
      final placeToShow = matchedPlace;
      // 构建显示文本（带评分）
      String displayText = placeName;
      if (placeToShow.rating != null && placeToShow.rating! > 0) {
        displayText = '$placeName (${placeToShow.rating!.toStringAsFixed(1)})';
      }
      return GestureDetector(
        onTap: () {
          debugPrint('📍 Tapped on header place: ${placeToShow.name}');
          _showPlaceDetail(placeToShow);
        },
        child: Text(
          displayText,
          style: AppTheme.bodyLarge(context).copyWith(
            color: AppTheme.accentBlue,
            fontWeight: FontWeight.w700,
            fontSize: 18,
            decoration: TextDecoration.underline,
            decorationColor: AppTheme.accentBlue,
          ),
        ),
      );
    } else {
      // 没有匹配到地点，普通加粗标题（不显示评分）
      return Text(
        placeName,
        style: AppTheme.bodyLarge(context).copyWith(
          color: AppTheme.black,
          fontWeight: FontWeight.w700,
          fontSize: 18,
        ),
      );
    }
  }

  Widget _buildItineraryMarkdownPlace(String content,
      {List<PlaceResult>? places, List<PlaceNameMapping>? nameMapping}) {
    final parsed = _parseItineraryMarkdownEntry(content);
    if (parsed == null) {
      return _buildRichText(content, places: places, nameMapping: nameMapping);
    }

    final cleanTitleForMatch = _stripRatingFromTitle(parsed.title);
    final matchedPlace = _findPlaceByName(cleanTitleForMatch, places);
    final description = _formatItineraryDescription(
      parsed.description,
      matchedPlace,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildClickableHeader(parsed.title,
            places: places, nameMapping: nameMapping),
        if (description != null && description.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(
            description,
            style: AppTheme.bodyMedium(context).copyWith(
              color: AppTheme.darkGray,
              height: 1.4,
            ),
          ),
        ]
      ],
    );
  }

  _ItineraryMarkdownEntry? _parseItineraryMarkdownEntry(String content) {
    final match = RegExp(r'^([^：:]{1,60})[：:]\s*(.+)$').firstMatch(content);
    if (match == null) return null;
    final title = match.group(1)!.trim();
    final description = match.group(2)!.trim();
    if (title.isEmpty || description.isEmpty) return null;
    if (_isItineraryTipTitle(title)) return null;
    return _ItineraryMarkdownEntry(title: title, description: description);
  }

  bool _isItineraryTipTitle(String title) {
    final lower = title.toLowerCase().trim();
    return lower.startsWith('tip') ||
        lower.startsWith('tips') ||
        lower.startsWith('note') ||
        title.startsWith('提示') ||
        title.startsWith('小贴士') ||
        title.startsWith('建议');
  }

  String _stripRatingFromTitle(String title) {
    return title
        .replaceAll(RegExp(r'\s*[（(]\d+\.?\d*(?:分)?[）)]\s*$'), '')
        .trim();
  }

  bool _isItineraryPlaceLine(String content) {
    final match = RegExp(r'^([^：:]{1,60})[：:]\s*(.+)$').firstMatch(content);
    if (match == null) return false;
    final title = match.group(1)?.trim() ?? '';
    if (title.isEmpty) return false;
    if (_isItineraryTipTitle(title)) return false;
    return true;
  }

  String? _extractTimeHeading(String content) {
    final trimmed = content.trim();
    final match = RegExp(
      r'^(?:[🌅☀️🌆🌙]\s*)?(上午|中午|下午|傍晚|晚上|夜晚|清晨|早上|午后|夜间|Morning|Afternoon|Evening|Night)(?:\s*[：:]\s*)?$',
      caseSensitive: false,
    ).firstMatch(trimmed);
    if (match == null) return null;
    return trimmed;
  }

  String? _extractTimeHeadingInlineContent(String content) {
    final match = RegExp(
      r'^(?:[🌅☀️🌆🌙]\s*)?(?:上午|中午|下午|傍晚|晚上|夜晚|清晨|早上|午后|夜间|Morning|Afternoon|Evening|Night)\s*[：:]\s*(.+)$',
      caseSensitive: false,
    ).firstMatch(content.trim());
    if (match == null) return null;
    return match.group(1)?.trim();
  }

  /// 构建支持加粗和链接的富文本
  /// **地点名** 会显示为加粗可点击的样式，点击打开详情页
  /// [链接文字](URL) 会显示为可点击的蓝色链接
  /// [nameMapping] 用于将中文显示名称映射到英文数据库名称
  Widget _buildRichText(String text,
      {List<PlaceResult>? places, List<PlaceNameMapping>? nameMapping}) {
    final spans = <InlineSpan>[];

    // 🔧 清理 markdown 标题符号（####、###、##、# 开头）
    String cleanedText = text;
    if (cleanedText.startsWith('#### ')) {
      cleanedText = cleanedText.substring(5);
    } else if (cleanedText.startsWith('### ')) {
      cleanedText = cleanedText.substring(4);
    } else if (cleanedText.startsWith('## ')) {
      cleanedText = cleanedText.substring(3);
    } else if (cleanedText.startsWith('# ')) {
      cleanedText = cleanedText.substring(2);
    }
    // 使用清理后的文本
    text = cleanedText;

    // Debug: 打印传入的 places 列表
    debugPrint('🔍 _buildRichText places count: ${places?.length ?? 0}');
    if (places != null && places.isNotEmpty) {
      for (final p in places.take(5)) {
        debugPrint('🔍 Place: "${p.name}" rating: ${p.rating}');
      }
    }
    // Debug: 打印 nameMapping
    if (nameMapping != null && nameMapping.isNotEmpty) {
      debugPrint('🗺️ _buildRichText nameMapping count: ${nameMapping.length}');
      for (final m in nameMapping.take(5)) {
        debugPrint('🗺️ Mapping: "${m.displayName}" -> "${m.englishName}"');
      }
    }

    // 分开处理链接和加粗，避免复杂正则问题
    // 链接正则：[任意文字](URL) - URL 不能包含空格和右括号
    final linkRegex = RegExp(r'\[([^\]]+)\]\(([^)\s]+)\)');
    // 纯文本链接正则：名称(https://...) 或 名称（https://...）
    final plainLinkRegex = RegExp(
        r'([\u4e00-\u9fffA-Za-z0-9][\u4e00-\u9fffA-Za-z0-9\s·&\-]{0,40})\((https?:\/\/[^)\s]+)\)');
    final plainLinkRegexCn = RegExp(
        r'([\u4e00-\u9fffA-Za-z0-9][\u4e00-\u9fffA-Za-z0-9\s·&\-]{0,40})（(https?:\/\/[^）\s]+)）');
    // 网站标签链接正则：网站: URL 或 Website: URL 或 官网: URL
    // 支持两种格式：完整URL (https://...) 或简短域名 (example.com)
    // 注意：也捕获后面可能的评分如 "(4.5)" 以便一起移除
    final websiteLabelRegex = RegExp(
        r'(网站|官网|Website|website)[：:]\s*((?:https?:\/\/)?[a-zA-Z0-9][\w\-\.]*\.[a-zA-Z]{2,})(?:\s*[\(\（][\d\.]+[\)\）])?',
        caseSensitive: false);
    // 加粗正则：**text** - also handle escaped asterisks
    final boldRegex = RegExp(r'\*\*([^*]+)\*\*');

    // 🔥🔥🔥 DEBUG: 打印完整文本以便调试
    debugPrint('🔥🔥🔥 _buildRichText FULL TEXT: "$text"');
    if (text.contains('网站') || text.contains('Website')) {
      debugPrint('🔥🔥🔥 TEXT CONTAINS 网站/Website!');
    }

    // Debug: 打印原始文本
    if (text.contains('**')) {
      debugPrint(
          '🔍 _buildRichText bold check (first 300 chars): "${text.substring(0, text.length > 300 ? 300 : text.length)}"');
      final boldMatches = boldRegex.allMatches(text).toList();
      debugPrint('🔍 Bold regex found ${boldMatches.length} matches');
      for (final m in boldMatches) {
        debugPrint('💪 Bold Match: ${m.group(0)}, inner: ${m.group(1)}');
      }
    }
    if (text.contains('[') && text.contains('](')) {
      debugPrint(
          '🔍 _buildRichText input (first 300 chars): "${text.substring(0, text.length > 300 ? 300 : text.length)}"');

      // 测试链接正则
      final linkMatches = linkRegex.allMatches(text).toList();
      debugPrint('🔍 Link regex found ${linkMatches.length} matches');
      for (final m in linkMatches) {
        debugPrint('🔗 Match: [${m.group(1)}](${m.group(2)})');
      }
    }

    // 收集所有匹配项
    final allMatches = <_RichTextMatch>[];

    // ⚠️ 首先收集网站标签链接匹配（优先级最高，避免被其他正则抢先匹配）
    // 匹配 "网站:xxx.com" 或 "网站: xxx.com (4.6)" 格式
    final websiteMatches = websiteLabelRegex.allMatches(text).toList();
    debugPrint(
        '🌐 websiteLabelRegex found ${websiteMatches.length} matches in text');
    for (final match in websiteMatches) {
      final url = match.group(2)!;
      debugPrint(
          '🌐 Website match: full="${match.group(0)}", url="$url", start=${match.start}, end=${match.end}');
      allMatches.add(
        _RichTextMatch(
          start: match.start,
          end: match.end,
          type: 'website_link',
          text: url,
          url: url,
        ),
      );
    }

    // 收集链接匹配（排除与网站链接重叠的）
    for (final match in linkRegex.allMatches(text)) {
      final overlaps = allMatches.any(
        (m) =>
            (match.start >= m.start && match.start < m.end) ||
            (match.end > m.start && match.end <= m.end),
      );
      if (!overlaps) {
        allMatches.add(
          _RichTextMatch(
            start: match.start,
            end: match.end,
            type: 'link',
            text: match.group(1)!,
            url: match.group(2),
          ),
        );
      }
    }

    // 收集纯文本链接匹配（排除与已有链接重叠的）
    void addPlainLinkMatch(RegExpMatch match) {
      final overlaps = allMatches.any(
        (m) =>
            (match.start >= m.start && match.start < m.end) ||
            (match.end > m.start && match.end <= m.end),
      );
      if (overlaps) return;
      final label = (match.group(1) ?? '').trim();
      final url = match.group(2);
      if (label.isEmpty || url == null) return;
      allMatches.add(
        _RichTextMatch(
          start: match.start,
          end: match.end,
          type: 'link',
          text: label,
          url: url,
        ),
      );
    }

    for (final match in plainLinkRegex.allMatches(text)) {
      addPlainLinkMatch(match);
    }
    for (final match in plainLinkRegexCn.allMatches(text)) {
      addPlainLinkMatch(match);
    }

    // 收集加粗匹配（排除与链接重叠的）
    for (final match in boldRegex.allMatches(text)) {
      final overlaps = allMatches.any(
        (m) =>
            (match.start >= m.start && match.start < m.end) ||
            (match.end > m.start && match.end <= m.end),
      );
      if (!overlaps) {
        allMatches.add(
          _RichTextMatch(
            start: match.start,
            end: match.end,
            type: 'bold',
            text: match.group(1)!,
          ),
        );
      }
    }

    // 🆕 收集编号列表中的地点名匹配（用于 regular_travel 城市推荐场景）
    // 匹配格式：N.PlaceName - description 或 N. PlaceName - description
    // 也支持：N. **PlaceName** - description (带 bold 标记)
    // 例如："1.罗马斗兽场 - 古罗马时期的重要竞技场"
    if (places != null && places.isNotEmpty) {
      // 编号列表地点名正则：匹配 "数字.地点名" 或 "数字. 地点名" 格式
      // 地点名可以是中文、英文或混合，以 " - " 或 "–" 或行尾结束
      // 也支持 **bold** 格式
      final numberedPlaceRegex = RegExp(
        r'(\d+)\.\s*\*{0,2}([^*\-–\n]+?)\*{0,2}(?:\s*[\-–]|$)',
        multiLine: true,
      );

      for (final match in numberedPlaceRegex.allMatches(text)) {
        String placeName = match.group(2)?.trim() ?? '';
        // 移除任何残留的 ** 标记
        placeName = placeName.replaceAll(RegExp(r'\*+'), '').trim();
        if (placeName.isEmpty || placeName.length > 50) continue;

        // 检查这个地点名是否能匹配到 places 列表中的地点
        final matchedPlace =
            _findPlaceWithMapping(placeName, places, nameMapping);
        if (matchedPlace != null) {
          // 计算地点名在原文中的位置（排除编号部分）
          final fullMatch = match.group(0) ?? '';
          final placeNameInText = match.group(2)?.trim() ?? placeName;
          // 找到地点名在完整匹配中的位置
          final placeNameOffset = fullMatch.indexOf(placeNameInText);
          final actualStart =
              match.start + (placeNameOffset >= 0 ? placeNameOffset : 2);
          final placeNameEnd = actualStart + placeNameInText.length;

          // 检查是否与已有匹配重叠
          final overlaps = allMatches.any(
            (m) =>
                (actualStart >= m.start && actualStart < m.end) ||
                (placeNameEnd > m.start && placeNameEnd <= m.end),
          );
          if (!overlaps) {
            debugPrint(
                '📍 Found numbered list place: "$placeName" -> "${matchedPlace.name}" at $actualStart-$placeNameEnd');
            allMatches.add(
              _RichTextMatch(
                start: actualStart,
                end: placeNameEnd,
                type: 'numbered_place',
                text: placeNameInText,
                place: matchedPlace,
              ),
            );
          }
        }
      }
    }

    // 收集购票相关关键词匹配（如果有地点的 website 可用）
    // 关键词: purchase, book tickets, buy tickets, 购票, 在线购买, 在线购票, 网上购票
    String? ticketWebsite;
    if (places != null && places.isNotEmpty) {
      for (final p in places) {
        if (p.website != null && p.website!.isNotEmpty) {
          ticketWebsite = p.website;
          break;
        }
      }
    }

    if (ticketWebsite != null && ticketWebsite.isNotEmpty) {
      final ticketKeywordRegex = RegExp(
        r'(Purchase tickets online|Book tickets online|buy tickets online|purchase online|book online|购票|在线购买|在线购票|网上购票|提前购票|线上购票)',
        caseSensitive: false,
      );

      for (final match in ticketKeywordRegex.allMatches(text)) {
        final overlaps = allMatches.any(
          (m) =>
              (match.start >= m.start && match.start < m.end) ||
              (match.end > m.start && match.end <= m.end),
        );
        if (!overlaps) {
          allMatches.add(
            _RichTextMatch(
              start: match.start,
              end: match.end,
              type: 'ticket_link',
              text: match.group(0)!,
              url: ticketWebsite,
            ),
          );
        }
      }
    }

    // 注意：正文内容不添加地点链接（place_link）
    // 只有标题才有地点链接（通过 _buildClickableHeader 处理）

    // 按位置排序
    allMatches.sort((a, b) => a.start.compareTo(b.start));

    // 如果没有匹配，直接返回普通文本
    if (allMatches.isEmpty) {
      return Text(
        text,
        style: AppTheme.bodyMedium(context).copyWith(
          color: AppTheme.black,
          height: 1.5,
        ),
      );
    }

    int lastEnd = 0;

    for (final match in allMatches) {
      // 添加匹配前的普通文本
      if (match.start > lastEnd) {
        spans.add(
          TextSpan(
            text: text.substring(lastEnd, match.start),
            style: AppTheme.bodyMedium(context).copyWith(
              color: AppTheme.black,
              height: 1.5,
            ),
          ),
        );
      }

      if (match.type == 'bold') {
        // 加粗文本 - 尝试匹配地点，如果匹配到则可点击跳转详情
        // 🆕 使用 _findPlaceWithMapping 来支持中文显示名称到英文数据库名称的映射
        final matchedPlace =
            _findPlaceWithMapping(match.text, places, nameMapping);

        if (matchedPlace != null) {
          // 匹配到地点，显示可点击样式（蓝色下划线）
          final placeToShow = matchedPlace;
          // 构建显示文本（带评分）
          String displayText = match.text;
          if (placeToShow.rating != null && placeToShow.rating! > 0) {
            displayText =
                '${match.text} (${placeToShow.rating!.toStringAsFixed(1)})';
          }
          spans.add(
            TextSpan(
              text: displayText,
              style: AppTheme.bodyLarge(context).copyWith(
                color: AppTheme.accentBlue,
                fontWeight: FontWeight.w700,
                fontSize: 16,
                height: 1.5,
                decoration: TextDecoration.underline,
                decorationColor: AppTheme.accentBlue,
              ),
              recognizer: TapGestureRecognizer()
                ..onTap = () {
                  debugPrint('📍 Tapped on bold place: ${placeToShow.name}');
                  _showPlaceDetail(placeToShow);
                },
            ),
          );
        } else {
          // 没有匹配到地点，显示普通加粗样式
          spans.add(
            TextSpan(
              text: match.text,
              style: AppTheme.bodyLarge(context).copyWith(
                color: AppTheme.black,
                fontWeight: FontWeight.w700,
                fontSize: 16,
                height: 1.5,
              ),
            ),
          );
        }
      } else if (match.type == 'link' && match.url != null) {
        // 链接
        final linkUrl = match.url!;
        debugPrint('🔗 Creating clickable link: "${match.text}" -> "$linkUrl"');

        // 统一处理：移除 ** 标记获取纯名称
        String linkDisplayText = match.text;
        if (linkDisplayText.startsWith('**') &&
            linkDisplayText.endsWith('**')) {
          linkDisplayText =
              linkDisplayText.substring(2, linkDisplayText.length - 2);
        }
        // 也处理单边 ** 的情况
        linkDisplayText = linkDisplayText
            .replaceAll(RegExp(r'^\*\*'), '')
            .replaceAll(RegExp(r'\*\*$'), '');

        // 检查是否为 (place) 标记 - AI 生成的建筑地点链接
        // 格式: [**Building Name**](place) 或 [Building Name](place)
        if (linkUrl == 'place') {
          // 这是一个地点链接标记，尝试通过名称匹配地点
          // 🆕 使用 _findPlaceWithMapping 来支持中文显示名称到英文数据库名称的映射
          final matchedPlace =
              _findPlaceWithMapping(linkDisplayText, places, nameMapping);

          if (matchedPlace != null) {
            // 找到匹配的地点，显示可点击链接（带评分）
            final placeToShow = matchedPlace;
            String displayText = linkDisplayText;
            if (placeToShow.rating != null && placeToShow.rating! > 0) {
              displayText =
                  '$linkDisplayText (${placeToShow.rating!.toStringAsFixed(1)})';
            }
            spans.add(
              TextSpan(
                text: displayText,
                style: AppTheme.bodyLarge(context).copyWith(
                  color: AppTheme.accentBlue,
                  fontWeight: FontWeight.w700,
                  fontSize: 16,
                  height: 1.5,
                  decoration: TextDecoration.underline,
                  decorationColor: AppTheme.accentBlue,
                ),
                recognizer: TapGestureRecognizer()
                  ..onTap = () {
                    debugPrint(
                        '📍 Tapped on place marker link: ${placeToShow.name}');
                    _showPlaceDetail(placeToShow);
                  },
              ),
            );
          } else {
            // 找不到匹配的地点，显示为普通加粗文本（不可点击）
            debugPrint('⚠️ Place not found for name: $linkDisplayText');
            spans.add(
              TextSpan(
                text: linkDisplayText,
                style: AppTheme.bodyLarge(context).copyWith(
                  color: AppTheme.black,
                  fontWeight: FontWeight.w700,
                  fontSize: 16,
                  height: 1.5,
                ),
              ),
            );
          }
        } else {
          // 检查是否为内部地点链接 (/place/uuid)
          final placeIdMatch =
              RegExp(r'^/place/([a-zA-Z0-9\-]+)$').firstMatch(linkUrl);
          if (placeIdMatch != null) {
            // 内部地点链接 - 查找匹配的地点并打开详情页
            final placeId = placeIdMatch.group(1);
            PlaceResult? matchedPlace;
            if (places != null && places.isNotEmpty) {
              for (final place in places) {
                if (place.id == placeId) {
                  matchedPlace = place;
                  break;
                }
              }
            }

            if (matchedPlace != null) {
              // 找到匹配的地点，显示可点击链接（带评分）
              final placeToShow = matchedPlace;
              String displayText = linkDisplayText;
              if (placeToShow.rating != null && placeToShow.rating! > 0) {
                displayText =
                    '$linkDisplayText (${placeToShow.rating!.toStringAsFixed(1)})';
              }
              spans.add(
                TextSpan(
                  text: displayText,
                  style: AppTheme.bodyLarge(context).copyWith(
                    color: AppTheme.accentBlue,
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                    height: 1.5,
                    decoration: TextDecoration.underline,
                    decorationColor: AppTheme.accentBlue,
                  ),
                  recognizer: TapGestureRecognizer()
                    ..onTap = () {
                      debugPrint(
                          '📍 Tapped on place link: ${placeToShow.name}');
                      _showPlaceDetail(placeToShow);
                    },
                ),
              );
            } else {
              // 找不到匹配的地点，显示为普通加粗文本（不可点击）
              debugPrint('⚠️ Place not found for id: $placeId');
              spans.add(
                TextSpan(
                  text: linkDisplayText,
                  style: AppTheme.bodyLarge(context).copyWith(
                    color: AppTheme.black,
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                    height: 1.5,
                  ),
                ),
              );
            }
          } else {
            // 优先按名称匹配地点（即使是外部 URL），避免跳转到 H5
            // 🆕 使用 _findPlaceWithMapping 来支持中文显示名称到英文数据库名称的映射
            final matchedPlace =
                _findPlaceWithMapping(linkDisplayText, places, nameMapping);

            if (matchedPlace != null) {
              // 匹配到地点，显示可点击链接
              final placeToShow = matchedPlace;
              String displayText = linkDisplayText;
              if (placeToShow.rating != null && placeToShow.rating! > 0) {
                displayText =
                    '$linkDisplayText (${placeToShow.rating!.toStringAsFixed(1)})';
              }
              spans.add(
                TextSpan(
                  text: displayText,
                  style: AppTheme.bodyLarge(context).copyWith(
                    color: AppTheme.accentBlue,
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                    height: 1.5,
                    decoration: TextDecoration.underline,
                    decorationColor: AppTheme.accentBlue,
                  ),
                  recognizer: TapGestureRecognizer()
                    ..onTap = () {
                      debugPrint(
                          '📍 Tapped on matched place link: ${placeToShow.name}');
                      _showPlaceDetail(placeToShow);
                    },
                ),
              );
            } else {
              // 检查是否为真正的外部网站链接（URL 格式）
              final isExternalUrl = linkUrl.startsWith('http://') ||
                  linkUrl.startsWith('https://') ||
                  RegExp(r'^[a-zA-Z0-9][\w\-\.]*\.[a-zA-Z]{2,}')
                      .hasMatch(linkUrl);

              if (isExternalUrl) {
                // 外部网站链接 - 黑色正文+下划线，不加粗，不变大，点击打开浏览器
                final fullUrl =
                    linkUrl.startsWith('http') ? linkUrl : 'https://$linkUrl';
                spans.add(
                  TextSpan(
                    text: linkDisplayText,
                    style: AppTheme.bodyMedium(context).copyWith(
                      color: AppTheme.black,
                      height: 1.5,
                      decoration: TextDecoration.underline,
                      decorationColor: AppTheme.black,
                    ),
                    recognizer: TapGestureRecognizer()
                      ..onTap = () {
                        debugPrint('🌐 Tapped on external link: $fullUrl');
                        _launchUrl(fullUrl);
                      },
                  ),
                );
              } else {
                // 外部链接或无法匹配 - 显示为普通加粗文本（不可点击）
                // 因为无法确定目标，不提供点击功能
                spans.add(
                  TextSpan(
                    text: linkDisplayText,
                    style: AppTheme.bodyLarge(context).copyWith(
                      color: AppTheme.black,
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                      height: 1.5,
                    ),
                  ),
                );
              }
            }
          }
        } // 关闭 linkUrl == 'place' 的 else 块
      } else if (match.type == 'numbered_place' && match.place != null) {
        // 🆕 编号列表中的地点名 - 仅添加下划线，不改变字体大小和颜色，点击跳转详情页
        final placeToShow = match.place!;
        debugPrint(
            '📍 Creating numbered place link: "${match.text}" -> "${placeToShow.name}"');

        spans.add(
          TextSpan(
            text: match.text,
            style: AppTheme.bodyMedium(context).copyWith(
              color: AppTheme.black, // 保持原有颜色
              height: 1.5,
              decoration: TextDecoration.underline, // 仅添加下划线
              decorationColor: AppTheme.black,
              // 不改变字体大小和粗细
            ),
            recognizer: TapGestureRecognizer()
              ..onTap = () {
                debugPrint('📍 Tapped on numbered place: ${placeToShow.name}');
                _showPlaceDetail(placeToShow);
              },
          ),
        );
      } else if (match.type == 'ticket_link' && match.url != null) {
        // 购票相关关键词链接 - 黑色下划线样式，点击跳转官网
        final ticketUrl = match.url!;
        debugPrint('🎫 Creating ticket link: "${match.text}" -> "$ticketUrl"');

        spans.add(
          TextSpan(
            text: match.text,
            style: AppTheme.bodyMedium(context).copyWith(
              color: AppTheme.black,
              height: 1.5,
              decoration: TextDecoration.underline,
              decorationColor: AppTheme.black,
            ),
            recognizer: TapGestureRecognizer()
              ..onTap = () {
                debugPrint('🎫 Tapped on ticket link: $ticketUrl');
                _launchUrl(ticketUrl);
              },
          ),
        );
      } else if (match.type == 'website_link' && match.url != null) {
        // 网站链接 - 换行显示，黑色普通文本+下划线，不加粗
        final websiteUrl = match.url!;
        final fullUrl =
            websiteUrl.startsWith('http') ? websiteUrl : 'https://$websiteUrl';
        // 显示时去掉 https:// 前缀
        final displayUrl = websiteUrl.replaceFirst(RegExp(r'^https?://'), '');
        debugPrint('🌐 Creating website link: "$displayUrl" -> "$fullUrl"');

        // 先添加换行
        spans.add(
          TextSpan(
            text: '\n',
            style: AppTheme.bodyMedium(context).copyWith(
              height: 1.5,
            ),
          ),
        );
        // 添加 "网站：" 标签（普通文本，不可点击）
        spans.add(
          TextSpan(
            text: '网站：',
            style: AppTheme.bodyMedium(context).copyWith(
              color: AppTheme.black,
              height: 1.5,
              fontWeight: FontWeight.normal,
            ),
          ),
        );
        // 然后添加网站链接（黑色普通文本+下划线）
        spans.add(
          TextSpan(
            text: displayUrl,
            style: AppTheme.bodyMedium(context).copyWith(
              color: AppTheme.black,
              height: 1.5,
              decoration: TextDecoration.underline,
              decorationColor: AppTheme.black,
              fontWeight: FontWeight.normal,
            ),
            recognizer: TapGestureRecognizer()
              ..onTap = () {
                debugPrint('🌐 Tapped on website link: $fullUrl');
                _launchUrl(fullUrl);
              },
          ),
        );
      }
      // 注意：place_link 类型已移除，正文内容不再有地点链接

      lastEnd = match.end;
    }

    // 添加剩余的普通文本
    if (lastEnd < text.length) {
      spans.add(
        TextSpan(
          text: text.substring(lastEnd),
          style: AppTheme.bodyMedium(context).copyWith(
            color: AppTheme.black,
            height: 1.5,
          ),
        ),
      );
    }

    return RichText(
      text: TextSpan(children: spans),
    );
  }

  /// 构建城市地点分组展示（城市名 + 横滑卡片）
  // ignore: unused_element
  Widget _buildCityPlacesSection(CityPlacesGroup cityGroup) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 城市名称标题
          Text(
            cityGroup.city,
            style: AppTheme.titleMedium(context).copyWith(
              color: AppTheme.black,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 12),
          // 横滑卡片
          _buildHorizontalPlaceCards(cityGroup.places),
        ],
      );

  /// 构建带 summary 的横滑地点卡片列表
  /// 横向滚动，每个卡片下方显示 AI 生成的简介（黑色小字）
  /// 如果只有 1 个地点，则撑满宽度显示
  Widget _buildHorizontalPlaceCardsWithSummary(List<PlaceResult> places) {
    // 过滤掉没有图片的地点
    final placesWithImage = places.where((p) => p.hasValidCoverImage).toList();

    // 如果只有 1 个地点（无论有无图片），特殊处理
    if (places.length == 1) {
      final place = places.first;
      final spot = _placeResultToSpot(place);

      // 没有图片：显示横向小卡片
      if (!place.hasValidCoverImage) {
        return _buildNoImagePlaceCard(place, spot);
      }

      // 有图片：全宽卡片
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: 230,
            width: double.infinity,
            child: _SpotCardOverlay(spot: spot),
          ),
          if (place.summary.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              place.summary,
              style: AppTheme.bodySmall(context).copyWith(
                color: AppTheme.black,
                height: 1.4,
              ),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      );
    }

    if (placesWithImage.isEmpty) return const SizedBox.shrink();

    return SizedBox(
      height: 310, // 卡片高度 230 + summary 高度约 80
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        clipBehavior: Clip.none, // 允许阴影溢出
        itemCount: placesWithImage.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (context, index) {
          final place = placesWithImage[index];
          final spot = _placeResultToSpot(place);
          return SizedBox(
            width: 280,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 卡片
                SizedBox(
                  height: 230,
                  child: _SpotCardOverlay(spot: spot),
                ),
                // AI Summary（如果有）
                if (place.summary.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Expanded(
                    child: Text(
                      place.summary,
                      style: AppTheme.bodySmall(context).copyWith(
                        color: AppTheme.black,
                        height: 1.4,
                      ),
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  /// 构建无图片地点卡片（单个地点无封面图时使用）
  /// 横向小卡片，仅展示：标题、评分、评分人数、收藏状态
  Widget _buildNoImagePlaceCard(PlaceResult place, Spot spot) {
    final hasRating = place.rating != null && place.rating! > 0;

    return GestureDetector(
      onTap: () => _showPlaceDetail(place),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTheme.black, width: 1.5),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.08),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          children: [
            // 标题和评分
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  // 标题
                  Text(
                    place.name,
                    style: AppTheme.titleMedium(context).copyWith(
                      fontWeight: FontWeight.w600,
                      color: AppTheme.black,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (hasRating) ...[
                    const SizedBox(height: 6),
                    // 评分行
                    Row(
                      children: [
                        const Icon(
                          Icons.star,
                          color: AppTheme.primaryYellow,
                          size: 16,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          place.rating!.toStringAsFixed(1),
                          style: AppTheme.bodyMedium(context).copyWith(
                            fontWeight: FontWeight.w600,
                            color: AppTheme.black,
                          ),
                        ),
                        if (place.ratingCount != null &&
                            place.ratingCount! > 0) ...[
                          const SizedBox(width: 4),
                          Text(
                            '(${_formatRatingCount(place.ratingCount!)})',
                            style: AppTheme.bodySmall(context).copyWith(
                              color: AppTheme.mediumGray,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ],
              ),
            ),
            // 收藏按钮
            const SizedBox(width: 12),
            _CompactSaveButton(spot: spot),
          ],
        ),
      ),
    );
  }

  /// 格式化评分人数
  String _formatRatingCount(int count) {
    if (count >= 1000) {
      return '${(count / 1000).toStringAsFixed(1)}k';
    }
    return count.toString();
  }

  /// 构建横滑地点卡片列表
  Widget _buildHorizontalPlaceCards(List<PlaceResult> places) {
    // 过滤掉没有图片的地点
    final placesWithImage = places.where((p) => p.hasValidCoverImage).toList();
    if (placesWithImage.isEmpty) return const SizedBox.shrink();

    return SizedBox(
      height: 230, // 4:3 比例 + 边框 + 阴影边距
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        clipBehavior: Clip.none, // 允许阴影溢出
        itemCount: placesWithImage.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (context, index) {
          final place = placesWithImage[index];
          final spot = _placeResultToSpot(place);
          return SizedBox(
            width: 280,
            child: _SpotCardOverlay(spot: spot),
          );
        },
      ),
    );
  }

  /// 构建 AI 地点列表（没有图片的地点，文字格式展示）
  /// 展示：标题（可点击）、简介、网站
  Widget _buildTextOnlyPlacesList(List<PlaceResult> places) {
    if (places.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: places.map((place) {
        return Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: _buildTextOnlyPlaceItem(place),
        );
      }).toList(),
    );
  }

  /// 构建单个 AI 地点条目（文字格式）
  /// 结构：标题（带评分，可点击）、简介、网站
  Widget _buildTextOnlyPlaceItem(PlaceResult place) {
    final hasWebsite = place.website != null && place.website!.isNotEmpty;
    final hasRating = place.rating != null && place.rating! > 0;

    // 清理 summary 中的网站信息（因为网站会单独显示）
    String cleanedSummary = place.summary;
    // 移除 "网站:xxx.com" 或 "Website: xxx.com" 格式的文本（可能在句中或句末）
    cleanedSummary = cleanedSummary
        .replaceAll(
            RegExp(r'[。\.\s]*网站[:：]\s*[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}[/\w\-\.]*',
                caseSensitive: false),
            '')
        .replaceAll(
            RegExp(
                r'[。\.\s]*Website[:：]\s*[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}[/\w\-\.]*',
                caseSensitive: false),
            '')
        .trim();
    final hasDescription = cleanedSummary.isNotEmpty;

    // 构建标题文本：名称 + 评分（如果有）
    String titleText = place.name;
    if (hasRating) {
      titleText = '${place.name} (${place.rating!.toStringAsFixed(1)})';
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 标题（带评分，可点击跳转详情页）
        GestureDetector(
          onTap: () => _showPlaceDetail(place),
          child: Text(
            titleText,
            style: AppTheme.titleMedium(context).copyWith(
              color: AppTheme.accentBlue,
              fontWeight: FontWeight.w600,
              decoration: TextDecoration.underline,
              decorationColor: AppTheme.accentBlue,
            ),
          ),
        ),
        // 简介 - 更加丰富的展示
        if (hasDescription) ...[
          const SizedBox(height: 6),
          Text(
            cleanedSummary,
            style: AppTheme.bodyMedium(context).copyWith(
              color: AppTheme.black,
              height: 1.5,
            ),
          ),
        ],
        // 网站（单独一行，带 Website:/网站: 前缀）
        if (hasWebsite) ...[
          const SizedBox(height: 6),
          GestureDetector(
            onTap: () => _launchUrl(place.website!),
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: _containsChinese(place.name) ||
                            _containsChinese(place.summary)
                        ? '网站: '
                        : 'Website: ',
                    style: AppTheme.bodySmall(context).copyWith(
                      color: AppTheme.black,
                      fontWeight: FontWeight.normal,
                    ),
                  ),
                  TextSpan(
                    text: _formatWebsiteUrl(place.website!),
                    style: AppTheme.bodySmall(context).copyWith(
                      color: AppTheme.black,
                      decoration: TextDecoration.underline,
                      decorationColor: AppTheme.black,
                      fontWeight: FontWeight.normal,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }

  /// 格式化网站 URL 用于显示
  String _formatWebsiteUrl(String url) {
    // 移除 http:// 或 https://
    String formatted = url.replaceFirst(RegExp(r'^https?://'), '');
    // 移除尾部斜杠
    if (formatted.endsWith('/')) {
      formatted = formatted.substring(0, formatted.length - 1);
    }
    return formatted;
  }

  Widget _buildImageGrid(List<String> imageUrls) {
    if (imageUrls.length == 1) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.file(
          File(imageUrls.first),
          width: 200,
          height: 150,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => Container(
            width: 200,
            height: 150,
            color: AppTheme.lightGray,
            child: const Icon(Icons.broken_image, color: AppTheme.mediumGray),
          ),
        ),
      );
    }
    return Wrap(
      spacing: 4,
      runSpacing: 4,
      children: imageUrls
          .take(5)
          .map(
            (url) => ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: Image.file(
                File(url),
                width: 80,
                height: 80,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                  width: 80,
                  height: 80,
                  color: AppTheme.lightGray,
                  child: const Icon(Icons.broken_image,
                      size: 24, color: AppTheme.mediumGray),
                ),
              ),
            ),
          )
          .toList(),
    );
  }

  Widget _buildInputArea() => Container(
        padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 12,
            bottom: MediaQuery.of(context).padding.bottom + 12),
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: AppTheme.lightGray, width: 1)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
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
                        contentPadding:
                            EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      ),
                      onChanged: (_) => setState(() {}),
                      onSubmitted: (_) => _handleSendMessage(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: _isSendingMessage
                      ? _handleCancelRequest
                      : (_isSendEnabled() ? _handleSendMessage : null),
                  child: Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: _isSendingMessage
                          ? AppTheme.lightGray
                          : (_isSendEnabled()
                              ? AppTheme.primaryYellow
                              : AppTheme.lightGray),
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: _isSendingMessage
                            ? AppTheme.lightGray
                            : (_isSendEnabled()
                                ? AppTheme.black
                                : AppTheme.lightGray),
                        width: 1.5,
                      ),
                    ),
                    child: Icon(
                      _isSendingMessage
                          ? Icons.stop_rounded
                          : Icons.arrow_forward,
                      color: _isSendingMessage
                          ? AppTheme.black
                          : (_isSendEnabled()
                              ? AppTheme.black
                              : AppTheme.mediumGray),
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
          itemCount: _selectedImages.length,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (context, index) => Stack(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.file(File(_selectedImages[index].path),
                    width: 80, height: 80, fit: BoxFit.cover),
              ),
              Positioned(
                top: 4,
                right: 4,
                child: GestureDetector(
                  onTap: () => setState(() => _selectedImages.removeAt(index)),
                  child: Container(
                    width: 20,
                    height: 20,
                    decoration: const BoxDecoration(
                        color: Colors.black54, shape: BoxShape.circle),
                    child:
                        const Icon(Icons.close, color: Colors.white, size: 14),
                  ),
                ),
              ),
            ],
          ),
        ),
      );

  /// 构建地图+底部横滑卡片组件
  /// 没有图片的地点使用白底小卡片
  Widget _buildMapWithBottomCards(List<PlaceResult> places,
      {bool isEnglish = false}) {
    if (places.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          isEnglish ? 'Explore them on map' : '在地图中查看',
          style: AppTheme.bodySmall(context).copyWith(
            color: AppTheme.darkGray,
            height: 1.4,
          ),
        ),
        const SizedBox(height: 8),
        RecommendationMapView(
          places: places,
          height: 200,
          onPlaceTap: _showPlaceDetail,
        ),
        // 移除底部横滑卡片，只保留地图
      ],
    );
  }

  /// 构建紧凑型地点卡片 - 适用于地图底部横滑
  /// 有图片时显示图片卡，无图片时显示白底文字卡
  Widget _buildCompactPlaceCard(PlaceResult place) {
    final hasImage = place.hasValidCoverImage;

    return GestureDetector(
      onTap: () => _showPlaceDetail(place),
      child: Container(
        width: hasImage ? 140 : 120,
        height: 90,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.08),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: hasImage
            ? Stack(
                fit: StackFit.expand,
                children: [
                  // 背景图片
                  CachedNetworkImage(
                    imageUrl: place.coverImage,
                    fit: BoxFit.cover,
                    placeholder: (_, __) => Container(
                      color: AppTheme.lightGray,
                    ),
                    errorWidget: (_, __, ___) => Container(
                      color: AppTheme.lightGray,
                      child: const Icon(Icons.image_not_supported,
                          color: AppTheme.mediumGray),
                    ),
                  ),
                  // 渐变遮罩
                  Positioned(
                    bottom: 0,
                    left: 0,
                    right: 0,
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.bottomCenter,
                          end: Alignment.topCenter,
                          colors: [
                            Colors.black.withValues(alpha: 0.7),
                            Colors.transparent,
                          ],
                        ),
                      ),
                      child: Text(
                        place.name,
                        style: AppTheme.bodySmall(context).copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                          fontSize: 12,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                ],
              )
            : // 无图片时的白底卡片
            Padding(
                padding: const EdgeInsets.all(10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      place.name,
                      style: AppTheme.bodySmall(context).copyWith(
                        color: AppTheme.black,
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (place.rating != null && place.rating! > 0) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          const Icon(Icons.star, color: Colors.amber, size: 12),
                          const SizedBox(width: 2),
                          Text(
                            place.rating!.toStringAsFixed(1),
                            style: AppTheme.bodySmall(context).copyWith(
                              color: AppTheme.darkGray,
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
      ),
    );
  }

  /// 获取所有有坐标的地点（用于地图展示）
  /// 包括 mapPlaces（优先）、places 和 textOnlyPlaces
  List<PlaceResult> _getAllPlacesWithCoordinates(SearchV2Result result) {
    final allPlaces = <PlaceResult>[];
    final seenKeys = <String>{};

    String keyOf(PlaceResult p) {
      final idKey = (p.id ?? '').trim();
      if (idKey.isNotEmpty) return 'id:$idKey';
      return 'name:${p.name.toLowerCase().trim()}';
    }

    // 优先使用 mapPlaces（后端已筛选有坐标的地点）
    final sources = [
      result.mapPlaces ?? [],
      result.places,
      result.textOnlyPlaces,
    ];

    for (final source in sources) {
      for (final p in source) {
        final key = keyOf(p);
        if (seenKeys.contains(key)) continue;
        // 检查坐标是否有效
        if (p.latitude != 0 && p.longitude != 0) {
          allPlaces.add(p);
          seenKeys.add(key);
        }
      }
    }

    debugPrint(
        '🗺️ [_getAllPlacesWithCoordinates] Found ${allPlaces.length} places with coordinates');
    return allPlaces;
  }

  /// 合并可用于文本点击匹配的地点列表（包含 textOnlyPlaces）
  /// 按 places -> textOnlyPlaces 的顺序去重
  List<PlaceResult> _mergePlacesForText(
    List<PlaceResult> places,
    List<PlaceResult> textOnlyPlaces,
  ) {
    // 始终进行去重，因为 mapPlaces 和 places 可能包含相同的地点
    final merged = <PlaceResult>[];
    final seenKeys = <String>{};

    String keyOf(PlaceResult p) {
      final idKey = (p.id ?? '').trim();
      if (idKey.isNotEmpty) return 'id:$idKey';
      final gpKey = (p.googlePlaceId ?? '').trim();
      if (gpKey.isNotEmpty) return 'gp:$gpKey';
      return 'name:${p.name.toLowerCase().trim()}';
    }

    for (final p in [...places, ...textOnlyPlaces]) {
      final key = keyOf(p);
      if (seenKeys.add(key)) {
        merged.add(p);
      }
    }

    return merged;
  }

  /// 从文本中提取中文地点名并尝试与英文地点列表匹配，生成 nameMapping
  /// 这是一个前端 fallback，当后端没有返回 nameMapping 时使用
  /// 采用双向匹配策略：
  /// 1. 从 textContent 提取中文名，用翻译字典匹配 places
  /// 2. 从 places 列表提取英文名，用反向翻译字典匹配 textContent
  List<PlaceNameMapping> _generateNameMappingFromText(
    String textContent,
    List<PlaceResult> places,
  ) {
    final nameMapping = <PlaceNameMapping>[];
    if (places.isEmpty) return nameMapping;

    final seenDisplayNames = <String>{};
    final seenEnglishNames = <String>{};

    // 策略1: 从 textContent 提取 **PlaceName** 格式的中文地点名
    final boldRegex = RegExp(r'\*\*([^*]+)\*\*');
    final matches = boldRegex.allMatches(textContent);

    for (final match in matches) {
      final displayName = match.group(1)?.trim() ?? '';
      if (displayName.isEmpty) continue;
      if (seenDisplayNames.contains(displayName.toLowerCase())) continue;

      // 只处理中文名称
      if (!RegExp(r'[\u4e00-\u9fff]').hasMatch(displayName)) continue;

      // 使用本地翻译字典尝试匹配
      final englishName = _translateChineseToEnglish(displayName);
      if (englishName != null) {
        // 在 places 中查找匹配的地点
        for (final place in places) {
          if (seenEnglishNames.contains(place.name.toLowerCase())) continue;
          if (_matchPlaceName(englishName, place.name)) {
            nameMapping.add(PlaceNameMapping(
              displayName: displayName,
              englishName: place.name,
            ));
            seenDisplayNames.add(displayName.toLowerCase());
            seenEnglishNames.add(place.name.toLowerCase());
            debugPrint(
                '🗺️ _generateNameMappingFromText (dict): "$displayName" -> "${place.name}"');
            break;
          }
        }
      }
    }

    // 策略2: 从 places 列表反向匹配（用英文名找中文名）
    // 这样可以覆盖翻译字典没有的地点
    for (final place in places) {
      if (seenEnglishNames.contains(place.name.toLowerCase())) continue;

      // 用反向翻译字典查找可能的中文名
      final possibleChineseNames = _getChineseNamesForEnglish(place.name);
      for (final chineseName in possibleChineseNames) {
        // 检查这个中文名是否出现在 textContent 中
        if (textContent.contains(chineseName) ||
            textContent.contains('**$chineseName**')) {
          if (!seenDisplayNames.contains(chineseName.toLowerCase())) {
            nameMapping.add(PlaceNameMapping(
              displayName: chineseName,
              englishName: place.name,
            ));
            seenDisplayNames.add(chineseName.toLowerCase());
            seenEnglishNames.add(place.name.toLowerCase());
            debugPrint(
                '🗺️ _generateNameMappingFromText (reverse): "$chineseName" -> "${place.name}"');
            break;
          }
        }
      }
    }

    return nameMapping;
  }

  /// 根据英文名获取可能的中文名列表
  List<String> _getChineseNamesForEnglish(String englishName) {
    final results = <String>[];
    final nameLower = englishName.toLowerCase();

    // 反向翻译字典
    const reverseDict = {
      // 日本
      'senso-ji': ['浅草寺', '浅草'],
      'senso-ji temple': ['浅草寺', '浅草'],
      'sensoji': ['浅草寺', '浅草'],
      'tokyo skytree': ['东京晴空塔', '晴空塔', '天空树'],
      'skytree': ['晴空塔', '天空树'],
      'tokyo tower': ['东京塔'],
      'akihabara': ['秋叶原'],
      'ueno park': ['上野公园', '上野'],
      'ueno zoo': ['上野动物园'],
      'meiji shrine': ['明治神宫'],
      'meiji jingu': ['明治神宫'],
      'harajuku': ['原宿'],
      'takeshita': ['竹下通', '原宿竹下通'],
      'takeshita street': ['竹下通', '原宿竹下通'],
      'omotesando': ['表参道'],
      'shibuya crossing': ['涩谷十字路口', '涩谷路口', '涩谷'],
      'shibuya': ['涩谷'],
      'shinjuku': ['新宿'],
      'ginza': ['银座'],
      'odaiba': ['台场'],
      'tokyo national museum': ['东京国立博物馆'],
      'nakamise': ['仲见世街', '仲见世'],
      'nakamise shopping street': ['仲见世街', '仲见世'],
      'imperial palace': ['皇居'],
      'roppongi': ['六本木'],
      'roppongi hills': ['六本木新城', '六本木'],
      'mori art museum': ['森美术馆'],
      'yoyogi park': ['代代木公园', '代々木公园'],
      'tsukiji': ['筑地市场', '筑地'],
      'toyosu market': ['丰洲市场'],
      'kinkaku-ji': ['金阁寺'],
      'fushimi inari': ['伏见稻荷大社', '伏见稻荷'],
      'kiyomizu-dera': ['清水寺'],
      'arashiyama': ['岚山'],
      'osaka castle': ['大阪城'],
      'dotonbori': ['道顿堀'],
      'shinsaibashi': ['心斋桥'],
      // 法国
      'eiffel tower': ['埃菲尔铁塔', '铁塔'],
      'louvre': ['卢浮宫'],
      'louvre museum': ['卢浮宫'],
      'sacré-cœur': ['圣心大教堂', '圣心堂'],
      'sacre-coeur': ['圣心大教堂', '圣心堂'],
      'arc de triomphe': ['凯旋门'],
      'notre-dame': ['巴黎圣母院', '圣母院'],
      'versailles': ['凡尔赛宫'],
      'palace of versailles': ['凡尔赛宫'],
      'montmartre': ['蒙马特'],
      'champs-élysées': ['香榭丽舍', '香榭丽舍大街'],
      'champs-elysees': ['香榭丽舍', '香榭丽舍大街'],
      'seine': ['塞纳河'],
      'seine river': ['塞纳河'],
      "musée d'orsay": ['奥赛博物馆'],
      'orsay museum': ['奥赛博物馆'],
      // 意大利
      'colosseum': ['罗马斗兽场', '斗兽场'],
      'vatican': ['梵蒂冈'],
      "st. peter's basilica": ['圣彼得大教堂'],
      'pantheon': ['万神殿'],
      'trevi fountain': ['特雷维喷泉', '许愿池'],
      'sistine chapel': ['西斯廷教堂'],
      'venice': ['威尼斯'],
      "st. mark's square": ['圣马可广场'],
      // 英国
      'big ben': ['大本钟'],
      'london eye': ['伦敦眼'],
      'buckingham palace': ['白金汉宫'],
      'tower bridge': ['塔桥'],
      'tower of london': ['伦敦塔'],
      'british museum': ['大英博物馆'],
      'westminster abbey': ['威斯敏斯特教堂'],
      // 西班牙
      'sagrada familia': ['圣家堂'],
      'casa batlló': ['巴特罗之家'],
      'casa batllo': ['巴特罗之家'],
      'casa milà': ['米拉之家'],
      'casa mila': ['米拉之家'],
      'park güell': ['古埃尔公园'],
      'park guell': ['古埃尔公园'],
      'la rambla': ['兰布拉大道'],
      // 美国
      'statue of liberty': ['自由女神像'],
      'times square': ['时代广场'],
      'central park': ['中央公园'],
      'empire state': ['帝国大厦'],
      'empire state building': ['帝国大厦'],
      'golden gate': ['金门大桥'],
      'golden gate bridge': ['金门大桥'],
      'hollywood': ['好莱坞'],
      'universal studios': ['环球影城'],
      'disneyland': ['迪士尼乐园', '迪士尼'],
      // 中国
      'forbidden city': ['故宫', '紫禁城'],
      'great wall': ['长城', '万里长城'],
      'tiananmen': ['天安门', '天安门广场'],
      'summer palace': ['颐和园'],
      'temple of heaven': ['天坛'],
      'the bund': ['外滩'],
      'oriental pearl': ['东方明珠'],
      'oriental pearl tower': ['东方明珠', '东方明珠塔'],
      'yu garden': ['豫园'],
      'west lake': ['西湖'],
      'terracotta army': ['兵马俑'],
    };

    // 精确匹配
    if (reverseDict.containsKey(nameLower)) {
      results.addAll(reverseDict[nameLower]!);
    }

    // 部分匹配
    for (final entry in reverseDict.entries) {
      if (nameLower.contains(entry.key) || entry.key.contains(nameLower)) {
        for (final cn in entry.value) {
          if (!results.contains(cn)) {
            results.add(cn);
          }
        }
      }
    }

    return results;
  }

  /// 本地中文到英文地点名翻译字典
  /// 包含常见的旅游景点名称翻译
  String? _translateChineseToEnglish(String chineseName) {
    // 常见日本景点
    const japanPlaces = {
      '浅草寺': 'Senso-ji Temple',
      '东京晴空塔': 'Tokyo Skytree',
      '东京塔': 'Tokyo Tower',
      '秋叶原': 'Akihabara',
      '上野公园': 'Ueno Park',
      '明治神宫': 'Meiji Shrine',
      '原宿': 'Harajuku',
      '原宿竹下通': 'Takeshita Street',
      '竹下通': 'Takeshita Street',
      '表参道': 'Omotesando',
      '涩谷': 'Shibuya',
      '涩谷十字路口': 'Shibuya Crossing',
      '涩谷路口': 'Shibuya Crossing',
      '新宿': 'Shinjuku',
      '银座': 'Ginza',
      '台场': 'Odaiba',
      '东京国立博物馆': 'Tokyo National Museum',
      '上野动物园': 'Ueno Zoo',
      '仲见世街': 'Nakamise Shopping Street',
      '仲见世': 'Nakamise Shopping Street',
      '皇居': 'Imperial Palace',
      '六本木': 'Roppongi',
      '六本木新城': 'Roppongi Hills',
      '森美术馆': 'Mori Art Museum',
      '代代木公园': 'Yoyogi Park',
      '筑地市场': 'Tsukiji Market',
      '�的场市场': 'Toyosu Market',
      '金阁寺': 'Kinkaku-ji',
      '伏见稻荷大社': 'Fushimi Inari Shrine',
      '清水寺': 'Kiyomizu-dera',
      '�的': 'Arashiyama',
      '大阪城': 'Osaka Castle',
      '道顿堀': 'Dotonbori',
      '心斋桥': 'Shinsaibashi',
      // 常见欧洲景点
      '埃菲尔铁塔': 'Eiffel Tower',
      '卢浮宫': 'Louvre Museum',
      '圣心大教堂': 'Sacré-Cœur',
      '凯旋门': 'Arc de Triomphe',
      '巴黎圣母院': 'Notre-Dame de Paris',
      '凡尔赛宫': 'Palace of Versailles',
      '蒙马特': 'Montmartre',
      '香榭丽舍大街': 'Champs-Élysées',
      '塞纳河': 'Seine River',
      '奥赛博物馆': 'Musée d\'Orsay',
      '罗马斗兽场': 'Colosseum',
      '梵蒂冈': 'Vatican',
      '圣彼得大教堂': 'St. Peter\'s Basilica',
      '万神殿': 'Pantheon',
      '特雷维喷泉': 'Trevi Fountain',
      '许愿池': 'Trevi Fountain',
      '西斯廷教堂': 'Sistine Chapel',
      '威尼斯': 'Venice',
      '圣马可广场': 'St. Mark\'s Square',
      '大本钟': 'Big Ben',
      '伦敦眼': 'London Eye',
      '白金汉宫': 'Buckingham Palace',
      '塔桥': 'Tower Bridge',
      '伦敦塔': 'Tower of London',
      '大英博物馆': 'British Museum',
      '威斯敏斯特教堂': 'Westminster Abbey',
      '圣家堂': 'Sagrada Familia',
      '巴特罗之家': 'Casa Batlló',
      '米拉之家': 'Casa Milà',
      '古埃尔公园': 'Park Güell',
      '兰布拉大道': 'La Rambla',
      // 常见美国景点
      '自由女神像': 'Statue of Liberty',
      '时代广场': 'Times Square',
      '中央公园': 'Central Park',
      '帝国大厦': 'Empire State Building',
      '金门大桥': 'Golden Gate Bridge',
      '好莱坞': 'Hollywood',
      '环球影城': 'Universal Studios',
      '迪士尼乐园': 'Disneyland',
      // 常见中国景点
      '故宫': 'Forbidden City',
      '长城': 'Great Wall',
      '天安门': 'Tiananmen Square',
      '颐和园': 'Summer Palace',
      '天坛': 'Temple of Heaven',
      '外滩': 'The Bund',
      '东方明珠': 'Oriental Pearl Tower',
      '豫园': 'Yu Garden',
      '西湖': 'West Lake',
      '兵马俑': 'Terracotta Army',
    };

    // 精确匹配
    if (japanPlaces.containsKey(chineseName)) {
      return japanPlaces[chineseName];
    }

    // 模糊匹配：检查是否包含关键词
    for (final entry in japanPlaces.entries) {
      if (chineseName.contains(entry.key) || entry.key.contains(chineseName)) {
        return entry.value;
      }
    }

    return null;
  }
}

/// 地点卡片 - 4:3比例，信息叠加在图片上
class _SpotCardOverlay extends ConsumerStatefulWidget {
  const _SpotCardOverlay({required this.spot});
  final Spot spot;
  @override
  ConsumerState<_SpotCardOverlay> createState() => _SpotCardOverlayState();
}

class _SpotCardOverlayState extends ConsumerState<_SpotCardOverlay> {
  bool _isInWishlist = false;
  String? _destinationId;

  @override
  void initState() {
    super.initState();
    _checkWishlistStatus();
  }

  void _checkWishlistStatus() {
    final statusAsync = ref.read(wishlistStatusProvider);
    statusAsync.whenData((statusMap) {
      final spotId = widget.spot.id;
      final (isInWishlist, destId) = checkWishlistStatus(statusMap, spotId);
      if (mounted &&
          (isInWishlist != _isInWishlist || destId != _destinationId)) {
        setState(() {
          _isInWishlist = isInWishlist;
          _destinationId = destId;
        });
      }
    });
  }

  Uint8List? _decodeBase64Image(String dataUri) {
    try {
      return base64Decode(dataUri.split(',').last);
    } catch (_) {
      return null;
    }
  }

  Widget _buildCoverImage(String imageUrl) {
    const placeholder = ColoredBox(
      color: AppTheme.lightGray,
      child: Center(
          child: Icon(Icons.image_not_supported,
              size: 48, color: AppTheme.mediumGray)),
    );
    if (imageUrl.isEmpty) return placeholder;
    if (imageUrl.startsWith('data:')) {
      final bytes = _decodeBase64Image(imageUrl);
      if (bytes != null)
        return Image.memory(bytes,
            fit: BoxFit.cover, errorBuilder: (_, __, ___) => placeholder);
      return placeholder;
    }
    return Image.network(imageUrl,
        fit: BoxFit.cover, errorBuilder: (_, __, ___) => placeholder);
  }

  Future<void> _handleWishlistTap() async {
    final spotId = widget.spot.id;

    if (_isInWishlist) {
      // 取消收藏
      setState(() => _isInWishlist = false);
      CustomToast.showSuccess(context, 'Removed from Wishlist');

      try {
        if (_destinationId != null) {
          await ref.read(tripRepositoryProvider).manageTripSpot(
                tripId: _destinationId!,
                spotId: spotId,
                remove: true,
              );
          ref.invalidate(wishlistStatusProvider);
        }
      } catch (e) {
        if (mounted) setState(() => _isInWishlist = true);
        CustomToast.showError(context, 'Failed to remove');
      }
    } else {
      // 添加收藏
      setState(() => _isInWishlist = true);
      CustomToast.showSuccess(context, 'Saved');

      try {
        final authed = await requireAuth(context, ref);
        if (!authed) {
          if (mounted) setState(() => _isInWishlist = false);
          return;
        }

        final cityName =
            (widget.spot.city.isNotEmpty) ? widget.spot.city : 'Saved Places';
        final destId = await ensureDestinationForCity(ref, cityName);
        if (destId == null) {
          if (mounted) setState(() => _isInWishlist = false);
          CustomToast.showError(context, 'Failed to save');
          return;
        }

        _destinationId = destId;
        await ref.read(tripRepositoryProvider).manageTripSpot(
          tripId: destId,
          spotId: spotId,
          status: TripSpotStatus.wishlist,
          spotPayload: {
            'name': widget.spot.name,
            'city': widget.spot.city,
            'latitude': widget.spot.latitude,
            'longitude': widget.spot.longitude,
            'coverImage': widget.spot.coverImage,
            'rating': widget.spot.rating,
            'ratingCount': widget.spot.ratingCount,
          },
        );
        ref.invalidate(wishlistStatusProvider);
      } catch (e) {
        if (mounted) setState(() => _isInWishlist = false);
        CustomToast.showError(context, 'Failed to save');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // 监听 wishlist 状态变化
    ref.listen<AsyncValue<Map<String, String?>>>(wishlistStatusProvider,
        (prev, next) {
      next.whenData((statusMap) {
        final spotId = widget.spot.id;
        final (isInWishlist, destId) = checkWishlistStatus(statusMap, spotId);
        if (mounted &&
            (isInWishlist != _isInWishlist || destId != _destinationId)) {
          setState(() {
            _isInWishlist = isInWishlist;
            _destinationId = destId;
          });
        }
      });
    });

    return GestureDetector(
      onTap: () async {
        final spotId = widget.spot.id;

        bool? initialIsSaved;
        bool? initialIsMustGo;
        bool? initialIsTodaysPlan;
        bool? initialIsVisited;
        DateTime? initialVisitDate;
        int? initialUserRating;
        String? initialUserNotes;
        List<String>? initialUserPhotos;
        String? initialDestinationId;

        try {
          final authState = ref.read(authProvider);
          if (authState.isAuthenticated) {
            // 显示loading indicator
            if (context.mounted) {
              showDialog<void>(
                context: context,
                barrierDismissible: false,
                builder: (context) => const Center(
                  child:
                      CircularProgressIndicator(color: AppTheme.primaryYellow),
                ),
              );
            }

            // 等待可能正在进行的收藏/取消收藏操作完成
            await WishlistStatusCache.awaitPendingOperation(spotId);
            if (widget.spot.name.isNotEmpty) {
              await WishlistStatusCache.awaitPendingOperation(widget.spot.name);
            }

            final tripRepo = ref.read(tripRepositoryProvider);
            final trips = await tripRepo.getMyTrips().timeout(
                  const Duration(seconds: 2),
                  onTimeout: () => <Trip>[],
                );

            for (final trip in trips) {
              // 优先使用 getMyTrips 已包含的 tripSpots，避免额外请求
              List<TripSpot> tripSpots = trip.tripSpots ?? [];
              if (tripSpots.isEmpty) {
                final tripDetail = await tripRepo.getTripById(trip.id);
                tripSpots = tripDetail.tripSpots ?? [];
              }

              for (final ts in tripSpots) {
                bool isMatch = false;
                if (ts.spot?.id == spotId) {
                  isMatch = true;
                } else if (ts.spot?.name == widget.spot.name &&
                    widget.spot.name.isNotEmpty) {
                  isMatch = true;
                } else if (ts.spot?.googlePlaceId != null &&
                    ts.spot?.googlePlaceId == spotId) {
                  isMatch = true;
                }

                if (isMatch) {
                  initialIsSaved = ts.isSaved == true;
                  initialIsMustGo = ts.isMustGo == true;
                  initialIsTodaysPlan = ts.isTodaysPlan == true;
                  initialIsVisited = ts.isVisited == true;
                  initialVisitDate = ts.visitDate;
                  initialUserRating = ts.userRating;
                  initialUserNotes = ts.userNotes;
                  initialUserPhotos = ts.userPhotos?.cast<String>();
                  initialDestinationId = trip.id;
                  break;
                }
              }
              if (initialDestinationId != null) break;
            }

            // 关闭loading dialog
            if (context.mounted && Navigator.canPop(context)) {
              Navigator.pop(context);
            }
          }
        } catch (e) {
          debugPrint('❌ [_PlaceCard] Error loading status: $e');
          // 关闭loading dialog
          if (context.mounted && Navigator.canPop(context)) {
            Navigator.pop(context);
          }
          // 回退到缓存
          final fullStatus = WishlistStatusCache.getFullStatus(spotId);
          initialIsSaved =
              fullStatus?.isSaved ?? fullStatus?.destinationId != null;
          initialIsMustGo = fullStatus?.isMustGo;
          initialIsTodaysPlan = fullStatus?.isTodaysPlan;
          initialIsVisited = fullStatus?.isVisited;
          initialVisitDate = fullStatus?.visitDate;
          initialUserRating = fullStatus?.userRating;
          initialUserNotes = fullStatus?.userNotes;
          initialUserPhotos = fullStatus?.userPhotos;
          initialDestinationId = fullStatus?.destinationId ?? _destinationId;
        }

        if (!context.mounted) return;

        showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          backgroundColor: Colors.transparent,
          builder: (context) => UnifiedSpotDetailModal(
            spot: widget.spot,
            keepOpenOnAction: true,
            initialIsSaved: initialIsSaved,
            initialIsMustGo: initialIsMustGo,
            initialIsTodaysPlan: initialIsTodaysPlan,
            initialIsVisited: initialIsVisited,
            initialVisitDate: initialVisitDate,
            initialUserRating: initialUserRating,
            initialUserNotes: initialUserNotes,
            initialUserPhotos: initialUserPhotos,
            initialDestinationId: initialDestinationId,
          ),
        );
      },
      child: AspectRatio(
        aspectRatio: 4 / 3,
        child: Container(
          constraints: const BoxConstraints(maxWidth: 300),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
            border:
                Border.all(color: AppTheme.black, width: AppTheme.borderMedium),
            boxShadow: AppTheme.cardShadow,
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppTheme.radiusMedium - 2),
            child: Stack(
              fit: StackFit.expand,
              clipBehavior: Clip.hardEdge,
              children: [
                _buildCoverImage(widget.spot.coverImage),
                Positioned.fill(
                  child: Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          Colors.black.withValues(alpha: 0.3),
                          Colors.black.withValues(alpha: 0.75)
                        ],
                        stops: const [0.35, 0.65, 1.0],
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: 12,
                  right: 12,
                  bottom: 10,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (widget.spot.tags.isNotEmpty)
                        Wrap(
                          spacing: 4,
                          runSpacing: 4,
                          children: widget.spot.tags
                              .take(2)
                              .map(
                                (tag) => Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: AppTheme.primaryYellow,
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    tag,
                                    style: AppTheme.bodySmall(context).copyWith(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w600,
                                      color: AppTheme.black,
                                    ),
                                  ),
                                ),
                              )
                              .toList(),
                        ),
                      const SizedBox(height: 6),
                      Text(
                        widget.spot.name,
                        style: AppTheme.labelLarge(context).copyWith(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.bold),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      // 只有真正从 AI 来源的地点才显示 "AI Recommended"
                      // 数据库缓存的地点即使没有评分也不应该显示 AI 标签
                      if (widget.spot.isAIOnly)
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.auto_awesome,
                                size: 12, color: AppTheme.primaryYellow),
                            const SizedBox(width: 4),
                            Flexible(
                              child: Text(
                                widget.spot.recommendationPhrase ??
                                    'AI Recommended',
                                style: AppTheme.bodySmall(context).copyWith(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 12),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        )
                      else if (widget.spot.hasRating)
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.star,
                                size: 14, color: AppTheme.primaryYellow),
                            const SizedBox(width: 4),
                            Text(
                              widget.spot.rating.toStringAsFixed(1),
                              style: AppTheme.bodySmall(context).copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 12),
                            ),
                            const SizedBox(width: 4),
                            Text(
                              formatRatingCount(widget.spot.ratingCount),
                              style: AppTheme.bodySmall(context).copyWith(
                                  color: Colors.white.withValues(alpha: 0.8),
                                  fontSize: 11),
                            ),
                          ],
                        ),
                    ],
                  ),
                ),
                // 收藏按钮 - 使用正确的样式
                Positioned(
                  top: 12,
                  right: 12,
                  child: GestureDetector(
                    onTap: _handleWishlistTap,
                    child: Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: _isInWishlist
                            ? AppTheme.primaryYellow
                            : Colors.white,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppTheme.black, width: 2),
                        boxShadow: const [
                          BoxShadow(
                            color: AppTheme.black,
                            offset: Offset(0, 1),
                            blurRadius: 0,
                          ),
                        ],
                      ),
                      child: Icon(
                        _isInWishlist ? Icons.favorite : Icons.favorite_border,
                        size: 18,
                        color: _isInWishlist
                            ? const Color(0xFFFF6264)
                            : AppTheme.black,
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

/// 地点详情加载器 - 从后端获取完整数据后显示详情
class _PlaceDetailLoader extends ConsumerStatefulWidget {
  const _PlaceDetailLoader({
    required this.placeId,
    required this.fallbackPlace,
    required this.placeResultToSpot,
  });

  final String placeId;
  final PlaceResult fallbackPlace;
  final Spot Function(PlaceResult) placeResultToSpot;

  @override
  ConsumerState<_PlaceDetailLoader> createState() => _PlaceDetailLoaderState();
}

class _PlaceDetailLoaderState extends ConsumerState<_PlaceDetailLoader> {
  bool _isLoading = true;
  Spot? _spot;
  String? _error;

  // Linked collection (preloaded)
  Map<String, dynamic>? _linkedCollection;

  // User status fields
  bool? _initialIsSaved;
  bool? _initialIsMustGo;
  bool? _initialIsTodaysPlan;
  bool? _initialIsVisited;
  DateTime? _initialVisitDate;
  int? _initialUserRating;
  String? _initialUserNotes;
  List<String>? _initialUserPhotos;
  String? _initialDestinationId;

  @override
  void initState() {
    super.initState();
    _fetchPlaceDetails();
  }

  Future<void> _fetchPlaceDetails() async {
    try {
      Spot? tempSpot;

      // AI 生成的 placeId（ai_xxx）不是数据库 UUID，直接用 fallback 数据展示。
      if (widget.placeId.startsWith('ai_')) {
        tempSpot = widget.placeResultToSpot(widget.fallbackPlace);
      } else {
        final dio = Dio();
        final apiBaseUrl =
            dotenv.env['API_BASE_URL'] ?? 'http://localhost:3000/api';

        final response = await dio.get<Map<String, dynamic>>(
          '$apiBaseUrl/spots/${widget.placeId}',
          options: Options(
            sendTimeout: const Duration(seconds: 10),
            receiveTimeout: const Duration(seconds: 10),
          ),
        );

        final data = response.data;
        if (data != null) {
          // 将后端返回的数据转换为 PlaceResult
          final enrichedPlace = widget.fallbackPlace.copyWith(
            address: data['address'] as String?,
            phoneNumber: data['phoneNumber'] as String?,
            website: data['website'] as String?,
            openingHours: data['openingHours'] is String
                ? data['openingHours'] as String
                : data['openingHours'] != null
                    ? jsonEncode(data['openingHours'])
                    : null,
            customFields: data['customFields'] as Map<String, dynamic>?,
          );

          tempSpot = widget.placeResultToSpot(enrichedPlace);
        } else {
          tempSpot = widget.placeResultToSpot(widget.fallbackPlace);
        }
      }

      // 加载用户状态数据
      try {
        final authState = ref.read(authProvider);
        if (authState.isAuthenticated) {
          final tripRepo = ref.read(tripRepositoryProvider);
          final trips = await tripRepo.getMyTrips().timeout(
                const Duration(seconds: 2),
                onTimeout: () => <Trip>[],
              );

          for (final trip in trips) {
            // 优先使用 getMyTrips 已包含的 tripSpots，避免额外请求
            List<TripSpot> tripSpots = trip.tripSpots ?? [];
            if (tripSpots.isEmpty) {
              final tripDetail = await tripRepo.getTripById(trip.id);
              tripSpots = tripDetail.tripSpots ?? [];
            }

            for (final ts in tripSpots) {
              bool isMatch = false;
              if (ts.spot?.id == tempSpot.id) {
                isMatch = true;
              } else if (ts.spot?.name == tempSpot.name &&
                  tempSpot.name.isNotEmpty) {
                isMatch = true;
              } else if (ts.spot?.googlePlaceId != null &&
                  ts.spot?.googlePlaceId == tempSpot.id) {
                isMatch = true;
              }

              if (isMatch) {
                _initialIsSaved = ts.isSaved == true;
                _initialIsMustGo = ts.isMustGo == true;
                _initialIsTodaysPlan = ts.isTodaysPlan == true;
                _initialIsVisited = ts.isVisited == true;
                _initialVisitDate = ts.visitDate;
                _initialUserRating = ts.userRating;
                _initialUserNotes = ts.userNotes;
                _initialUserPhotos = ts.userPhotos?.cast<String>();
                _initialDestinationId = trip.id;
                break;
              }
            }
            if (_initialDestinationId != null) break;
          }

          // 💾 保存到缓存供后续使用
          WishlistStatusCache.updateFullStatus(
            tempSpot.id,
            destinationId: _initialDestinationId,
            isSaved: _initialIsSaved ?? false,
            isMustGo: _initialIsMustGo,
            isTodaysPlan: _initialIsTodaysPlan,
            isVisited: _initialIsVisited,
            visitDate: _initialVisitDate,
            userRating: _initialUserRating,
            userNotes: _initialUserNotes,
            userPhotos: _initialUserPhotos,
          );
        }
      } catch (e) {
        debugPrint('❌ [PlaceDetailLoader] Error loading user status: $e');
        // 回退到缓存
        final fullStatus = WishlistStatusCache.getFullStatus(tempSpot.id);
        _initialIsSaved =
            fullStatus?.isSaved ?? fullStatus?.destinationId != null;
        _initialIsMustGo = fullStatus?.isMustGo;
        _initialIsTodaysPlan = fullStatus?.isTodaysPlan;
        _initialIsVisited = fullStatus?.isVisited;
        _initialVisitDate = fullStatus?.visitDate;
        _initialUserRating = fullStatus?.userRating;
        _initialUserNotes = fullStatus?.userNotes;
        _initialUserPhotos = fullStatus?.userPhotos;
        _initialDestinationId = fullStatus?.destinationId;
      }

      // 加载关联的合集数据（预加载，避免详情页闪现）
      try {
        final uuidRegex = RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
          caseSensitive: false,
        );
        if (uuidRegex.hasMatch(tempSpot.id)) {
          final collectionRepo = ref.read(collectionRepositoryProvider);
          final collections = await collectionRepo
              .getCollectionsForPlace(tempSpot.id)
              .timeout(const Duration(milliseconds: 1200), onTimeout: () => <Map<String, dynamic>>[]);
          if (collections.isNotEmpty) {
            final random = math.Random();
            _linkedCollection = collections[random.nextInt(collections.length)];
          }
        }
      } catch (e) {
        debugPrint('⚠️ [PlaceDetailLoader] Error loading linked collection: $e');
      }

      if (!mounted) return;

      setState(() {
        _spot = tempSpot;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint('❌ [PlaceDetailLoader] Error fetching place: $e');
      if (!mounted) return;

      // 使用 fallback 数据
      setState(() {
        _spot = widget.placeResultToSpot(widget.fallbackPlace);
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Container(
        height: MediaQuery.of(context).size.height * 0.7,
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: const Center(
          child: CircularProgressIndicator(
            valueColor: AlwaysStoppedAnimation<Color>(AppTheme.primaryYellow),
          ),
        ),
      );
    }

    if (_spot == null) {
      return Container(
        height: 200,
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Center(
          child: Text(
            _error ?? 'Failed to load place details',
            style: AppTheme.bodyMedium(context)
                .copyWith(color: AppTheme.mediumGray),
          ),
        ),
      );
    }

    return UnifiedSpotDetailModal(
      spot: _spot!,
      keepOpenOnAction: true,
      linkedCollection: _linkedCollection,
      initialIsSaved: _initialIsSaved,
      initialIsMustGo: _initialIsMustGo,
      initialIsTodaysPlan: _initialIsTodaysPlan,
      initialIsVisited: _initialIsVisited,
      initialVisitDate: _initialVisitDate,
      initialUserRating: _initialUserRating,
      initialUserNotes: _initialUserNotes,
      initialUserPhotos: _initialUserPhotos,
      initialDestinationId: _initialDestinationId,
    );
  }
}

/// 智能地点名称匹配 - 处理各种命名差异
/// 例如："MAXXI Museum" 应该匹配 "MAXXI - National Museum of 21st Century Arts"
/// 例如："Sagrada Família" 应该匹配 "Basílica de la Sagrada Família"
/// 匹配更严格：避免短名称误匹配（如"哥特区"不应匹配任何地点）
bool _matchPlaceName(String searchName, String dbName) {
  final searchLower = searchName.toLowerCase().trim();
  final dbLower = dbName.toLowerCase().trim();

  // 1. 完全匹配
  if (searchLower == dbLower) return true;

  // 2. 包含匹配（双向）- 但要求搜索名长度至少为4个字符（中文2个字），避免短名误匹配
  final minSearchLength =
      RegExp(r'[\u4e00-\u9fff]').hasMatch(searchName) ? 4 : 6;
  if (searchLower.length >= minSearchLength) {
    if (searchLower.contains(dbLower) || dbLower.contains(searchLower)) {
      return true;
    }
  }

  // 2b. 🆕 移除常见前缀后的包含匹配
  // 处理如 "Sagrada Família" vs "Basílica de la Sagrada Família" 的情况
  final commonPrefixes = [
    'basílica de la ',
    'basilica de la ',
    'basilica of ',
    'cathedral of ',
    'church of ',
    'temple of ',
    'palace of ',
    'museum of ',
    'castle of ',
    'tower of ',
    'plaza de ',
    'plaza del ',
    'piazza ',
    'piazza del ',
    'piazza della ',
    'parque ',
    'park ',
    'jardín ',
    'jardin ',
    'fontana di ',
    'fontana della ',
    'ponte ',
    'puente ',
    'the ',
    'el ',
    'la ',
    'los ',
    'las ',
    'il ',
    'lo ',
    'le ',
    'les ',
    'der ',
    'die ',
    'das ',
  ];

  // 移除数据库名称中的常见前缀
  var dbLowerStripped = dbLower;
  for (final prefix in commonPrefixes) {
    if (dbLowerStripped.startsWith(prefix)) {
      dbLowerStripped = dbLowerStripped.substring(prefix.length).trim();
      break; // 只移除一个前缀
    }
  }

  // 移除搜索名称中的常见前缀
  var searchLowerStripped = searchLower;
  for (final prefix in commonPrefixes) {
    if (searchLowerStripped.startsWith(prefix)) {
      searchLowerStripped = searchLowerStripped.substring(prefix.length).trim();
      break;
    }
  }

  // 使用去除前缀后的名称再次尝试匹配
  if (searchLowerStripped.length >= 6 && dbLowerStripped.length >= 6) {
    if (searchLowerStripped == dbLowerStripped) return true;
    if (searchLowerStripped.contains(dbLowerStripped) ||
        dbLowerStripped.contains(searchLowerStripped)) {
      return true;
    }
  }

  // 3. 提取核心词匹配（第一个有意义的词，忽略 "the", "a", "an" 等）
  final stopWords = {
    'the',
    'a',
    'an',
    'of',
    'and',
    'in',
    'at',
    'to',
    'for',
    'de',
    'la',
    'del',
    'el',
    'los',
    'las',
    'di',
    'il',
    'le',
    'les',
  };
  List<String> getSignificantWords(String name) {
    return name
        .replaceAll(RegExp(r'[^\w\s\u00C0-\u017F]'), ' ') // 保留带重音的字母
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty && w.length > 2 && !stopWords.contains(w))
        .toList();
  }

  final searchWords = getSignificantWords(searchLower);
  final dbWords = getSignificantWords(dbLower);

  if (searchWords.isEmpty || dbWords.isEmpty) return false;

  // 3a. 第一个有意义的词完全匹配（如 "maxxi" == "maxxi"）
  // 要求词长度至少为4个字符
  if (searchWords.first.length >= 4 && searchWords.first == dbWords.first) {
    return true;
  }

  // 3b. 第一个词包含匹配 - 要求被包含的词长度至少为5个字符
  if (searchWords.first.length >= 5 && dbWords.first.length >= 5) {
    if (searchWords.first.contains(dbWords.first) ||
        dbWords.first.contains(searchWords.first)) {
      return true;
    }
  }

  // 4. 多词交集匹配（至少有2个相同的有意义词，且每个词长度>=4）
  final significantSearchWords =
      searchWords.where((w) => w.length >= 4).toSet();
  final significantDbWords = dbWords.where((w) => w.length >= 4).toSet();
  final commonWords = significantSearchWords.intersection(significantDbWords);
  if (commonWords.length >= 2) return true;

  // 4b. 🆕 针对带重音字符的特殊匹配
  // 如 "sagrada família" 应匹配 "sagrada família" 或 "sagrada familia"
  // 将搜索词和数据库词标准化（移除重音），再检查交集
  String removeAccents(String s) {
    const accentsMap = {
      'á': 'a',
      'à': 'a',
      'ã': 'a',
      'â': 'a',
      'ä': 'a',
      'é': 'e',
      'è': 'e',
      'ê': 'e',
      'ë': 'e',
      'í': 'i',
      'ì': 'i',
      'î': 'i',
      'ï': 'i',
      'ó': 'o',
      'ò': 'o',
      'õ': 'o',
      'ô': 'o',
      'ö': 'o',
      'ú': 'u',
      'ù': 'u',
      'û': 'u',
      'ü': 'u',
      'ñ': 'n',
      'ç': 'c',
    };
    var result = s;
    for (final entry in accentsMap.entries) {
      result = result.replaceAll(entry.key, entry.value);
    }
    return result;
  }

  final searchWordsNormalized = searchWords
      .map((w) => removeAccents(w))
      .where((w) => w.length >= 4)
      .toSet();
  final dbWordsNormalized =
      dbWords.map((w) => removeAccents(w)).where((w) => w.length >= 4).toSet();
  final commonWordsNormalized =
      searchWordsNormalized.intersection(dbWordsNormalized);
  if (commonWordsNormalized.length >= 2) return true;

  // 5. 缩写匹配（如 "maxxi" 匹配开头）- 要求长度至少为5
  if (searchWords.first.length >= 5 && dbWords.first.length >= 5) {
    if (dbLower.startsWith(searchWords.first) ||
        searchLower.startsWith(dbWords.first)) {
      return true;
    }
  }

  return false;
}

/// 过滤标签，只保留英文标签（排除中文字符）
List<String> _filterEnglishTags(List<String>? tags) {
  if (tags == null || tags.isEmpty) return [];

  // 匹配中文字符的正则表达式
  final chineseRegex = RegExp(r'[\u4e00-\u9fff]');

  return tags
      .where((tag) => tag.isNotEmpty && !chineseRegex.hasMatch(tag))
      .toList();
}

/// 使用 nameMapping 查找地点
/// 首先尝试通过 nameMapping 将显示名称映射到英文名称，然后在 places 中查找
/// 如果 nameMapping 为空或找不到映射，则回退到直接匹配
/// 🆕 要求匹配的地点必须有封面图（coverUrl），否则不视为有效匹配
PlaceResult? _findPlaceWithMapping(
  String searchName,
  List<PlaceResult>? places,
  List<PlaceNameMapping>? nameMapping,
) {
  if (places == null || places.isEmpty) return null;

  final searchLower = searchName.toLowerCase().trim();

  // 🆕 首先尝试通过 nameMapping 查找英文名称
  String? englishNameToSearch;
  if (nameMapping != null && nameMapping.isNotEmpty) {
    for (final mapping in nameMapping) {
      final displayLower = mapping.displayName.toLowerCase().trim();
      if (displayLower == searchLower ||
          displayLower.contains(searchLower) ||
          searchLower.contains(displayLower)) {
        englishNameToSearch = mapping.englishName;
        debugPrint(
            '🗺️ _findPlaceWithMapping: Found mapping "$searchName" -> "${mapping.englishName}"');
        break;
      }
    }
  }

  // 如果找到映射，优先使用英文名称匹配
  if (englishNameToSearch != null) {
    for (final place in places) {
      if (_matchPlaceName(englishNameToSearch, place.name)) {
        // 🆕 检查是否有封面图
        if (place.coverImage.isEmpty) {
          debugPrint(
              '🗺️ _findPlaceWithMapping: Skipping "${place.name}" - no cover image');
          continue;
        }
        debugPrint(
            '🗺️ _findPlaceWithMapping: Matched via mapping to "${place.name}"');
        return place;
      }
    }
  }

  // 回退：直接尝试用原始搜索名称匹配
  for (final place in places) {
    if (_matchPlaceName(searchName, place.name)) {
      // 🆕 检查是否有封面图
      if (place.coverImage.isEmpty) {
        debugPrint(
            '🗺️ _findPlaceWithMapping: Skipping "${place.name}" - no cover image');
        continue;
      }
      debugPrint(
          '🗺️ _findPlaceWithMapping: Matched directly "$searchName" to "${place.name}"');
      return place;
    }
  }

  return null;
}

/// 富文本匹配结果辅助类
class _RichTextMatch {
  _RichTextMatch({
    required this.start,
    required this.end,
    required this.type,
    required this.text,
    this.url,
    this.place,
  });
  final int start;
  final int end;
  final String type; // 'bold', 'link', or 'place_link'
  final String text;
  final String? url;
  final PlaceResult? place; // 用于 place_link 类型
}

class _ItineraryDay {
  _ItineraryDay({
    required this.title,
    required this.subtitle,
  });

  final String title;
  final String subtitle;
  final List<_ItinerarySlot> slots = [];
  final List<String> notes = [];
}

class _ItinerarySlot {
  _ItinerarySlot({required this.label});

  final String label;
  final List<String> items = [];
}

/// 解析后的地点条目（包含标题、描述、元数据）
class _ParsedPlaceEntry {
  _ParsedPlaceEntry({
    required this.title,
    this.description,
    this.time,
    this.address,
    this.website,
  });

  final String title;
  final String? description;
  final String? time;
  final String? address;
  final String? website;
}

class _ItineraryMarkdownEntry {
  _ItineraryMarkdownEntry({required this.title, required this.description});

  final String title;
  final String description;
}

/// 解析地点条目文本，提取标题、描述和元数据
_ParsedPlaceEntry _parseSlotItem(String text) {
  // 尝试匹配标题行（通常是第一行，可能带 ** 加粗）
  String remaining = text.trim();

  // 提取标题（第一行或 **加粗** 的内容）
  String title = '';
  String? description;

  // 先尝试匹配 **title** 格式
  final boldTitleMatch = RegExp(r'^\*\*([^*]+)\*\*').firstMatch(remaining);
  if (boldTitleMatch != null) {
    title = boldTitleMatch.group(1)!.trim();
    remaining = remaining.substring(boldTitleMatch.end).trim();
  } else {
    // 按换行或句号分割，第一部分作为标题
    final firstLineEnd = remaining.indexOf('\n');
    if (firstLineEnd > 0) {
      title = remaining.substring(0, firstLineEnd).trim();
      remaining = remaining.substring(firstLineEnd + 1).trim();
    } else {
      // 没有换行，尝试按 "。" 分割（中文句号后可能是描述）
      // 但如果包含 "时间:" 或 "地址:" 则不分割
      if (!remaining.contains('时间:') && !remaining.contains('地址:')) {
        final periodEnd = remaining.indexOf('。');
        if (periodEnd > 0 && periodEnd < 30) {
          // 短标题
          title = remaining.substring(0, periodEnd + 1).trim();
          remaining = remaining.substring(periodEnd + 1).trim();
        } else {
          title = remaining;
          remaining = '';
        }
      } else {
        // 包含元数据，需要更复杂的解析
        title = remaining;
        remaining = '';
      }
    }
  }

  // 从 remaining 或 title 中提取元数据
  String textToParse = remaining.isNotEmpty ? remaining : title;

  // 提取时间 (时间: xxx)
  String? time;
  final timeMatch = RegExp(r'时间[:：]\s*([^地网官]+?)(?=\s*(?:地址|网站|官方|$))')
      .firstMatch(textToParse);
  if (timeMatch != null) {
    time = timeMatch.group(1)?.trim();
  }

  // 提取地址 (地址: xxx)
  String? address;
  final addressMatch = RegExp(r'地址[:：]\s*([^网官时]+?)(?=\s*(?:网站|官方|时间|$))')
      .firstMatch(textToParse);
  if (addressMatch != null) {
    address = addressMatch.group(1)?.trim();
  }

  // 提取网站 (网站: xxx 或 官方 网站: xxx 或 官网: xxx)
  String? website;
  final websiteMatch =
      RegExp(r'(?:官方\s*)?(?:网站|官网)[:：]\s*(\S+)').firstMatch(textToParse);
  if (websiteMatch != null) {
    website = websiteMatch.group(1)?.trim();
  }

  // 如果 title 包含元数据，需要清理
  if (title.contains('时间:') || title.contains('地址:') || title.contains('网站:')) {
    // 从 title 中提取纯标题部分
    final metaStart =
        title.indexOf(RegExp(r'时间[:：]|地址[:：]|(?:官方\s*)?(?:网站|官网)[:：]'));
    if (metaStart > 0) {
      final cleanTitle = title.substring(0, metaStart).trim();
      final descEnd = cleanTitle.lastIndexOf('。');
      if (descEnd > 0 && descEnd < cleanTitle.length - 1) {
        title = cleanTitle.substring(0, descEnd + 1);
        description = cleanTitle.substring(descEnd + 1).trim();
      } else {
        // 尝试按句号分割
        final parts = cleanTitle.split('。');
        if (parts.length >= 2) {
          title = parts[0].trim();
          description = parts.sublist(1).join('。').trim();
          if (description.isEmpty) description = null;
        } else {
          title = cleanTitle;
        }
      }
    }
  } else if (remaining.isNotEmpty &&
      !remaining.contains('时间:') &&
      !remaining.contains('地址:')) {
    description = remaining;
  }

  if ((description == null || description.isEmpty) && title.isNotEmpty) {
    final periodIndex = title.indexOf('。');
    if (periodIndex > 0 && periodIndex < title.length - 1) {
      description = title.substring(periodIndex + 1).trim();
      title = title.substring(0, periodIndex + 1).trim();
    } else {
      final dotIndex = title.indexOf('. ');
      if (dotIndex > 0 && dotIndex < title.length - 2) {
        description = title.substring(dotIndex + 2).trim();
        title = title.substring(0, dotIndex + 1).trim();
      }
    }
  }

  return _ParsedPlaceEntry(
    title: title,
    description: description,
    time: time,
    address: address,
    website: website,
  );
}

/// 大尺寸地点卡片 - 用于单个地点展示
/// 比普通卡片更大，占满宽度，比例为 4:3
class _LargePlaceCard extends ConsumerStatefulWidget {
  const _LargePlaceCard({
    required this.place,
    this.onTap,
  });

  final PlaceResult place;
  final VoidCallback? onTap;

  @override
  ConsumerState<_LargePlaceCard> createState() => _LargePlaceCardState();
}

class _LargePlaceCardState extends ConsumerState<_LargePlaceCard> {
  bool _isInWishlist = false;
  bool _isSaving = false;
  String? _destinationId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _syncWishlistStatus();
    });
  }

  void _syncWishlistStatus() {
    final statusAsync = ref.read(wishlistStatusProvider);
    statusAsync.whenData((statusMap) {
      final spotId = widget.place.id ?? widget.place.name;
      final (isInWishlist, destId) = checkWishlistStatus(statusMap, spotId);
      if (mounted &&
          (isInWishlist != _isInWishlist || destId != _destinationId)) {
        setState(() {
          _isInWishlist = isInWishlist;
          _destinationId = destId;
        });
      }
    });
  }

  Future<void> _handleWishlistTap() async {
    if (_isSaving) return;

    final auth = ref.read(authProvider);
    if (!auth.isAuthenticated) {
      final authed = await requireAuth(context, ref);
      if (!authed) return;
    }

    setState(() => _isSaving = true);

    try {
      if (_isInWishlist && _destinationId != null) {
        await ref.read(tripRepositoryProvider).manageTripSpot(
              tripId: _destinationId!,
              spotId: widget.place.id ?? widget.place.name,
              remove: true,
            );
        ref.invalidate(tripsProvider);
        ref.invalidate(wishlistStatusProvider);
        setState(() {
          _isInWishlist = false;
          _destinationId = null;
        });
        CustomToast.showSuccess(context, 'Removed from wishlist');
      } else {
        final cityName = widget.place.city?.isNotEmpty ?? false
            ? widget.place.city!
            : (widget.place.country?.isNotEmpty ?? false
                ? widget.place.country!
                : 'Saved Places');

        final destId = await ensureDestinationForCity(ref, cityName);
        if (destId == null) {
          CustomToast.showError(context, 'Failed to save - please try again');
          return;
        }

        final effectiveTags =
            widget.place.displayTagsEn ?? widget.place.tags ?? [];

        await ref.read(tripRepositoryProvider).manageTripSpot(
          tripId: destId,
          spotId: widget.place.id ?? widget.place.name,
          status: TripSpotStatus.wishlist,
          spotPayload: {
            'name': widget.place.name,
            'city': widget.place.city ?? '',
            'country': widget.place.country ?? '',
            'latitude': widget.place.latitude,
            'longitude': widget.place.longitude,
            'rating': widget.place.rating,
            'ratingCount': widget.place.ratingCount,
            'tags': effectiveTags,
            'coverImage': widget.place.coverImage,
            'images': [widget.place.coverImage],
            'googlePlaceId': widget.place.googlePlaceId,
            'source': widget.place.source.name,
          },
        );

        ref.invalidate(tripsProvider);
        ref.invalidate(wishlistStatusProvider);
        setState(() {
          _isInWishlist = true;
          _destinationId = destId;
        });
        CustomToast.showSuccess(context, 'Saved to wishlist');
      }
    } catch (e) {
      debugPrint('❌ [_LargePlaceCard] Wishlist error: $e');
      CustomToast.showError(context, 'Error saving - please try again');
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // 监听收藏状态变化
    ref.listen<AsyncValue<Map<String, String?>>>(wishlistStatusProvider,
        (previous, next) {
      next.whenData((statusMap) {
        final spotId = widget.place.id ?? widget.place.name;
        final (isInWishlist, destId) = checkWishlistStatus(statusMap, spotId);
        if (mounted &&
            (isInWishlist != _isInWishlist || destId != _destinationId)) {
          setState(() {
            _isInWishlist = isInWishlist;
            _destinationId = destId;
          });
        }
      });
    });

    final displayTags = widget.place.displayTagsEn ?? widget.place.tags ?? [];
    // 过滤掉中文标签，只保留英文
    final englishOnlyTags = _filterEnglishTags(displayTags);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 3:2 卡片 - 和平铺一样的比例
        GestureDetector(
          onTap: widget.onTap,
          child: AspectRatio(
            aspectRatio: 3 / 2,
            child: Container(
              width: double.infinity,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                border: Border.all(
                    color: AppTheme.black, width: AppTheme.borderMedium),
                boxShadow: AppTheme.cardShadow,
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(AppTheme.radiusMedium - 2),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    // 封面图片
                    if (widget.place.coverImage.isNotEmpty)
                      Image.network(
                        widget.place.coverImage,
                        fit: BoxFit.cover,
                        loadingBuilder: (context, child, loadingProgress) {
                          if (loadingProgress == null) return child;
                          return const ColoredBox(
                            color: AppTheme.lightGray,
                            child: Center(
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(
                                    AppTheme.primaryYellow),
                              ),
                            ),
                          );
                        },
                        errorBuilder: (_, __, ___) => const ColoredBox(
                          color: AppTheme.lightGray,
                          child: Center(
                            child: Icon(Icons.image_not_supported,
                                size: 48, color: AppTheme.mediumGray),
                          ),
                        ),
                      )
                    else
                      const ColoredBox(
                        color: AppTheme.lightGray,
                        child: Center(
                          child: Icon(Icons.place,
                              size: 48, color: AppTheme.mediumGray),
                        ),
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
                              Colors.black.withOpacity(0.3),
                              Colors.black.withOpacity(0.75),
                            ],
                            stops: const [0.4, 0.7, 1.0],
                          ),
                        ),
                      ),
                    ),
                    // 右上角收藏按钮
                    Positioned(
                      top: 12,
                      right: 12,
                      child: GestureDetector(
                        onTap: _handleWishlistTap,
                        child: Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: _isInWishlist
                                ? AppTheme.primaryYellow
                                : Colors.white,
                            shape: BoxShape.circle,
                            border: Border.all(color: AppTheme.black, width: 2),
                            boxShadow: const [
                              BoxShadow(
                                color: AppTheme.black,
                                offset: Offset(0, 1),
                                blurRadius: 0,
                              ),
                            ],
                          ),
                          child: _isSaving
                              ? const Padding(
                                  padding: EdgeInsets.all(8),
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    valueColor: AlwaysStoppedAnimation<Color>(
                                        AppTheme.black),
                                  ),
                                )
                              : Icon(
                                  _isInWishlist
                                      ? Icons.favorite
                                      : Icons.favorite_border,
                                  size: 20,
                                  color: _isInWishlist
                                      ? const Color(0xFFFF6264)
                                      : AppTheme.black,
                                ),
                        ),
                      ),
                    ),
                    // 底部信息
                    Positioned(
                      left: 16,
                      right: 16,
                      bottom: 16,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // 标签 - 只显示英文标签
                          if (englishOnlyTags.isNotEmpty)
                            Wrap(
                              spacing: 6,
                              runSpacing: 4,
                              children: englishOnlyTags
                                  .take(2)
                                  .map((tag) => Container(
                                        padding: const EdgeInsets.symmetric(
                                            horizontal: 8, vertical: 3),
                                        decoration: BoxDecoration(
                                          color: AppTheme.primaryYellow,
                                          borderRadius:
                                              BorderRadius.circular(4),
                                        ),
                                        child: Text(
                                          tag,
                                          style: AppTheme.bodySmall(context)
                                              .copyWith(
                                            fontSize: 11,
                                            fontWeight: FontWeight.w600,
                                            color: AppTheme.black,
                                          ),
                                        ),
                                      ))
                                  .toList(),
                            ),
                          const SizedBox(height: 8),
                          // 地点名称 - 更大字号
                          Text(
                            widget.place.name,
                            style: AppTheme.headlineMedium(context).copyWith(
                              color: Colors.white,
                              fontSize: 22,
                              fontWeight: FontWeight.bold,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 6),
                          // 评分或推荐短语
                          // 只有真正从 AI 来源的地点才显示 "AI Recommended"
                          if (widget.place.isAIOnly)
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.auto_awesome,
                                    size: 16, color: AppTheme.primaryYellow),
                                const SizedBox(width: 6),
                                Text(
                                  widget.place.recommendationPhrase ??
                                      'AI Recommended',
                                  style: AppTheme.bodyMedium(context).copyWith(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 14,
                                  ),
                                ),
                              ],
                            )
                          else if (widget.place.hasRating)
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.star,
                                    size: 16, color: AppTheme.primaryYellow),
                                const SizedBox(width: 6),
                                Text(
                                  widget.place.rating!.toStringAsFixed(1),
                                  style: AppTheme.bodyMedium(context).copyWith(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 14,
                                  ),
                                ),
                                if (widget.place.ratingCount != null) ...[
                                  const SizedBox(width: 6),
                                  Text(
                                    formatRatingCount(widget.place.ratingCount),
                                    style:
                                        AppTheme.bodyMedium(context).copyWith(
                                      color: Colors.white.withOpacity(0.8),
                                      fontSize: 13,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        // 卡片下方的丰富信息
        const SizedBox(height: 12),
        // 标签展示（更多标签）- 只显示英文标签
        if (englishOnlyTags.length > 2) ...[
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: englishOnlyTags
                .skip(2)
                .take(4)
                .map((tag) => Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppTheme.lightGray,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        tag,
                        style: AppTheme.bodySmall(context).copyWith(
                          fontSize: 12,
                          color: AppTheme.darkGray,
                        ),
                      ),
                    ))
                .toList(),
          ),
        ],
      ],
    );
  }

  /// 格式化评论数量
  // ignore: unused_element
  String _formatRatingCount(int count) {
    if (count >= 1000000) {
      return '${(count / 1000000).toStringAsFixed(1)}M';
    } else if (count >= 1000) {
      return '${(count / 1000).toStringAsFixed(1)}K';
    }
    return count.toString();
  }
}

/// AI 消息渐显动画包装器
/// 新消息会触发分块淡入动画效果，模拟逐步输出
class _AnimatedAIMessage extends StatefulWidget {
  const _AnimatedAIMessage({
    super.key,
    required this.message,
    required this.builder,
  });

  final _ChatMessage message;
  final Widget Function(_ChatMessage) builder;

  @override
  State<_AnimatedAIMessage> createState() => _AnimatedAIMessageState();
}

class _AnimatedAIMessageState extends State<_AnimatedAIMessage>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  bool _showContent = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 800),
      vsync: this,
    );

    // 如果是新消息，延迟显示内容；否则直接显示
    if (widget.message.isNew) {
      // 短暂延迟后开始显示
      Future.delayed(const Duration(milliseconds: 100), () {
        if (mounted) {
          setState(() => _showContent = true);
          _controller.forward().then((_) {
            widget.message.isNew = false;
          });
        }
      });
    } else {
      _showContent = true;
      _controller.value = 1.0;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_showContent) {
      // 显示打字指示器
      return const _TypingIndicator();
    }

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Opacity(
          opacity: _controller.value,
          child: Transform.translate(
            offset: Offset(0, 20 * (1 - _controller.value)),
            child: child,
          ),
        );
      },
      child: widget.builder(widget.message),
    );
  }
}

/// 打字指示器 - 三个跳动的点
class _TypingIndicator extends StatefulWidget {
  const _TypingIndicator();

  @override
  State<_TypingIndicator> createState() => _TypingIndicatorState();
}

class _TypingIndicatorState extends State<_TypingIndicator>
    with TickerProviderStateMixin {
  late List<AnimationController> _controllers;
  late List<Animation<double>> _animations;

  @override
  void initState() {
    super.initState();
    _controllers = List.generate(
      3,
      (index) => AnimationController(
        duration: const Duration(milliseconds: 400),
        vsync: this,
      ),
    );

    _animations = _controllers.map((controller) {
      return Tween<double>(begin: 0, end: -8).animate(
        CurvedAnimation(parent: controller, curve: Curves.easeInOut),
      );
    }).toList();

    // 依次启动动画
    _startAnimations();
  }

  void _startAnimations() async {
    while (mounted) {
      for (int i = 0; i < 3; i++) {
        if (!mounted) return;
        _controllers[i].forward();
        await Future<void>.delayed(const Duration(milliseconds: 150));
      }
      await Future<void>.delayed(const Duration(milliseconds: 100));
      for (int i = 0; i < 3; i++) {
        if (!mounted) return;
        _controllers[i].reverse();
      }
      await Future<void>.delayed(const Duration(milliseconds: 300));
    }
  }

  @override
  void dispose() {
    for (final controller in _controllers) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: List.generate(3, (index) {
          return AnimatedBuilder(
            animation: _animations[index],
            builder: (context, child) {
              return Transform.translate(
                offset: Offset(0, _animations[index].value),
                child: child,
              );
            },
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: Colors.grey.shade400,
                shape: BoxShape.circle,
              ),
            ),
          );
        }),
      ),
    );
  }
}

/// 紧凑型收藏按钮（用于无图片的小卡片）
class _CompactSaveButton extends ConsumerStatefulWidget {
  const _CompactSaveButton({required this.spot});
  final Spot spot;

  @override
  ConsumerState<_CompactSaveButton> createState() => _CompactSaveButtonState();
}

class _CompactSaveButtonState extends ConsumerState<_CompactSaveButton> {
  bool _isInWishlist = false;
  String? _destinationId;

  @override
  void initState() {
    super.initState();
    _checkWishlistStatus();
  }

  void _checkWishlistStatus() {
    final statusAsync = ref.read(wishlistStatusProvider);
    statusAsync.whenData((statusMap) {
      final spotId = widget.spot.id;
      final (isInWishlist, destId) = checkWishlistStatus(statusMap, spotId);
      if (mounted &&
          (isInWishlist != _isInWishlist || destId != _destinationId)) {
        setState(() {
          _isInWishlist = isInWishlist;
          _destinationId = destId;
        });
      }
    });
  }

  Future<void> _handleWishlistTap() async {
    final spotId = widget.spot.id;

    if (_isInWishlist) {
      setState(() => _isInWishlist = false);
      CustomToast.showSuccess(context, 'Removed from Wishlist');

      try {
        if (_destinationId != null) {
          await ref.read(tripRepositoryProvider).manageTripSpot(
                tripId: _destinationId!,
                spotId: spotId,
                remove: true,
              );
          ref.invalidate(wishlistStatusProvider);
        }
      } catch (e) {
        if (mounted) setState(() => _isInWishlist = true);
        CustomToast.showError(context, 'Failed to remove');
      }
    } else {
      setState(() => _isInWishlist = true);
      CustomToast.showSuccess(context, 'Saved');

      try {
        final authed = await requireAuth(context, ref);
        if (!authed) {
          if (mounted) setState(() => _isInWishlist = false);
          return;
        }

        final cityName =
            (widget.spot.city.isNotEmpty) ? widget.spot.city : 'Saved Places';
        final destId = await ensureDestinationForCity(ref, cityName);
        if (destId == null) {
          if (mounted) setState(() => _isInWishlist = false);
          CustomToast.showError(context, 'Failed to save');
          return;
        }

        _destinationId = destId;
        await ref.read(tripRepositoryProvider).manageTripSpot(
          tripId: destId,
          spotId: spotId,
          status: TripSpotStatus.wishlist,
          spotPayload: {
            'name': widget.spot.name,
            'city': widget.spot.city,
            'latitude': widget.spot.latitude,
            'longitude': widget.spot.longitude,
            'coverImage': widget.spot.coverImage,
            'rating': widget.spot.rating,
            'ratingCount': widget.spot.ratingCount,
          },
        );
        ref.invalidate(wishlistStatusProvider);
      } catch (e) {
        if (mounted) setState(() => _isInWishlist = false);
        CustomToast.showError(context, 'Failed to save');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<AsyncValue<Map<String, String?>>>(wishlistStatusProvider,
        (prev, next) {
      next.whenData((statusMap) {
        final spotId = widget.spot.id;
        final (isInWishlist, destId) = checkWishlistStatus(statusMap, spotId);
        if (mounted &&
            (isInWishlist != _isInWishlist || destId != _destinationId)) {
          setState(() {
            _isInWishlist = isInWishlist;
            _destinationId = destId;
          });
        }
      });
    });

    return GestureDetector(
      onTap: _handleWishlistTap,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: _isInWishlist ? AppTheme.primaryYellow : Colors.white,
          shape: BoxShape.circle,
          border: Border.all(color: AppTheme.black, width: 1.5),
          boxShadow: const [
            BoxShadow(
              color: AppTheme.black,
              offset: Offset(0, 1),
              blurRadius: 0,
            ),
          ],
        ),
        child: Icon(
          _isInWishlist ? Icons.favorite : Icons.favorite_border,
          color: _isInWishlist ? const Color(0xFFFF6264) : AppTheme.black,
          size: 20,
        ),
      ),
    );
  }
}
