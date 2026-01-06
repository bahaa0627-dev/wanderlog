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
import 'package:wanderlog/core/theme/app_theme.dart';
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
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart' show Spot, SpotSource;
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/core/providers/locale_provider.dart';
import 'package:wanderlog/core/utils/dialog_utils.dart';
import 'package:wanderlog/shared/widgets/unified_spot_detail_modal.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';
import 'package:wanderlog/shared/utils/destination_utils.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart' show TripSpotStatus;

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
  });

  final String id;
  final bool isUser;
  final String? text;
  final List<String>? imageUrls;
  final List<Spot>? spots;
  final SearchV2Result? searchV2Result;
  final DateTime timestamp;
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
  int _remainingQuota = 10;

  @override
  void initState() {
    super.initState();
    _searchV2Service = SearchV2Service(dio: Dio());
    print('🚀 AIAssistantPage initState called');
    _preloadWishlistStatus();
    _loadHistories();
    _loadQuota();
    
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

  Future<void> _loadQuota() async {
    final user = ref.read(authProvider).user;
    if (user != null) {
      try {
        final quota = await _searchV2Service.getRemainingQuota(user.id);
        if (mounted && quota > 0) {
          setState(() => _remainingQuota = quota);
        }
        // 如果获取失败或返回0，保持默认值10，让后端来判断
      } catch (e) {
        debugPrint('⚠️ Failed to load quota: $e');
        // 保持默认值，不阻止用户
      }
    }
  }

  Future<void> _loadHistories() async {
    setState(() => _isLoading = true);
    final histories = await _historyService.getHistories();
    final reversedHistories = histories.reversed.toList();

    for (final history in reversedHistories) {
      // 添加用户消息
      if (history.imageUrls.isNotEmpty) {
        // 图片识别历史
        _messages.add(_ChatMessage(
          id: '${history.id}_user_img',
          isUser: true,
          imageUrls: history.imageUrls,
          text: history.queryText ?? 'Help me find these places',
          timestamp: history.timestamp,
        ));
      } else if (history.queryText != null && history.queryText!.isNotEmpty) {
        // 文本搜索历史
        _messages.add(_ChatMessage(
          id: '${history.id}_user_text',
          isUser: true,
          text: history.queryText,
          timestamp: history.timestamp,
        ));
      }
      
      // 添加 AI 回复消息
      if (history.hasSearchV2Result) {
        // 新格式：使用 SearchV2Result 展示（包含分类、地图等）
        _messages.add(_ChatMessage(
          id: '${history.id}_ai_v2',
          isUser: false,
          searchV2Result: history.searchV2Result,
          timestamp: history.timestamp,
        ));
      } else {
        // 旧格式：兼容旧的历史记录
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
        debugPrint('🖼️ [AIAssistant] Has images, calling _handleImageRecognition');
        await _handleImageRecognition(imagesToSend, textToSend);
      } else {
        // 使用 SearchV2 进行文本搜索
        debugPrint('📝 [AIAssistant] Text only, calling _handleSearchV2: $textToSend');
        await _handleSearchV2(textToSend);
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
      if (mounted && _isSendingMessage) setState(() { 
        _isSendingMessage = false; 
        _cancelToken = null;
        _searchLoadingState = const SearchLoadingState.complete();
      });
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
    final user = ref.read(authProvider).user;
    if (user == null) {
      setState(() {
        _messages.add(_ChatMessage(
          id: 'error_${DateTime.now().millisecondsSinceEpoch}',
          isUser: false, 
          text: 'Please login to use AI search.',
          timestamp: DateTime.now(),
        ));
      });
      return;
    }

    // 不在前端检查配额，让后端来判断
    // 后端会返回 429 错误如果配额用完

    // 语言检测逻辑：
    // 1. 默认使用用户 Settings 里的语言
    // 2. 但检测用户输入的语言，回复保持一致（支持自由切换）
    final userSettingsLanguage = ref.read(localeProvider).languageCode;
    final detectedLanguage = _detectQueryLanguage(query, userSettingsLanguage);
    final language = detectedLanguage ?? userSettingsLanguage;
    debugPrint('🌐 [SearchV2] Settings language: $userSettingsLanguage, Detected: $detectedLanguage, Using: $language');

    final result = await _searchV2Service.searchV2(
      query: query,
      userId: user.id,
      language: language,
      onStageChange: (state) {
        if (mounted) {
          setState(() => _searchLoadingState = state);
        }
      },
      cancelToken: _cancelToken,
    );

    if (!mounted) return;

    // 更新配额
    setState(() => _remainingQuota = result.quotaRemaining);

    if (result.error != null) {
      setState(() {
        _messages.add(_ChatMessage(
          id: 'error_${DateTime.now().millisecondsSinceEpoch}',
          isUser: false, 
          text: result.error!,
          timestamp: DateTime.now(),
        ));
      });
      return;
    }

    // 添加 SearchV2 结果消息
    setState(() {
      _messages.add(_ChatMessage(
        id: 'ai_v2_${DateTime.now().millisecondsSinceEpoch}',
        isUser: false,
        searchV2Result: result,
        timestamp: DateTime.now(),
      ));
    });

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

  /// 检测用户输入的语言
  /// 只有在“可以明确判定是其他语言”时才返回语言代码
  /// 返回 null 表示保持用户当前设置
  String? _detectQueryLanguage(String query, String defaultLanguage) {
    final lowerQuery = query.toLowerCase().trim();
    if (lowerQuery.isEmpty) {
      return null;
    }

    String? _returnIfDifferent(String languageCode) {
      return languageCode == defaultLanguage ? null : languageCode;
    }

    int _countMatches(RegExp pattern) => pattern.allMatches(lowerQuery).length;

    // 检测中文、日文、韩文字符（这些语言有独特字符，判断可靠）
    final chineseRegex = RegExp(r'[\u4e00-\u9fff\u3400-\u4dbf]');
    final japaneseRegex = RegExp(r'[\u3040-\u309f\u30a0-\u30ff]');
    final koreanRegex = RegExp(r'[\uac00-\ud7af\u1100-\u11ff]');

    final chineseCount = chineseRegex.allMatches(query).length;
    final japaneseCount = japaneseRegex.allMatches(query).length;
    final koreanCount = koreanRegex.allMatches(query).length;

    if (chineseCount > 0 || japaneseCount > 0 || koreanCount > 0) {
      if (japaneseCount > 0) {
        return _returnIfDifferent('ja');
      }
      if (koreanCount > chineseCount) {
        return _returnIfDifferent('ko');
      }
      if (chineseCount > 0) {
        return _returnIfDifferent('zh');
      }
    }

    // 法语：带有重音字符或 >=2 个关键词时才认为是法语
    final frenchAccentRegex = RegExp(r'[àâéèêëïîôùûüÿœæç]', caseSensitive: false);
    final frenchKeywordRegex = RegExp(
      r'\b(je|tu|il|nous|vous|ils|le|la|les|un|une|des|du|de|et|ou|mais|donc|car|ni|que|qui|quoi|où|quand|comment|pourquoi|avec|pour|dans|sur|sous|chez|vers|par|entre|sans|avant|après|pendant|depuis|jusqu|contre|malgré|selon|sauf|voici|voilà|café|restaurant|hôtel|musée|église|château|jardin|plage|montagne|ville|rue|place|pont|gare|aéroport|boulangerie|pâtisserie|librairie|pharmacie|hôpital|école|université|théâtre|cinéma|stade|parc|forêt|lac|rivière|mer|océan|île|quartier|arrondissement|avenue|boulevard)\b',
      caseSensitive: false,
    );
    final frenchKeywordMatches = _countMatches(frenchKeywordRegex);
    if (frenchAccentRegex.hasMatch(query) || frenchKeywordMatches >= 2) {
      return _returnIfDifferent('fr');
    }

    // 西班牙语：同样要求有重音/倒置标点或至少两个关键词
    final spanishAccentRegex = RegExp(r'[áéíóúñ¿¡]', caseSensitive: false);
    final spanishKeywordRegex = RegExp(
      r'\b(yo|tú|él|ella|nosotros|vosotros|ellos|el|la|los|las|un|una|unos|unas|del|al|porque|qué|quién|dónde|cuándo|cómo|por|para|con|sin|sobre|entre|hasta|café|restaurante|hotel|museo|iglesia|castillo|jardín|playa|montaña|ciudad|calle|plaza|puente|estación|aeropuerto|metro|autobús|tren|avión|barco|coche|bicicleta|taxi)\b',
      caseSensitive: false,
    );
    final spanishKeywordMatches = _countMatches(spanishKeywordRegex);
    if (spanishAccentRegex.hasMatch(query) || spanishKeywordMatches >= 2) {
      return _returnIfDifferent('es');
    }

    // 德语：必须包含变音符/ß，或至少两个典型德语词汇
    final germanAccentRegex = RegExp(r'[äöüß]', caseSensitive: false);
    final germanKeywordRegex = RegExp(
      r'\b(ich|du|er|sie|es|wir|ihr|der|die|das|ein|eine|und|oder|aber|weil|dass|wenn|wie|warum|mit|ohne|für|gegen|durch|bei|nach|von|zu|aus|seit|bis|straße|platz|brücke|bahnhof|flughafen|bäckerei|schloss|garten|strand|stadt|viertel|ubahn|zug|flugzeug|schiff|fahrrad|motorrad)\b',
      caseSensitive: false,
    );
    final germanKeywordMatches = _countMatches(germanKeywordRegex);
    if (germanAccentRegex.hasMatch(query) || germanKeywordMatches >= 2) {
      return _returnIfDifferent('de');
    }

    // 其他语言暂不强制覆写
    return null;
  }

  /// 将 PlaceResult 转换为 Spot
  Spot _placeResultToSpot(PlaceResult place) {
    debugPrint('🏷️ [_placeResultToSpot] Converting "${place.name}" - tags: ${place.tags}');
    
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
    
    final category = (place.tags?.isNotEmpty ?? false) ? place.tags!.first : 'Place';
    debugPrint('🏷️ [_placeResultToSpot] "${place.name}" category: $category, all tags: ${place.tags}');
    
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

    // 获取当前收藏状态
    final spotId = place.id ?? place.name;
    bool isInWishlist = false;
    final statusAsync = ref.read(wishlistStatusProvider);
    statusAsync.whenData((statusMap) {
      final (inWishlist, _) = checkWishlistStatus(statusMap, spotId);
      isInWishlist = inWishlist;
    });

    final placeId = place.id;
    final isAiGeneratedPlace = (place.source == PlaceSource.ai) || (placeId?.startsWith('ai_') ?? false);
    final isUuid = placeId != null && RegExp(
      r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
    ).hasMatch(placeId);
    
    // 检查是否需要从后端获取详情（有 ID 但缺少详情字段）
    // 注意：AI 生成的 placeId（ai_xxx）不是数据库 UUID，后端通常无法按 ID 返回详情。
    final needsFetch = isUuid && !isAiGeneratedPlace &&
        place.address == null && 
        place.phoneNumber == null && 
        place.website == null;
    
    if (needsFetch) {
      debugPrint('🔍 [AIAssistant] Fetching fresh data for place ID: ${place.id}');
      
      // 先显示 loading 状态的 modal
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (context) => _PlaceDetailLoader(
          placeId: place.id!,
          fallbackPlace: place,
          placeResultToSpot: _placeResultToSpot,
          initialIsSaved: isInWishlist,
        ),
      );
    } else {
      // 已有详情数据，直接显示
      final spot = _placeResultToSpot(place);
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (context) => UnifiedSpotDetailModal(
          spot: spot,
          keepOpenOnAction: true,
          initialIsSaved: isInWishlist,
        ),
      );
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
        actions: [
          // 显示剩余配额 - Requirements: 13.3, 13.4
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: _remainingQuota > 0 
                      ? AppTheme.primaryYellow.withOpacity(0.2)
                      : Colors.red.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: _remainingQuota > 0 ? AppTheme.primaryYellow : Colors.red,
                    width: 1,
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.auto_awesome,
                      size: 14,
                      color: _remainingQuota > 0 ? AppTheme.black : Colors.red,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '$_remainingQuota/10',
                      style: AppTheme.bodySmall(context).copyWith(
                        fontWeight: FontWeight.w600,
                        color: _remainingQuota > 0 ? AppTheme.black : Colors.red,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
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
    // 确保列表可以滚动到底部
    shrinkWrap: false,
    itemBuilder: (context, index) {
      if (index == _messages.length) return _buildLoadingIndicator();
      final message = _messages[index];
      return Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: message.isUser ? _buildUserMessage(message) : _buildAIMessage(message),
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
                  valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.primaryYellow),
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
          // 进度条
          const SizedBox(height: 8),
          LinearProgressIndicator(
            value: progress,
            backgroundColor: AppTheme.lightGray,
            valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.primaryYellow),
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


  /// 构建 AI 消息 - 移除头像和底卡
  /// Requirements: 12.1, 12.2, 12.3
  Widget _buildAIMessage(_ChatMessage message) {
    // 如果是 SearchV2 结果，使用专门的展示组件
    if (message.searchV2Result != null) {
      return _buildSearchV2Result(message.searchV2Result!);
    }

    // 普通文本消息 - 直接显示文本，不使用头像和底卡
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (message.text != null && message.text!.isNotEmpty)
          Text(
            message.text!,
            style: AppTheme.bodyMedium(context),
          ),
        if (message.spots != null && message.spots!.isNotEmpty)
          ...message.spots!.map((spot) => Padding(
            padding: const EdgeInsets.only(top: 12),
            child: _SpotCardOverlay(spot: spot),
          )),
      ],
    );
  }

  /// 构建 SearchV2 结果展示
  /// Requirements: 8.1, 8.2, 8.3, 9.1, 10.1, 10.2
  Widget _buildSearchV2Result(SearchV2Result result) {
    debugPrint('🎨 [_buildSearchV2Result] intent: ${result.intent}');
    debugPrint('🎨 [_buildSearchV2Result] isTextResponse: ${result.isTextResponse}');
    debugPrint('🎨 [_buildSearchV2Result] textContent: ${result.textContent?.length ?? 0} chars');
    debugPrint('🎨 [_buildSearchV2Result] acknowledgment: ${result.acknowledgment.length} chars');
    debugPrint('🎨 [_buildSearchV2Result] hasCategories: ${result.hasCategories}');
    debugPrint('🎨 [_buildSearchV2Result] places: ${result.places.length}');
    debugPrint('🎨 [_buildSearchV2Result] cityPlaces: ${result.cityPlaces?.length ?? 0}');
    
    // 处理文本响应（non_travel 或 travel_consultation）
    if (result.isTextResponse) {
      final textContent = result.textContent ?? '';
      
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
        return _buildInterleavedCityContent(textContent, result.cityPlaces!);
      }
      
      // 普通文本响应（non_travel 或没有城市分组的 travel_consultation）
      // 对于 travel_consultation，只显示有图片的地点，没有图片的不展示卡片
      // 过滤掉没有真实图片的地点（排除 example.com 占位符）
      bool hasValidImage(PlaceResult p) {
        if (p.coverImage.isEmpty) return false;
        if (p.coverImage.contains('example.com')) return false;
        return p.coverImage.startsWith('http');
      }
      final placesWithImage = result.places.where(hasValidImage).toList();
      debugPrint('🖼️ [_buildSearchV2Result] After filter: ${placesWithImage.length} places (from ${result.places.length})');
      
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 文本内容 - 支持 Markdown 格式
          _buildMarkdownText(textContent),
          
          // 只有当有带图片的地点时才显示卡片和地图
          if (placesWithImage.isNotEmpty) ...[
            // 单城市场景：使用 relatedPlaces（已过滤无图片的）
            const SizedBox(height: 20),
            _buildHorizontalPlaceCards(placesWithImage),
            const SizedBox(height: 20),
            // 地图展示
            RecommendationMapView(
              places: placesWithImage,
              height: 200,
              onPlaceTap: _showPlaceDetail,
            ),
          ],
        ],
      );
    }
    
    // 处理 specific_place 意图（单个地点）
    if (result.isSpecificPlace) {
      // 如果有匹配到数据库的地点且有图片，显示卡片
      final hasMatchedPlace = result.places.isNotEmpty && 
          result.places.first.coverImage.isNotEmpty;
      
      if (hasMatchedPlace) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 描述文案
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
            
            // 单个地点卡片
            FlatPlaceList(
              places: result.places,
              onPlaceTap: _showPlaceDetail,
            ),
            
            const SizedBox(height: 20),
            
            // 地图展示 - 只显示有图片的地点
            RecommendationMapView(
              places: result.places.where((p) => p.coverImage.isNotEmpty).toList(),
              height: 200,
              onPlaceTap: _showPlaceDetail,
            ),
          ],
        );
      } else {
        // 没有匹配到数据库或没有图片，显示纯文字
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 如果 AI 识别出了地点名称，显示标题
            if (result.identifiedPlaceName != null && result.identifiedPlaceName!.isNotEmpty) ...[
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
              Text(
                result.acknowledgment,
                style: AppTheme.bodyMedium(context).copyWith(
                  color: AppTheme.black,
                  height: 1.5,
                ),
              ),
          ],
        );
      }
    }
    
    // 默认处理（general_search）
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

        // 没有分类时，在地点列表前显示 overallSummary 作为开头介绍
        if (!result.hasCategories && result.overallSummary.isNotEmpty) ...[
          Text(
            result.overallSummary,
            style: AppTheme.bodyMedium(context).copyWith(
              color: AppTheme.black,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 16),
        ],

        // 分类展示或平铺展示 - Requirements: 9.1
        if (result.hasCategories)
          // 有分类时使用分类展示组件
          CategorizedPlacesList(
            categories: result.categories!,
            onPlaceTap: _showPlaceDetail,
          )
        else
          // 无分类时使用平铺展示组件
          FlatPlaceList(
            places: result.places,
            onPlaceTap: _showPlaceDetail,
          ),

        const SizedBox(height: 20),

        // 有分类时，在地点列表后显示 overallSummary（如果有的话）
        if (result.hasCategories && result.overallSummary.isNotEmpty) ...[
          Text(
            result.overallSummary,
            style: AppTheme.bodyMedium(context).copyWith(
              color: AppTheme.black,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 20),
        ],

        // 地图展示 - Requirements: 10.3, 10.4, 10.5
        // 只显示有图片的地点
        if (result.allPlaces.where((p) => p.coverImage.isNotEmpty).isNotEmpty)
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'find more place on the map',
                style: AppTheme.bodySmall(context).copyWith(
                  color: AppTheme.darkGray,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 8),
              RecommendationMapView(
                places: result.allPlaces.where((p) => p.coverImage.isNotEmpty).toList(),
                height: 200,
                onPlaceTap: _showPlaceDetail,
              ),
            ],
          ),
      ],
    );
  }
  
  /// 构建穿插显示的城市内容（城市介绍 + 卡片）
  /// 解析 AI 回复文本，在每个城市介绍后插入对应的横滑卡片
  Widget _buildInterleavedCityContent(String textContent, List<CityPlacesGroup> cityPlaces) {
    final widgets = <Widget>[];
    
    // 创建城市名到地点的映射（保留原始大小写用于显示）
    final cityPlacesMap = <String, CityPlacesGroup>{};
    for (final group in cityPlaces) {
      cityPlacesMap[group.city.toLowerCase()] = group;
    }
    
    debugPrint('🏙️ Building interleaved content for cities: ${cityPlacesMap.keys.join(", ")}');
    
    // 按城市分割文本
    final lines = textContent.split('\n');
    final sections = <_CitySection>[];
    String currentContent = '';
    String? currentCityKey;
    
    for (final line in lines) {
      final trimmed = line.trim();
      
      // 检查是否是城市标题
      String? detectedCityKey;
      for (final cityKey in cityPlacesMap.keys) {
        // 匹配多种格式：## Tokyo、### Tokyo、**Tokyo**、🗼 Tokyo、Tokyo:
        // 使用更宽松的匹配
        final cityLower = trimmed.toLowerCase();
        if (cityLower.contains(cityKey) && 
            (trimmed.startsWith('##') || 
             trimmed.startsWith('**') || 
             trimmed.contains('🗼') || 
             trimmed.contains('🗾') ||
             trimmed.contains('🇫🇷') ||
             trimmed.contains('🇯🇵') ||
             trimmed.contains('✨') ||
             RegExp(r'^[#*\s]*' + RegExp.escape(cityKey), caseSensitive: false).hasMatch(cityLower))) {
          detectedCityKey = cityKey;
          debugPrint('🏙️ Detected city "$cityKey" in line: $trimmed');
          break;
        }
      }
      
      if (detectedCityKey != null && detectedCityKey != currentCityKey) {
        // 发现新城市，保存之前的内容
        if (currentContent.trim().isNotEmpty || currentCityKey != null) {
          sections.add(_CitySection(
            cityKey: currentCityKey,
            content: currentContent.trim(),
          ));
        }
        currentCityKey = detectedCityKey;
        currentContent = '$line\n';
      } else {
        currentContent += '$line\n';
      }
    }
    
    // 保存最后一段
    if (currentContent.trim().isNotEmpty || currentCityKey != null) {
      sections.add(_CitySection(
        cityKey: currentCityKey,
        content: currentContent.trim(),
      ));
    }
    
    debugPrint('🏙️ Found ${sections.length} sections');
    
    // 构建 widgets
    for (final section in sections) {
      // 添加文本内容
      if (section.content.isNotEmpty) {
        widgets.add(_buildMarkdownText(section.content));
      }
      
      // 如果这个 section 有对应的城市，添加卡片（只显示有图片的地点）
      if (section.cityKey != null && cityPlacesMap.containsKey(section.cityKey)) {
        final group = cityPlacesMap[section.cityKey]!;
        debugPrint('🏙️ [_buildInterleavedCityContent] City "${group.city}" has ${group.places.length} places');
        final placesWithImage = group.places.where((p) => p.coverImage.isNotEmpty).toList();
        debugPrint('🏙️ [_buildInterleavedCityContent] After filter: ${placesWithImage.length} places with images');
        if (placesWithImage.isNotEmpty) {
          widgets.add(const SizedBox(height: 12));
          widgets.add(_buildHorizontalSpotCards(placesWithImage));
          widgets.add(const SizedBox(height: 16));
        }
      }
    }
    
    // 如果没有成功分割（没有检测到城市），显示所有内容后再显示所有卡片
    if (sections.every((s) => s.cityKey == null)) {
      debugPrint('🏙️ No city sections detected, showing all cards at end');
      widgets.clear();
      widgets.add(_buildMarkdownText(textContent));
      for (final group in cityPlaces) {
        // 只显示有图片的地点
        final placesWithImage = group.places.where((p) => p.coverImage.isNotEmpty).toList();
        if (placesWithImage.isNotEmpty) {
          widgets.add(const SizedBox(height: 16));
          widgets.add(Text(
            group.city,
            style: AppTheme.titleMedium(context).copyWith(
              color: AppTheme.black,
              fontWeight: FontWeight.w600,
            ),
          ));
          widgets.add(const SizedBox(height: 12));
          widgets.add(_buildHorizontalSpotCards(placesWithImage));
        }
      }
    }
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: widgets,
    );
  }
  
  /// 构建横滑 Spot 卡片（使用 AI 搜索的卡片样式）
  Widget _buildHorizontalSpotCards(List<PlaceResult> places) {
    // 过滤掉没有图片的地点
    debugPrint('🖼️ [_buildHorizontalSpotCards] Input places: ${places.length}');
    for (final p in places) {
      debugPrint('🖼️ [_buildHorizontalSpotCards] "${p.name}" coverImage: "${p.coverImage.isEmpty ? 'EMPTY' : p.coverImage.substring(0, 50)}..."');
    }
    final placesWithImage = places.where((p) => p.coverImage.isNotEmpty).toList();
    debugPrint('🖼️ [_buildHorizontalSpotCards] After filter: ${placesWithImage.length} places with images');
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
  
  /// 构建 Markdown 文本（简单实现）
  Widget _buildMarkdownText(String text) {
    // Debug: 打印原始文本内容
    debugPrint('📝 _buildMarkdownText input (first 500 chars):');
    debugPrint(text.substring(0, text.length > 500 ? 500 : text.length));
    
    // 先预处理：将链接转换为特殊标记，避免被换行分割
    // 然后按行分割处理标题和列表
    final lines = text.split('\n');
    final widgets = <Widget>[];
    
    // 合并连续的非标题、非列表行（可能是被换行的段落）
    final processedLines = <String>[];
    String currentParagraph = '';
    
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
                 trimmed.startsWith('- ') ||
                 trimmed.startsWith('  - ') ||
                 RegExp(r'^\d+\.\s').hasMatch(trimmed)) {
        // 标题或列表项：结束当前段落，单独处理
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
      
      if (line.startsWith('## ')) {
        // 二级标题
        widgets.add(Padding(
          padding: const EdgeInsets.only(top: 12, bottom: 8),
          child: Text(
            line.substring(3),
            style: AppTheme.titleMedium(context).copyWith(
              color: AppTheme.black,
              fontWeight: FontWeight.w600,
            ),
          ),
        ));
      } else if (line.startsWith('### ')) {
        // 三级标题
        widgets.add(Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 4),
          child: Text(
            line.substring(4),
            style: AppTheme.bodyLarge(context).copyWith(
              color: AppTheme.black,
              fontWeight: FontWeight.w600,
            ),
          ),
        ));
      } else if (line.startsWith('- ') || line.startsWith('  - ')) {
        // 无序列表项
        final indent = line.startsWith('  - ') ? 16.0 : 0.0;
        final content = line.startsWith('  - ') ? line.substring(4) : line.substring(2);
        widgets.add(Padding(
          padding: EdgeInsets.only(left: indent, top: 2, bottom: 2),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('• ', style: AppTheme.bodyMedium(context).copyWith(color: AppTheme.black)),
              Expanded(
                child: _buildRichText(content),
              ),
            ],
          ),
        ));
      } else if (RegExp(r'^\d+\.\s').hasMatch(line.trim())) {
        // 有序列表项（如 "1. [Site Name](URL) - description"）
        final match = RegExp(r'^(\d+)\.\s(.*)$').firstMatch(line.trim());
        if (match != null) {
          final number = match.group(1)!;
          final content = match.group(2)!;
          widgets.add(Padding(
            padding: const EdgeInsets.only(top: 2, bottom: 2),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$number. ', style: AppTheme.bodyMedium(context).copyWith(color: AppTheme.black)),
                Expanded(
                  child: _buildRichText(content),
                ),
              ],
            ),
          ));
        } else {
          // fallback: 直接渲染
          widgets.add(_buildRichText(line));
        }
      } else {
        // 普通段落 - 支持内联加粗
        widgets.add(_buildRichText(line));
      }
    }
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: widgets,
    );
  }
  
  /// 构建支持加粗和链接的富文本
  /// **地点名** 会显示为加粗加大的样式
  /// [链接文字](URL) 会显示为可点击的蓝色链接
  Widget _buildRichText(String text) {
    final spans = <InlineSpan>[];
    
    // 分开处理链接和加粗，避免复杂正则问题
    // 链接正则：[任意文字](URL) - URL 不能包含空格和右括号
    final linkRegex = RegExp(r'\[([^\]]+)\]\(([^)\s]+)\)');
    // 加粗正则：**text**
    final boldRegex = RegExp(r'\*\*([^*]+)\*\*');
    
    // Debug: 打印原始文本
    if (text.contains('[') && text.contains('](')) {
      debugPrint('🔍 _buildRichText input (first 300 chars): "${text.substring(0, text.length > 300 ? 300 : text.length)}"');
      
      // 测试链接正则
      final linkMatches = linkRegex.allMatches(text).toList();
      debugPrint('🔍 Link regex found ${linkMatches.length} matches');
      for (final m in linkMatches) {
        debugPrint('🔗 Match: [${m.group(1)}](${m.group(2)})');
      }
    }
    
    // 收集所有匹配项
    final allMatches = <_RichTextMatch>[];
    
    // 收集链接匹配
    for (final match in linkRegex.allMatches(text)) {
      allMatches.add(_RichTextMatch(
        start: match.start,
        end: match.end,
        type: 'link',
        text: match.group(1)!,
        url: match.group(2),
      ));
    }
    
    // 收集加粗匹配（排除与链接重叠的）
    for (final match in boldRegex.allMatches(text)) {
      final overlaps = allMatches.any((m) => 
        (match.start >= m.start && match.start < m.end) ||
        (match.end > m.start && match.end <= m.end)
      );
      if (!overlaps) {
        allMatches.add(_RichTextMatch(
          start: match.start,
          end: match.end,
          type: 'bold',
          text: match.group(1)!,
        ));
      }
    }
    
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
        spans.add(TextSpan(
          text: text.substring(lastEnd, match.start),
          style: AppTheme.bodyMedium(context).copyWith(
            color: AppTheme.black,
            height: 1.5,
          ),
        ));
      }
      
      if (match.type == 'bold') {
        // 加粗文本
        spans.add(TextSpan(
          text: match.text,
          style: AppTheme.bodyLarge(context).copyWith(
            color: AppTheme.black,
            fontWeight: FontWeight.w700,
            fontSize: 16,
            height: 1.5,
          ),
        ));
      } else if (match.type == 'link' && match.url != null) {
        // 链接
        final linkUrl = match.url!;
        debugPrint('🔗 Creating clickable link: "${match.text}" -> "$linkUrl"');
        spans.add(TextSpan(
          text: match.text,
          style: AppTheme.bodyMedium(context).copyWith(
            color: AppTheme.accentBlue,
            decoration: TextDecoration.underline,
            decorationColor: AppTheme.accentBlue,
            height: 1.5,
          ),
          recognizer: TapGestureRecognizer()
            ..onTap = () async {
              debugPrint('🔗 Link tapped: $linkUrl');
              final uri = Uri.tryParse(linkUrl);
              if (uri != null && await canLaunchUrl(uri)) {
                await launchUrl(uri, mode: LaunchMode.externalApplication);
              } else {
                debugPrint('🔗 Cannot launch URL: $linkUrl');
              }
            },
        ));
      }
      
      lastEnd = match.end;
    }
    
    // 添加剩余的普通文本
    if (lastEnd < text.length) {
      spans.add(TextSpan(
        text: text.substring(lastEnd),
        style: AppTheme.bodyMedium(context).copyWith(
          color: AppTheme.black,
          height: 1.5,
        ),
      ));
    }
    
    return RichText(
      text: TextSpan(children: spans),
    );
  }
  
  /// 构建城市地点分组展示（城市名 + 横滑卡片）
  Widget _buildCityPlacesSection(CityPlacesGroup cityGroup) {
    return Column(
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
  }
  
  /// 构建横滑地点卡片列表
  Widget _buildHorizontalPlaceCards(List<PlaceResult> places) {
    // 过滤掉没有图片的地点
    final placesWithImage = places.where((p) => p.coverImage.isNotEmpty).toList();
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
                      ? AppTheme.lightGray
                      : (_isSendEnabled() ? AppTheme.primaryYellow : AppTheme.lightGray),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: _isSendingMessage 
                        ? AppTheme.lightGray 
                        : (_isSendEnabled() ? AppTheme.black : AppTheme.lightGray), 
                    width: 1.5,
                  ),
                ),
                child: Icon(
                  _isSendingMessage ? Icons.stop_rounded : Icons.arrow_forward, 
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
      final spotId = widget.spot.id ?? widget.spot.name;
      final (isInWishlist, destId) = checkWishlistStatus(statusMap, spotId);
      if (mounted && (isInWishlist != _isInWishlist || destId != _destinationId)) {
        setState(() {
          _isInWishlist = isInWishlist;
          _destinationId = destId;
        });
      }
    });
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

  Future<void> _handleWishlistTap() async {
    final spotId = widget.spot.id ?? widget.spot.name;
    
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
        
        final cityName = (widget.spot.city.isNotEmpty) ? widget.spot.city : 'Saved Places';
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
    ref.listen<AsyncValue<Map<String, String?>>>(wishlistStatusProvider, (prev, next) {
      next.whenData((statusMap) {
        final spotId = widget.spot.id ?? widget.spot.name;
        final (isInWishlist, destId) = checkWishlistStatus(statusMap, spotId);
        if (mounted && (isInWishlist != _isInWishlist || destId != _destinationId)) {
          setState(() {
            _isInWishlist = isInWishlist;
            _destinationId = destId;
          });
        }
      });
    });

    return GestureDetector(
      onTap: () => showModalBottomSheet<void>(
        context: context, isScrollControlled: true, backgroundColor: Colors.transparent,
        builder: (context) => UnifiedSpotDetailModal(
          spot: widget.spot, 
          keepOpenOnAction: true,
          initialIsSaved: _isInWishlist,
        ),
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
              clipBehavior: Clip.hardEdge,
              children: [
                _buildCoverImage(widget.spot.coverImage),
                Positioned.fill(
                  child: Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter, end: Alignment.bottomCenter,
                        colors: [Colors.transparent, Colors.black.withValues(alpha: 0.3), Colors.black.withValues(alpha: 0.75)],
                        stops: const [0.35, 0.65, 1.0],
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: 12, right: 12, bottom: 10,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (widget.spot.tags.isNotEmpty)
                        Wrap(
                          spacing: 4, runSpacing: 4,
                          children: widget.spot.tags.take(2).map((tag) => Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppTheme.primaryYellow,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(tag, style: AppTheme.bodySmall(context).copyWith(
                              fontSize: 10, 
                              fontWeight: FontWeight.w600,
                              color: AppTheme.black,
                            )),
                          )).toList(),
                        ),
                      const SizedBox(height: 6),
                      Text(widget.spot.name,
                        style: AppTheme.labelLarge(context).copyWith(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 2),
                      if (widget.spot.isAIOnly || !widget.spot.hasRating)
                        Row(mainAxisSize: MainAxisSize.min, children: [
                          Icon(Icons.auto_awesome, size: 12, color: AppTheme.primaryYellow),
                          const SizedBox(width: 4),
                          Flexible(child: Text(widget.spot.recommendationPhrase ?? 'AI Recommended',
                            style: AppTheme.bodySmall(context).copyWith(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 12),
                            maxLines: 1, overflow: TextOverflow.ellipsis)),
                        ])
                      else
                        Row(mainAxisSize: MainAxisSize.min, children: [
                          const Icon(Icons.star, size: 14, color: AppTheme.primaryYellow),
                          const SizedBox(width: 4),
                          Text(widget.spot.rating.toStringAsFixed(1),
                            style: AppTheme.bodySmall(context).copyWith(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 12)),
                          const SizedBox(width: 4),
                          Text('(${widget.spot.ratingCount})',
                            style: AppTheme.bodySmall(context).copyWith(color: Colors.white.withValues(alpha: 0.8), fontSize: 11)),
                        ]),
                    ],
                  ),
                ),
                // 收藏按钮 - 使用正确的样式
                Positioned(
                  top: 12, right: 12,
                  child: GestureDetector(
                    onTap: _handleWishlistTap,
                    child: Container(
                      width: 36, height: 36,
                      decoration: BoxDecoration(
                        color: _isInWishlist ? AppTheme.primaryYellow : Colors.white,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppTheme.black, width: 2),
                      ),
                      child: Icon(
                        _isInWishlist ? Icons.favorite : Icons.favorite_border,
                        size: 18, 
                        color: AppTheme.black,
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
class _PlaceDetailLoader extends StatefulWidget {
  const _PlaceDetailLoader({
    required this.placeId,
    required this.fallbackPlace,
    required this.placeResultToSpot,
    this.initialIsSaved,
  });

  final String placeId;
  final PlaceResult fallbackPlace;
  final Spot Function(PlaceResult) placeResultToSpot;
  final bool? initialIsSaved;

  @override
  State<_PlaceDetailLoader> createState() => _PlaceDetailLoaderState();
}

class _PlaceDetailLoaderState extends State<_PlaceDetailLoader> {
  bool _isLoading = true;
  Spot? _spot;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fetchPlaceDetails();
  }

  Future<void> _fetchPlaceDetails() async {
    try {
      // AI 生成的 placeId（ai_xxx）不是数据库 UUID，直接用 fallback 数据展示。
      if (widget.placeId.startsWith('ai_')) {
        if (!mounted) return;
        setState(() {
          _spot = widget.placeResultToSpot(widget.fallbackPlace);
          _isLoading = false;
        });
        return;
      }

      final dio = Dio();
      final apiBaseUrl = dotenv.env['API_BASE_URL'] ?? 'http://localhost:3000/api';
      
      final response = await dio.get<Map<String, dynamic>>(
        '$apiBaseUrl/spots/${widget.placeId}',
        options: Options(
          sendTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 10),
        ),
      );

      if (!mounted) return;

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
        );
        
        setState(() {
          _spot = widget.placeResultToSpot(enrichedPlace);
          _isLoading = false;
        });
      } else {
        // 使用 fallback 数据
        setState(() {
          _spot = widget.placeResultToSpot(widget.fallbackPlace);
          _isLoading = false;
        });
      }
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
            style: AppTheme.bodyMedium(context).copyWith(color: AppTheme.mediumGray),
          ),
        ),
      );
    }

    return UnifiedSpotDetailModal(
      spot: _spot!,
      keepOpenOnAction: true,
      initialIsSaved: widget.initialIsSaved,
    );
  }
}

/// 富文本匹配结果辅助类
class _RichTextMatch {
  final int start;
  final int end;
  final String type; // 'bold' or 'link'
  final String text;
  final String? url;
  
  _RichTextMatch({
    required this.start,
    required this.end,
    required this.type,
    required this.text,
    this.url,
  });
}

/// 城市内容分段辅助类
class _CitySection {
  final String? cityKey;
  final String content;
  
  _CitySection({this.cityKey, required this.content});
}
