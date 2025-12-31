import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/ai_recognition/data/models/ai_recognition_history.dart';
import 'package:wanderlog/features/ai_recognition/data/models/ai_recognition_result.dart';
import 'package:wanderlog/features/ai_recognition/data/models/search_v2_result.dart';
import 'package:wanderlog/features/ai_recognition/data/services/ai_recognition_history_service.dart';
import 'package:wanderlog/features/ai_recognition/data/services/ai_recognition_service.dart';
import 'package:wanderlog/features/ai_recognition/data/services/chatgpt_service.dart';
import 'package:wanderlog/features/ai_recognition/data/services/search_v2_service.dart';
import 'package:wanderlog/features/ai_recognition/presentation/widgets/category_section.dart';
import 'package:wanderlog/features/ai_recognition/presentation/widgets/flat_place_list.dart';
import 'package:wanderlog/features/ai_recognition/presentation/widgets/recommendation_map_view.dart';
import 'package:wanderlog/features/ai_recognition/providers/wishlist_status_provider.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart' show Spot, SpotSource;
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/core/providers/locale_provider.dart';
import 'package:wanderlog/core/utils/dialog_utils.dart';
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
  final _chatGPTService = ChatGPTService(dio: Dio());
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
    final detectedLanguage = _detectQueryLanguage(query);
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
  /// 根据 query 整体判断语言，不只是看地名
  /// 返回检测到的语言代码，如果无法确定则返回 null（使用默认设置）
  String? _detectQueryLanguage(String query) {
    final lowerQuery = query.toLowerCase().trim();
    
    // 检测中文字符（包括简体和繁体）
    final chineseRegex = RegExp(r'[\u4e00-\u9fff\u3400-\u4dbf]');
    // 检测日文字符（平假名、片假名）
    final japaneseRegex = RegExp(r'[\u3040-\u309f\u30a0-\u30ff]');
    // 检测韩文字符
    final koreanRegex = RegExp(r'[\uac00-\ud7af\u1100-\u11ff]');
    
    final chineseCount = chineseRegex.allMatches(query).length;
    final japaneseCount = japaneseRegex.allMatches(query).length;
    final koreanCount = koreanRegex.allMatches(query).length;
    
    // 如果有明显的非拉丁字符，根据数量判断语言
    if (chineseCount > 0 || japaneseCount > 0 || koreanCount > 0) {
      // 日文优先（因为日文可能混合汉字）
      if (japaneseCount > 0) {
        return 'ja';
      }
      // 韩文
      if (koreanCount > chineseCount) {
        return 'ko';
      }
      // 中文
      if (chineseCount > 0) {
        return 'zh';
      }
    }
    
    // 检测法语特征字符和词汇
    if (RegExp(r'[àâéèêëïîôùûüÿœæç]', caseSensitive: false).hasMatch(query) ||
        RegExp(r'\b(je|tu|il|nous|vous|ils|le|la|les|un|une|des|du|de|et|ou|mais|donc|car|ni|que|qui|quoi|où|quand|comment|pourquoi|avec|pour|dans|sur|sous|chez|vers|par|entre|sans|avant|après|pendant|depuis|jusqu|contre|malgré|selon|sauf|voici|voilà|très|bien|mal|peu|beaucoup|trop|assez|plus|moins|aussi|encore|toujours|jamais|souvent|parfois|déjà|bientôt|maintenant|hier|aujourd|demain|ici|là|partout|ailleurs|dedans|dehors|dessus|dessous|devant|derrière|près|loin|autour|café|restaurant|hôtel|musée|église|château|jardin|plage|montagne|ville|rue|place|pont|gare|aéroport|boulangerie|pâtisserie|librairie|pharmacie|hôpital|école|université|théâtre|cinéma|stade|parc|forêt|lac|rivière|mer|océan|île|côte|nord|sud|est|ouest|centre|quartier|arrondissement|avenue|boulevard|impasse|passage|allée|chemin|route|autoroute|métro|bus|train|avion|bateau|voiture|vélo|moto|taxi|uber|réservation|billet|ticket|entrée|sortie|ouvert|fermé|gratuit|payant|cher|bon|mauvais|grand|petit|nouveau|ancien|vieux|jeune|beau|joli|laid|propre|sale|chaud|froid|sec|humide|clair|sombre|calme|bruyant|rapide|lent|facile|difficile|simple|compliqué|possible|impossible|nécessaire|important|intéressant|ennuyeux|amusant|triste|heureux|content|fâché|surpris|déçu|fatigué|malade|sain|fort|faible|riche|pauvre|plein|vide|lourd|léger|dur|mou|doux|rugueux|lisse|pointu|rond|carré|long|court|large|étroit|haut|bas|profond|superficiel|épais|mince|serré|lâche|mouillé|sec|frais|tiède|brûlant|glacé|sucré|salé|amer|acide|épicé|fade|délicieux|dégoûtant|appétissant|nourrissant|léger|lourd|copieux|frugal|végétarien|végétalien|bio|local|traditionnel|moderne|classique|contemporain|populaire|célèbre|inconnu|rare|commun|unique|spécial|ordinaire|extraordinaire|magnifique|superbe|splendide|merveilleux|fantastique|incroyable|étonnant|surprenant|choquant|effrayant|terrifiant|horrible|affreux|atroce|abominable|détestable|haïssable|méprisable|ignoble|infâme|odieux|répugnant|repoussant|dégoûtant|écœurant|nauséabond|puant|malodorant|fétide|pestilentiel)\b', caseSensitive: false).hasMatch(lowerQuery)) {
      return 'fr';
    }
    
    // 检测西班牙语特征字符和词汇
    if (RegExp(r'[áéíóúñ¿¡]', caseSensitive: false).hasMatch(query) ||
        RegExp(r'\b(yo|tú|él|ella|nosotros|vosotros|ellos|el|la|los|las|un|una|unos|unas|del|al|y|o|pero|sino|porque|que|quien|cual|donde|cuando|como|por|para|con|sin|sobre|bajo|entre|hacia|desde|hasta|según|durante|mediante|ante|tras|contra|excepto|salvo|incluso|además|también|tampoco|ni|ya|aún|todavía|siempre|nunca|jamás|a veces|muchas veces|pocas veces|casi|apenas|solo|solamente|únicamente|principalmente|especialmente|particularmente|generalmente|normalmente|habitualmente|frecuentemente|raramente|ocasionalmente|probablemente|posiblemente|seguramente|ciertamente|evidentemente|obviamente|claramente|realmente|verdaderamente|efectivamente|prácticamente|virtualmente|literalmente|figuradamente|metafóricamente|simbólicamente|alegóricamente|irónicamente|sarcásticamente|humorísticamente|cómicamente|trágicamente|dramáticamente|épicamente|líricamente|poéticamente|prosaicamente|elegantemente|graciosamente|torpemente|hábilmente|diestramente|magistralmente|brillantemente|espléndidamente|maravillosamente|fantásticamente|increíblemente|asombrosamente|sorprendentemente|impresionantemente|extraordinariamente|excepcionalmente|notablemente|considerablemente|significativamente|sustancialmente|enormemente|inmensamente|vastamente|ampliamente|extensamente|profundamente|intensamente|fuertemente|poderosamente|vigorosamente|enérgicamente|dinámicamente|activamente|pasivamente|tranquilamente|pacíficamente|serenamente|calmadamente|sosegadamente|apaciblemente|plácidamente|suavemente|delicadamente|tiernamente|cariñosamente|amorosamente|afectuosamente|cordialmente|amablemente|gentilmente|cortésmente|educadamente|respetuosamente|atentamente|cuidadosamente|meticulosamente|minuciosamente|detalladamente|exhaustivamente|completamente|totalmente|enteramente|plenamente|absolutamente|definitivamente|categóricamente|rotundamente|tajantemente|terminantemente|irrevocablemente|irreversiblemente|irremediablemente|inevitablemente|inexorablemente|indefectiblemente|infaliblemente|indudablemente|incuestionablemente|indiscutiblemente|innegablemente|irrefutablemente|incontrovertiblemente|incontestablemente|café|restaurante|hotel|museo|iglesia|castillo|jardín|playa|montaña|ciudad|calle|plaza|puente|estación|aeropuerto|panadería|pastelería|librería|farmacia|hospital|escuela|universidad|teatro|cine|estadio|parque|bosque|lago|río|mar|océano|isla|costa|norte|sur|este|oeste|centro|barrio|avenida|bulevar|callejón|pasaje|camino|carretera|autopista|metro|autobús|tren|avión|barco|coche|bicicleta|moto|taxi)\b', caseSensitive: false).hasMatch(lowerQuery)) {
      return 'es';
    }
    
    // 检测德语特征字符和词汇
    if (RegExp(r'[äöüß]', caseSensitive: false).hasMatch(query) ||
        RegExp(r'\b(ich|du|er|sie|es|wir|ihr|der|die|das|ein|eine|und|oder|aber|denn|weil|dass|wenn|als|ob|wie|wo|wann|warum|wer|was|welch|mit|ohne|für|gegen|durch|um|bei|nach|von|zu|aus|seit|bis|während|trotz|wegen|anstatt|außer|innerhalb|außerhalb|oberhalb|unterhalb|diesseits|jenseits|beiderseits|längs|entlang|gemäß|laut|zufolge|entsprechend|ungeachtet|unbeschadet|einschließlich|ausschließlich|hinsichtlich|bezüglich|betreffs|zwecks|mittels|vermittels|kraft|dank|infolge|aufgrund|anlässlich|gelegentlich|angesichts|café|restaurant|hotel|museum|kirche|schloss|garten|strand|berg|stadt|straße|platz|brücke|bahnhof|flughafen|bäckerei|konditorei|buchhandlung|apotheke|krankenhaus|schule|universität|theater|kino|stadion|park|wald|see|fluss|meer|ozean|insel|küste|norden|süden|osten|westen|zentrum|viertel|allee|boulevard|gasse|passage|weg|landstraße|autobahn|ubahn|bus|zug|flugzeug|schiff|auto|fahrrad|motorrad)\b', caseSensitive: false).hasMatch(lowerQuery)) {
      return 'de';
    }
    
    // 检测英语词汇（最后检测，因为很多语言会混用英语词）
    // 使用更全面的英语词汇列表
    final englishPatterns = [
      // 常见介词、冠词、连词
      r'\b(in|at|near|around|the|a|an|to|for|with|from|of|on|by|about|into|through|during|before|after|above|below|between|under|over|behind|beside|next|across|along|among|within|without|against|toward|towards|upon|onto|off|out|up|down|away|back|here|there|where|when|how|why|what|which|who|whom|whose|that|this|these|those|it|its|is|are|was|were|be|been|being|have|has|had|having|do|does|did|doing|will|would|shall|should|can|could|may|might|must|need|dare|ought|used)\b',
      // 旅行相关动词和形容词
      r'\b(recommend|find|show|best|top|good|nice|great|beautiful|amazing|wonderful|fantastic|excellent|perfect|lovely|gorgeous|stunning|incredible|awesome|cool|interesting|famous|popular|historic|ancient|modern|traditional|local|authentic|hidden|secret|must-see|must-visit|worth|visiting|exploring|discovering|experiencing)\b',
      // 地点类型
      r'\b(cafe|cafes|coffee|coffeeshop|restaurant|restaurants|hotel|hotels|hostel|museum|museums|gallery|galleries|park|parks|garden|gardens|beach|beaches|temple|temples|shrine|shrines|church|churches|cathedral|cathedrals|mosque|mosques|palace|palaces|castle|castles|tower|towers|bridge|bridges|square|squares|street|streets|market|markets|shop|shops|store|stores|mall|malls|bar|bars|pub|pubs|club|clubs|theater|theatre|cinema|stadium|arena|zoo|aquarium|library|bookstore|bakery|pastry|dessert|ice cream|pizza|burger|sushi|ramen|noodle|dumpling|dim sum|seafood|steak|bbq|barbecue|vegetarian|vegan|brunch|breakfast|lunch|dinner|snack|drink|cocktail|wine|beer|tea|bubble tea|juice|smoothie)\b',
      // 旅行相关名词
      r'\b(place|places|spot|spots|location|locations|destination|destinations|attraction|attractions|landmark|landmarks|sight|sights|view|views|scenery|area|areas|neighborhood|neighbourhoods|district|districts|quarter|quarters|city|cities|town|towns|village|villages|country|countries|region|regions|island|islands|mountain|mountains|lake|lakes|river|rivers|ocean|sea|coast|coastline|bay|harbor|harbour|port|airport|station|terminal|stop|tour|tours|trip|trips|travel|travels|journey|journeys|adventure|adventures|vacation|vacations|holiday|holidays|getaway|escape|retreat|experience|experiences)\b',
      // 请求和疑问
      r'\b(please|want|looking|search|searching|seeking|need|help|suggest|suggestion|suggestions|idea|ideas|tip|tips|advice|guide|guides|information|info|detail|details|list|options|choice|choices|alternative|alternatives|similar|like|such as|example|examples|any|some|few|many|more|most|all|every|each|other|another|different|same|similar|nearby|close|closest|nearest|around here|in this area)\b',
    ];
    
    for (final pattern in englishPatterns) {
      if (RegExp(pattern, caseSensitive: false).hasMatch(lowerQuery)) {
        return 'en';
      }
    }
    
    // 无法确定，返回 null 使用默认设置
    return null;
  }

  /// 将 PlaceResult 转换为 Spot
  Spot _placeResultToSpot(PlaceResult place) {
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
    
    return Spot(
      id: place.id ?? place.name,
      name: place.name,
      city: place.city ?? '',
      category: (place.tags?.isNotEmpty ?? false) ? place.tags!.first : 'Place',
      latitude: place.latitude,
      longitude: place.longitude,
      rating: place.rating ?? 0.0,
      ratingCount: place.ratingCount ?? 0,
      coverImage: place.coverImage,
      images: [place.coverImage],
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
    
    // 检查是否需要从后端获取详情（有 ID 但缺少详情字段）
    final needsFetch = place.id != null && 
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
          hideCollectionEntry: true,
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
        if (result.allPlaces.isNotEmpty)
          RecommendationMapView(
            places: result.allPlaces,
            height: 200,
            onPlaceTap: _showPlaceDetail,
          ),
      ],
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
                    // 显示评分或推荐短语 - Requirements: 11.1, 11.4
                    if (widget.spot.isAIOnly || !widget.spot.hasRating)
                      Row(children: [
                        Icon(Icons.auto_awesome, size: 14, color: AppTheme.accentBlue),
                        const SizedBox(width: 4),
                        Text(widget.spot.recommendationPhrase ?? 'AI Recommended',
                          style: AppTheme.bodySmall(context).copyWith(color: Colors.white, fontWeight: FontWeight.w600)),
                      ])
                    else
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
                    DialogUtils.showSuccessSnackBar(context, _isInWishlist ? '已添加到心愿单' : '已从心愿单移除');
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


/// 地点详情加载器 - 从后端获取完整数据后显示详情
class _PlaceDetailLoader extends StatefulWidget {
  const _PlaceDetailLoader({
    required this.placeId,
    required this.fallbackPlace,
    required this.placeResultToSpot,
  });

  final String placeId;
  final PlaceResult fallbackPlace;
  final Spot Function(PlaceResult) placeResultToSpot;

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
      hideCollectionEntry: true,
    );
  }
}
