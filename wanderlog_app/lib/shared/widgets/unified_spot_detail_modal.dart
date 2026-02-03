import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/core/l10n/app_localizations.dart';
import 'package:wanderlog/core/providers/locale_provider.dart';
import 'package:wanderlog/shared/models/spot_model.dart';
import 'package:wanderlog/shared/widgets/save_spot_button.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/features/trips/providers/image_upload_provider.dart';
import 'package:wanderlog/features/ai_recognition/providers/wishlist_status_provider.dart';
import 'package:wanderlog/shared/utils/destination_utils.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';
import 'package:wanderlog/shared/utils/opening_hours_utils.dart';
import 'package:wanderlog/features/trips/presentation/widgets/myland/check_in_dialog.dart';
import 'package:wanderlog/features/collections/providers/collection_providers.dart';
import 'package:wanderlog/features/map/presentation/pages/collection_spots_map_page.dart';
import 'package:wanderlog/shared/utils/number_format_utils.dart';
import 'package:wanderlog/features/map/data/models/public_place_dto.dart';
import 'package:wanderlog/features/stills/presentation/pages/stills_list_page.dart';

/// Unified Spot Detail Modal - used by all entry points
/// Supports both spot_model.Spot and map_page.Spot (via adapter)
class UnifiedSpotDetailModal extends ConsumerStatefulWidget {
  const UnifiedSpotDetailModal({
    required this.spot,
    this.initialIsSaved,
    this.initialIsMustGo,
    this.initialIsTodaysPlan,
    this.initialIsVisited,
    this.initialVisitDate,
    this.initialUserRating,
    this.initialUserNotes,
    this.initialUserPhotos,
    this.initialDestinationId,
    this.onStatusChanged,
    this.keepOpenOnAction = false,
    this.hideCollectionEntry = false,
    this.linkedCollection,
    super.key,
  });

  // Accept either spot_model.Spot or a map_page.Spot-like object
  final dynamic spot;
  final bool? initialIsSaved;
  final bool? initialIsMustGo;
  final bool? initialIsTodaysPlan;
  final bool? initialIsVisited;
  final DateTime? initialVisitDate;
  final int? initialUserRating;
  final String? initialUserNotes;
  final List<String>? initialUserPhotos;
  final String? initialDestinationId;
  final void Function(String spotId,
      {bool? isMustGo,
      bool? isTodaysPlan,
      bool? isVisited,
      bool? isRemoved,
      bool? needsReload,
      DateTime? visitDate,
      int? userRating,
      String? userNotes,
      List<String>? userPhotos,
      String? destinationId})? onStatusChanged;
  final bool keepOpenOnAction; // If true, don't close modal after actions
  final bool
      hideCollectionEntry; // If true, don't show collection entry card (e.g. when opened from collection page)
  final Map<String, dynamic>? linkedCollection; // 预加载的关联合集数据

  @override
  ConsumerState<UnifiedSpotDetailModal> createState() =>
      _UnifiedSpotDetailModalState();
}

class _UnifiedSpotDetailModalState
    extends ConsumerState<UnifiedSpotDetailModal> {
  final PageController _imagePageController = PageController();
  int _currentImageIndex = 0;
  bool _isWishlist = false;
  bool _isMustGo = false;
  bool _isTodaysPlan = false;
  bool _isVisited = false;
  String? _destinationId;
  bool _hasStatusChanged = false;
  DateTime? _visitDate;
  int? _userRating;
  String? _userNotes;
  List<String> _userPhotos = [];
  bool _isOpeningHoursExpanded = false;
  bool _isLoadingCheckInData = false; // 新增：check-in 数据加载状态

  // 关联的合集（随机选择一个展示）
  Map<String, dynamic>? _linkedCollection;
  // 合集数据是否已加载完成
  // ignore: unused_field
  bool _isCollectionLoaded = false;

  // 实际的 place UUID（后端返回的，用于后续操作）
  String? _actualPlaceId;

  // 检查字符串是否是有效的 UUID
  bool _isValidUUID(String str) {
    final uuidRegex = RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      caseSensitive: false,
    );
    return uuidRegex.hasMatch(str);
  }

  // Adapter methods to handle different Spot types
  // 获取原始的 spot id（可能是 googlePlaceId 或 name）
  String get _originalSpotId {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).id;
    }
    try {
      return (widget.spot as dynamic).id as String;
    } catch (e) {
      return '';
    }
  }

  // 获取用于 API 调用的 spotId（优先使用后端返回的实际 UUID）
  String get _spotId => _actualPlaceId ?? _originalSpotId;

  String get _spotName {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).name;
    }
    try {
      return (widget.spot as dynamic).name as String;
    } catch (e) {
      return '';
    }
  }

  String? get _spotCity {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).city;
    }
    try {
      return (widget.spot as dynamic).city as String?;
    } catch (e) {
      return null;
    }
  }

  String? get _spotAddress {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).address;
    }
    try {
      return (widget.spot as dynamic).address as String?;
    } catch (e) {
      return null;
    }
  }

  String? get _spotDescription {
    try {
      // 优先使用 description（后台设置的描述）
      final description = (widget.spot as dynamic).description as String?;
      if (description != null && description.isNotEmpty) {
        if (!_containsChinese(description)) {
          return description;
        }
      }
      // 回退到 aiSummary（AI 生成的描述）
      final aiSummary = (widget.spot as dynamic).aiSummary as String?;
      if (aiSummary != null && aiSummary.isNotEmpty) {
        if (!_containsChinese(aiSummary)) {
          return aiSummary;
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /// 检查文本是否包含中文字符
  bool _containsChinese(String text) {
    return RegExp(r'[\u4e00-\u9fff]').hasMatch(text);
  }

  double? get _spotRating {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).rating;
    }
    try {
      return (widget.spot as dynamic).rating as double?;
    } catch (e) {
      return null;
    }
  }

  int? get _spotRatingCount {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).ratingCount;
    }
    try {
      return (widget.spot as dynamic).ratingCount as int?;
    } catch (e) {
      return null;
    }
  }

  bool get _hasValidRating {
    final rating = _spotRating;
    final count = _spotRatingCount ?? 0;
    return rating != null && rating > 0 && count > 0;
  }

  String? get _spotRecommendationPhrase {
    try {
      return (widget.spot as dynamic).recommendationPhrase as String?;
    } catch (e) {
      return null;
    }
  }

  String? get _spotGooglePlaceId {
    try {
      return (widget.spot as dynamic).googlePlaceId as String?;
    } catch (e) {
      return null;
    }
  }

  Set<String> _collectCacheKeys() {
    final keys = <String>{};
    if (_spotId.isNotEmpty) keys.add(_spotId);
    if (_originalSpotId.isNotEmpty) keys.add(_originalSpotId);
    if (_spotName.isNotEmpty) keys.add(_spotName);
    if (_actualPlaceId != null && _actualPlaceId!.isNotEmpty) {
      keys.add(_actualPlaceId!);
    }
    final googlePlaceId = _spotGooglePlaceId;
    if (googlePlaceId != null && googlePlaceId.isNotEmpty) {
      keys.add(googlePlaceId);
    }
    return keys;
  }

  void _updateWishlistCache({
    String? destinationId,
    bool? isSaved, // 新增：显式传递isSaved状态
    bool? isMustGo,
    bool? isTodaysPlan,
    bool? isVisited,
    DateTime? visitDate,
    int? userRating,
    String? userNotes,
    List<String>? userPhotos,
    bool remove = false,
  }) {
    final keys = _collectCacheKeys();
    if (keys.isEmpty) return;

    if (remove) {
      for (final key in keys) {
        WishlistStatusCache.update(key, null);
      }
      return;
    }

    final destId = destinationId ?? _destinationId;
    if (destId == null) return;

    for (final key in keys) {
      WishlistStatusCache.updateFullStatus(
        key,
        destinationId: destId,
        isSaved: isSaved, // 传递isSaved状态
        isMustGo: isMustGo,
        isTodaysPlan: isTodaysPlan,
        isVisited: isVisited,
        visitDate: visitDate,
        userRating: userRating,
        userNotes: userNotes,
        userPhotos: userPhotos,
      );
    }
  }

  void _trackPendingOperation(Future<void> operation) {
    final keys = _collectCacheKeys();
    for (final key in keys) {
      WishlistStatusCache.trackPendingOperation(key, operation);
    }
  }

  bool get _isAIOnlySpot {
    try {
      final isFromAI = (widget.spot as dynamic).isFromAI as bool?;
      final isVerified = (widget.spot as dynamic).isVerified as bool?;
      return (isFromAI ?? false) && (isVerified != true);
    } catch (e) {
      return false;
    }
  }

  /// 根据地点特征生成默认推荐短语
  String _getDefaultRecommendationPhrase() {
    final tags = _spotTags;
    final name = _spotName.toLowerCase();
    final category = _getCategory()?.toLowerCase() ?? '';

    if (tags.any((t) =>
            t.toLowerCase().contains('museum') ||
            t.toLowerCase().contains('gallery')) ||
        category.contains('museum')) {
      return 'Cultural treasure';
    }
    if (tags.any((t) =>
            t.toLowerCase().contains('temple') ||
            t.toLowerCase().contains('shrine')) ||
        category.contains('temple') ||
        category.contains('shrine')) {
      return 'Sacred landmark';
    }
    if (tags.any((t) =>
            t.toLowerCase().contains('park') ||
            t.toLowerCase().contains('garden')) ||
        category.contains('park')) {
      return 'Scenic retreat';
    }
    if (tags.any((t) =>
            t.toLowerCase().contains('cafe') ||
            t.toLowerCase().contains('coffee')) ||
        category.contains('cafe')) {
      return 'Local favorite';
    }
    if (tags.any((t) =>
            t.toLowerCase().contains('restaurant') ||
            t.toLowerCase().contains('food')) ||
        category.contains('restaurant')) {
      return 'Culinary gem';
    }
    if (name.contains('castle') || name.contains('palace')) {
      return 'Historic landmark';
    }
    if (name.contains('tower') || name.contains('view')) {
      return 'Iconic viewpoint';
    }

    final phrases = [
      'Must-visit',
      'Hidden gem',
      'Local pick',
      'Worth exploring',
      'Traveler favorite'
    ];
    return phrases[_spotName.length % phrases.length];
  }

  /// 获取后端计算好的展示标签（优先使用）
  List<String> get _spotDisplayTags {
    // 优先使用 Spot model 的 displayTagsEn 字段
    if (widget.spot is Spot) {
      final spot = widget.spot as Spot;
      if (spot.displayTagsEn != null && spot.displayTagsEn!.isNotEmpty) {
        return spot.displayTagsEn!;
      }
    }

    // 回退：尝试动态获取
    try {
      final dynamic rawTags = (widget.spot as dynamic).displayTagsEn;
      if (rawTags == null) return <String>[];

      if (rawTags is List<String>) {
        return rawTags;
      }
      if (rawTags is List) {
        // Handle List<dynamic> case
        final result = rawTags
            .map((e) => e?.toString() ?? '')
            .where((s) => s.isNotEmpty)
            .toList();
        return result;
      }
    } catch (e) {
      // 忽略错误，回退到 tags
    }
    return <String>[];
  }

  List<String> get _spotTags {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).tags;
    }
    try {
      return (widget.spot as dynamic).tags as List<String>? ?? <String>[];
    } catch (e) {
      return <String>[];
    }
  }

  String? get _spotCoverImage {
    // spot_model.Spot 没有 coverImage 字段，使用 images[0] 作为封面
    if (widget.spot is Spot) {
      final images = (widget.spot as Spot).images;
      return images.isNotEmpty ? images.first : null;
    }
    try {
      // map_page.Spot 有 coverImage 字段
      final coverImage = (widget.spot as dynamic).coverImage as String?;
      if (coverImage != null && coverImage.isNotEmpty) {
        return coverImage;
      }
      // 回退到 images[0]
      final images = (widget.spot as dynamic).images as List<String>?;
      return images != null && images.isNotEmpty ? images.first : null;
    } catch (e) {
      return null;
    }
  }

  List<String> get _spotImages {
    List<String> images;
    if (widget.spot is Spot) {
      images = (widget.spot as Spot).images;
    } else {
      try {
        images = (widget.spot as dynamic).images as List<String>? ?? <String>[];
      } catch (e) {
        images = <String>[];
      }
    }

    // 确保封面图在第一位
    final coverImage = _spotCoverImage;
    if (coverImage != null && coverImage.isNotEmpty) {
      // 如果封面图不在列表中，添加到开头
      if (!images.contains(coverImage)) {
        return [coverImage, ...images];
      }
      // 如果封面图在列表中但不是第一个，移到第一位
      if (images.isNotEmpty && images.first != coverImage) {
        final newImages = images.where((img) => img != coverImage).toList();
        return [coverImage, ...newImages];
      }
    }
    return images;
  }

  /// 获取有效的图片列表（过滤掉无效 URL）
  List<String> get _validSpotImages {
    return _spotImages.where(_isValidImageUrl).toList();
  }

  /// 检查图片 URL 是否有效
  bool _isValidImageUrl(String url) {
    if (url.isEmpty) return false;
    // 接受 data URI（base64）
    if (url.startsWith('data:image/')) return true;
    // 接受 http/https URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return false;
    }
    // 排除占位符 URL
    if (url.contains('placeholder')) return false;
    if (url.contains('example.com')) return false;
    return true;
  }

  Map<String, dynamic>? get _spotOpeningHours {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).openingHours;
    }
    try {
      return (widget.spot as dynamic).openingHours as Map<String, dynamic>?;
    } catch (e) {
      return null;
    }
  }

  /// 检查地点当前是否关门
  // ignore: unused_element
  bool get _isSpotClosed {
    final raw = _spotOpeningHours;
    if (raw == null) return false;

    final eval = OpeningHoursUtils.evaluate(
      raw,
      country: _getCountry(),
      longitude: _getLongitude(),
    );
    if (eval == null) return false;

    return !eval.isOpen;
  }

  String? get _spotPhoneNumber {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).phoneNumber;
    }
    try {
      return (widget.spot as dynamic).phoneNumber as String?;
    } catch (e) {
      return null;
    }
  }

  String? get _spotWebsite {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).website;
    }
    try {
      return (widget.spot as dynamic).website as String?;
    } catch (e) {
      return null;
    }
  }

  double _getLatitude() {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).latitude;
    }
    try {
      return (widget.spot as dynamic).latitude as double? ?? 0.0;
    } catch (e) {
      return 0.0;
    }
  }

  double _getLongitude() {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).longitude;
    }
    try {
      return (widget.spot as dynamic).longitude as double? ?? 0.0;
    } catch (e) {
      return 0.0;
    }
  }

  String? _getCountry() {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).country;
    }
    try {
      return (widget.spot as dynamic).country as String?;
    } catch (e) {
      return null;
    }
  }

  String? _getCategory() {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).category;
    }
    try {
      return (widget.spot as dynamic).category as String?;
    } catch (e) {
      return null;
    }
  }

  @override
  void initState() {
    super.initState();

    // 添加调试日志
    print('🔧 [UnifiedSpotDetailModal] initState for spot: ${_spotName}');
    print(
        '🔧 [UnifiedSpotDetailModal] initialIsSaved: ${widget.initialIsSaved}');
    print(
        '🔧 [UnifiedSpotDetailModal] initialIsMustGo: ${widget.initialIsMustGo}');
    print(
        '🔧 [UnifiedSpotDetailModal] initialIsTodaysPlan: ${widget.initialIsTodaysPlan}');
    print(
        '🔧 [UnifiedSpotDetailModal] initialIsVisited: ${widget.initialIsVisited}');
    print(
        '🔧 [UnifiedSpotDetailModal] initialVisitDate: ${widget.initialVisitDate}');
    print(
        '🔧 [UnifiedSpotDetailModal] initialUserRating: ${widget.initialUserRating}');
    print(
        '🔧 [UnifiedSpotDetailModal] initialUserNotes: ${widget.initialUserNotes}');
    print(
        '🔧 [UnifiedSpotDetailModal] initialUserPhotos: ${widget.initialUserPhotos?.length ?? 0} photos');
    print(
        '🔧 [UnifiedSpotDetailModal] initialDestinationId: ${widget.initialDestinationId}');

    final hasInitialCheckInDetails = widget.initialVisitDate != null ||
        widget.initialUserRating != null ||
        (widget.initialUserNotes != null &&
            widget.initialUserNotes!.isNotEmpty) ||
        (widget.initialUserPhotos != null &&
            widget.initialUserPhotos!.isNotEmpty);

    final shouldLoadStatus = widget.initialIsSaved == null ||
        (widget.initialIsSaved == false &&
            widget.initialDestinationId == null &&
            (widget.initialIsVisited != true) &&
            widget.initialIsMustGo == null &&
            widget.initialIsTodaysPlan == null &&
            !hasInitialCheckInDetails);

    if (!shouldLoadStatus) {
      // 使用传入的初始状态，不需要从服务器加载
      _isWishlist = widget.initialIsSaved!;
      _isMustGo = widget.initialIsMustGo ?? false;
      _isTodaysPlan = widget.initialIsTodaysPlan ?? false;
      _isVisited = widget.initialIsVisited ?? false;
      _visitDate = widget.initialVisitDate;
      _userRating = widget.initialUserRating;
      _userNotes = widget.initialUserNotes;
      _userPhotos = widget.initialUserPhotos ?? [];
      final initialDest = widget.initialDestinationId;
      _destinationId = (initialDest != null && initialDest.trim().isNotEmpty)
          ? initialDest
          : null;

      // 如果 spot.id 是 UUID，设置 _actualPlaceId
      // 这样后续操作会使用正确的 UUID
      final spotId = _originalSpotId;
      if (_isValidUUID(spotId)) {
        _actualPlaceId = spotId;
      }

      // 如果 isVisited 是 true 但缺少 check-in 详情，先尝试从缓存读取
      final hasCheckInDetails = _visitDate != null ||
          _userRating != null ||
          (_userNotes != null && _userNotes!.isNotEmpty) ||
          _userPhotos.isNotEmpty;
      if (_isVisited && !hasCheckInDetails) {
        // 尝试从 WishlistStatusCache 读取完整的 check-in 数据
        final cachedStatus = WishlistStatusCache.getFullStatus(_spotId) ??
            WishlistStatusCache.getFullStatus(_spotName);
        if (cachedStatus != null &&
            (cachedStatus.visitDate != null ||
                cachedStatus.userRating != null ||
                (cachedStatus.userNotes != null &&
                    cachedStatus.userNotes!.isNotEmpty) ||
                (cachedStatus.userPhotos != null &&
                    cachedStatus.userPhotos!.isNotEmpty))) {
          // 缓存中有 check-in 详情，直接使用
          print('✅ [UnifiedSpotDetailModal] Found check-in details in cache');
          _visitDate = cachedStatus.visitDate;
          _userRating = cachedStatus.userRating;
          _userNotes = cachedStatus.userNotes;
          _userPhotos = cachedStatus.userPhotos ?? [];
          _isLoadingCheckInData = false;
        } else {
          // 缓存中没有详情，需要从服务器加载
          print(
              '⚠️ [UnifiedSpotDetailModal] isVisited=true but missing check-in details in cache - loading from server');
          _isLoadingCheckInData = true;
          _loadWishlistStatus().then((_) {
            print(
                '✅ [UnifiedSpotDetailModal] Check-in details loaded from server');
          }).catchError((Object e) {
            print(
                '❌ [UnifiedSpotDetailModal] Failed to load check-in details: $e');
          });
        }
      } else {
        _isLoadingCheckInData = false;
        print(
            '✅ [UnifiedSpotDetailModal] Using provided initial data - no server reload needed');
      }

      // 同步更新缓存，确保一致性
      _updateWishlistCache(
        destinationId: _destinationId,
        isSaved: true, // 有初始数据说明已保存
        isMustGo: _isMustGo,
        isTodaysPlan: _isTodaysPlan,
        isVisited: _isVisited,
        visitDate: _visitDate,
        userRating: _userRating,
        userNotes: _userNotes,
        userPhotos: _userPhotos,
      );
    } else {
      print(
          '⚠️ [UnifiedSpotDetailModal] No initial data provided - will load from server/cache');
      // 没有初始数据，从缓存同步读取收藏状态，避免闪烁
      _loadWishlistStatusFromCache();
      // 异步加载详细状态（后台静默刷新，不阻塞 UI）
      print(
          '⚠️ [UnifiedSpotDetailModal] About to call _loadWishlistStatus()...');
      _loadWishlistStatus().timeout(
        const Duration(seconds: 15),
        onTimeout: () {
          print(
              '⏰ [UnifiedSpotDetailModal] _loadWishlistStatus() timeout after 15s');
          if (mounted) setState(() => _isLoadingCheckInData = false);
        },
      ).then((_) {
        print('⚠️ [UnifiedSpotDetailModal] _loadWishlistStatus() completed');
      }).catchError((Object e) {
        print('❌ [UnifiedSpotDetailModal] _loadWishlistStatus() error: $e');
        if (mounted) setState(() => _isLoadingCheckInData = false);
      });
    }

    // 处理合集入口数据
    if (widget.hideCollectionEntry) {
      // 不需要显示合集入口，标记为已加载
      _isCollectionLoaded = true;
    } else if (widget.linkedCollection != null) {
      // 使用预加载的数据
      _linkedCollection = widget.linkedCollection;
      _isCollectionLoaded = true;
    } else {
      // 需要异步加载
      _loadLinkedCollection();
    }

    // 最终状态日志
    print('🔧 [UnifiedSpotDetailModal] initState completed');
    print('🔧 [UnifiedSpotDetailModal] Final _isWishlist: $_isWishlist');
    print('🔧 [UnifiedSpotDetailModal] Final _isMustGo: $_isMustGo');
    print('🔧 [UnifiedSpotDetailModal] Final _isVisited: $_isVisited');
  }

  /// 从缓存同步读取收藏状态（立即生效，无需等待）
  void _loadWishlistStatusFromCache() {
    print(
        '🔍 [_loadWishlistStatusFromCache] Checking cache for spot: $_spotName');
    print(
        '🔍 [_loadWishlistStatusFromCache] Keys to check: ${_collectCacheKeys()}');

    // 1. 首先尝试从同步缓存读取完整状态（最快，无延迟）
    // 尝试使用 _spotId（可能是 UUID 或 googlePlaceId）
    var fullStatus = WishlistStatusCache.getFullStatus(_spotId);
    print(
        '🔍 [_loadWishlistStatusFromCache] Cache check _spotId=$_spotId: ${fullStatus?.destinationId}');
    if (fullStatus != null && fullStatus.destinationId != null) {
      print('✅ [_loadWishlistStatusFromCache] Found in cache by _spotId!');
      // 立即应用缓存数据，包括 check-in 详情
      if (mounted) {
        final status = fullStatus; // Capture non-null value
        setState(() {
          _isWishlist = true;
          _destinationId = status.destinationId;
          _isMustGo = status.isMustGo;
          _isTodaysPlan = status.isTodaysPlan;
          _isVisited = status.isVisited;
          _visitDate = status.visitDate;
          _userRating = status.userRating;
          _userNotes = status.userNotes;
          _userPhotos = status.userPhotos ?? [];
          _isLoadingCheckInData = false;
        });
      }
      return;
    }

    // 如果 _spotId 是 UUID，也尝试使用 googlePlaceId 查找
    if (_isValidUUID(_spotId)) {
      try {
        final googlePlaceId = (widget.spot as dynamic).googlePlaceId as String?;
        if (googlePlaceId != null && googlePlaceId != _spotId) {
          fullStatus = WishlistStatusCache.getFullStatus(googlePlaceId);
          print(
              '🔍 [_loadWishlistStatusFromCache] Cache check googlePlaceId=$googlePlaceId: ${fullStatus?.destinationId}');
          if (fullStatus != null && fullStatus.destinationId != null) {
            print(
                '✅ [_loadWishlistStatusFromCache] Found in cache by googlePlaceId!');
            if (mounted) {
              final status = fullStatus; // Capture non-null value
              setState(() {
                _isWishlist = true;
                _destinationId = status.destinationId;
                _isMustGo = status.isMustGo;
                _isTodaysPlan = status.isTodaysPlan;
                _isVisited = status.isVisited;
                _visitDate = status.visitDate;
                _userRating = status.userRating;
                _userNotes = status.userNotes;
                _userPhotos = status.userPhotos ?? [];
                _isLoadingCheckInData = false;
              });
            }
            return;
          }
        }
      } catch (_) {}
    }

    // 如果 _spotId 是 googlePlaceId，也尝试使用 UUID 查找（如果 _actualPlaceId 存在）
    if (_actualPlaceId != null && _actualPlaceId != _spotId) {
      fullStatus = WishlistStatusCache.getFullStatus(_actualPlaceId!);
      print(
          '🔍 [_loadWishlistStatusFromCache] Cache check _actualPlaceId=$_actualPlaceId: ${fullStatus?.destinationId}');
      if (fullStatus != null && fullStatus.destinationId != null) {
        print(
            '✅ [_loadWishlistStatusFromCache] Found in cache by _actualPlaceId!');
        if (mounted) {
          final status = fullStatus; // Capture non-null value
          setState(() {
            _isWishlist = true;
            _destinationId = status.destinationId;
            _isMustGo = status.isMustGo;
            _isTodaysPlan = status.isTodaysPlan;
            _isVisited = status.isVisited;
            _visitDate = status.visitDate;
            _userRating = status.userRating;
            _userNotes = status.userNotes;
            _userPhotos = status.userPhotos ?? [];
            _isLoadingCheckInData = false;
          });
        }
        return;
      }
    }

    // 也尝试使用名称查找
    fullStatus = WishlistStatusCache.getFullStatus(_spotName);
    print(
        '🔍 [_loadWishlistStatusFromCache] Cache check name=$_spotName: ${fullStatus?.destinationId}');
    if (fullStatus != null && fullStatus.destinationId != null) {
      print('✅ [_loadWishlistStatusFromCache] Found in cache by name!');
      if (mounted) {
        final status = fullStatus; // Capture non-null value
        setState(() {
          _isWishlist = true;
          _destinationId = status.destinationId;
          _isMustGo = status.isMustGo;
          _isTodaysPlan = status.isTodaysPlan;
          _isVisited = status.isVisited;
          _visitDate = status.visitDate;
          _userRating = status.userRating;
          _userNotes = status.userNotes;
          _userPhotos = status.userPhotos ?? [];
          _isLoadingCheckInData = false;
        });
      }
      return;
    }

    print('❌ [_loadWishlistStatusFromCache] Not found in cache');

    // 2. 尝试从基础缓存读取
    var (isInCache, cachedDestId) = WishlistStatusCache.check(_spotId);
    if (!isInCache && _actualPlaceId != null && _actualPlaceId != _spotId) {
      (isInCache, cachedDestId) = WishlistStatusCache.check(_actualPlaceId!);
    }
    if (!isInCache) {
      try {
        final googlePlaceId = (widget.spot as dynamic).googlePlaceId as String?;
        if (googlePlaceId != null && googlePlaceId != _spotId) {
          (isInCache, cachedDestId) = WishlistStatusCache.check(googlePlaceId);
        }
      } catch (_) {}
    }
    if (isInCache) {
      _isWishlist = true;
      _destinationId = cachedDestId;
      return;
    }

    // 3. 回退到 FutureProvider 缓存
    final statusAsync = ref.read(wishlistStatusProvider);
    statusAsync.whenData((statusMap) {
      var (isInWishlist, destId) = checkWishlistStatus(statusMap, _spotId);
      if (!isInWishlist &&
          _actualPlaceId != null &&
          _actualPlaceId != _spotId) {
        (isInWishlist, destId) =
            checkWishlistStatus(statusMap, _actualPlaceId!);
      }
      if (!isInWishlist) {
        try {
          final googlePlaceId =
              (widget.spot as dynamic).googlePlaceId as String?;
          if (googlePlaceId != null && googlePlaceId != _spotId) {
            (isInWishlist, destId) =
                checkWishlistStatus(statusMap, googlePlaceId);
          }
        } catch (_) {}
      }
      if (isInWishlist) {
        _isWishlist = true;
        _destinationId = destId;
      }
    });
  }

  @override
  void dispose() {
    _imagePageController.dispose();
    super.dispose();
  }

  Uint8List? _decodeBase64Image(String dataUri) {
    try {
      final base64Data = dataUri.split(',').last;
      return base64Decode(base64Data);
    } catch (e) {
      return null;
    }
  }

  void _viewUserPhotoFullScreen(String imageUrl) {
    showDialog<void>(
      context: context,
      builder: (context) => Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: EdgeInsets.zero,
        child: Stack(
          children: [
            GestureDetector(
              onTap: () => Navigator.pop(context),
              child: Container(
                color: Colors.black87,
                child: Center(
                  child: InteractiveViewer(
                    child: imageUrl.startsWith('data:')
                        ? Image.memory(_decodeBase64Image(imageUrl)!)
                        : Image.network(imageUrl, fit: BoxFit.contain),
                  ),
                ),
              ),
            ),
            Positioned(
              top: 40,
              right: 20,
              child: IconButton(
                icon: const Icon(
                  Icons.close,
                  color: Colors.white,
                  size: 32,
                ),
                onPressed: () => Navigator.pop(context),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// 显示全屏图片查看器，支持左右滑动查看多张图片
  void _showFullScreenImage(int initialIndex) {
    if (_validSpotImages.isEmpty) return;

    showDialog<void>(
      context: context,
      barrierColor: Colors.black,
      builder: (context) {
        final pageController = PageController(initialPage: initialIndex);
        int currentIndex = initialIndex;

        return StatefulBuilder(
          builder: (context, setDialogState) => Dialog(
            backgroundColor: Colors.transparent,
            insetPadding: EdgeInsets.zero,
            child: Stack(
              children: [
                // 全屏图片轮播
                PageView.builder(
                  controller: pageController,
                  itemCount: _validSpotImages.length,
                  onPageChanged: (index) {
                    setDialogState(() {
                      currentIndex = index;
                    });
                  },
                  itemBuilder: (context, index) {
                    final imageUrl = _validSpotImages[index];
                    return GestureDetector(
                      onTap: () => Navigator.pop(context),
                      child: Container(
                        color: Colors.black,
                        // 添加左右边距，图片居中显示
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Center(
                          child: InteractiveViewer(
                            minScale: 0.5,
                            maxScale: 3.0,
                            child: ClipRRect(
                              borderRadius:
                                  BorderRadius.circular(24), // 24px 圆角
                              child: imageUrl.startsWith('data:')
                                  ? Image.memory(
                                      _decodeBase64Image(imageUrl)!,
                                      fit: BoxFit.contain,
                                      errorBuilder:
                                          (context, error, stackTrace) =>
                                              Container(
                                        width: double.infinity,
                                        height: double.infinity,
                                        decoration: BoxDecoration(
                                          color: Colors.black,
                                          borderRadius:
                                              BorderRadius.circular(24),
                                        ),
                                        child: const Center(
                                          child: Icon(
                                            Icons.broken_image,
                                            color: Colors.white54,
                                            size: 64,
                                          ),
                                        ),
                                      ),
                                    )
                                  : Image.network(
                                      imageUrl,
                                      fit: BoxFit.contain,
                                      errorBuilder:
                                          (context, error, stackTrace) =>
                                              Container(
                                        width: double.infinity,
                                        height: double.infinity,
                                        decoration: BoxDecoration(
                                          color: Colors.black,
                                          borderRadius:
                                              BorderRadius.circular(24),
                                        ),
                                        child: const Center(
                                          child: Icon(
                                            Icons.broken_image,
                                            color: Colors.white54,
                                            size: 64,
                                          ),
                                        ),
                                      ),
                                    ),
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
                // 关闭按钮
                Positioned(
                  top: 40,
                  right: 20,
                  child: IconButton(
                    icon: const Icon(
                      Icons.close,
                      color: Colors.white,
                      size: 32,
                    ),
                    onPressed: () => Navigator.pop(context),
                  ),
                ),
                // 图片指示器（多张图片时显示）
                if (_validSpotImages.length > 1)
                  Positioned(
                    bottom: 40,
                    left: 0,
                    right: 0,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(
                        _validSpotImages.length,
                        (index) => Container(
                          margin: const EdgeInsets.symmetric(horizontal: 4),
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: index == currentIndex
                                ? AppTheme.primaryYellow
                                : Colors.white.withOpacity(0.5),
                            border: Border.all(
                              color: Colors.white,
                              width: 1,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildPlaceholder() => Container(
        decoration: const BoxDecoration(
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
          color: AppTheme.lightGray,
        ),
        child: const Center(
          child:
              Icon(Icons.image_outlined, size: 64, color: AppTheme.mediumGray),
        ),
      );

  List<String> _effectiveTags() {
    final List<String> result = [];
    final Set<String> seen = {};

    bool isValidTag(String tag) {
      final lower = tag.toLowerCase().trim();
      if (lower.isEmpty) return false;
      if (lower == 'place') return false;
      return true;
    }

    // 1. 优先使用后端计算好的 displayTagsEn
    final displayTags = _spotDisplayTags;
    if (displayTags.isNotEmpty) {
      for (final tag in displayTags) {
        if (result.length >= 4) break;
        if (!isValidTag(tag)) continue;
        final key = tag.toLowerCase();
        if (seen.add(key)) {
          result.add(tag);
        }
      }
      if (result.isNotEmpty) {
        return result;
      }
    }

    // 2. 回退：先添加分类
    final category = _getCategory();
    if (category != null && isValidTag(category)) {
      final key = category.toLowerCase();
      if (seen.add(key)) {
        result.add(category);
      }
    }

    // 3. 添加 tags
    final tags = _spotTags;
    for (final tag in tags) {
      if (result.length >= 4) break;

      String tagStr = tag;
      // 处理可能的 JSON 对象格式
      if (tag.startsWith('{') && tag.contains('en:')) {
        final match = RegExp(r'en:\s*([^,}]+)').firstMatch(tag);
        if (match != null) {
          tagStr = match.group(1)?.trim() ?? tag;
        }
      }

      if (!isValidTag(tagStr)) continue;
      final key = tagStr.toLowerCase();
      if (seen.add(key)) {
        result.add(tagStr);
      }
    }

    // 4. 尝试从 spot 对象获取 aiTags
    try {
      final dynamic aiTags = (widget.spot as dynamic).aiTags;
      if (aiTags is List) {
        for (final tag in aiTags) {
          if (result.length >= 4) break;
          String tagStr = '';
          if (tag is Map) {
            tagStr = tag['en']?.toString() ?? '';
          } else if (tag is String) {
            tagStr = tag;
          }
          if (tagStr.isNotEmpty) {
            if (!isValidTag(tagStr)) continue;
            final key = tagStr.toLowerCase();
            if (seen.add(key)) {
              result.add(tagStr);
            }
          }
        }
      }
    } catch (_) {}

    return result;
  }

  Future<void> _loadWishlistStatus() async {
    // 注意：不再检查 authProvider.isAuthenticated，因为可能存在 keychain 同步问题
    // 让 API 请求自己处理认证，如果没有权限会返回空数据或错误
    print(
        '🔍 [UnifiedSpotDetailModal] _loadWishlistStatus started for: $_spotName');
    print('🔍 [UnifiedSpotDetailModal] _originalSpotId: $_originalSpotId');
    try {
      final repo = ref.read(tripRepositoryProvider);
      // 强制从服务器获取最新数据，不使用缓存
      // 这确保编辑 check-in 后能看到最新数据
      print('🔍 [UnifiedSpotDetailModal] Calling repo.getMyTrips()...');
      final trips = await repo.getMyTrips().timeout(
        const Duration(seconds: 5),
        onTimeout: () {
          print('⏰ [UnifiedSpotDetailModal] getMyTrips timeout');
          return [];
        },
      );

      print('📋 [UnifiedSpotDetailModal] Got ${trips.length} trips');
      if (trips.isEmpty) {
        print('⚠️ [UnifiedSpotDetailModal] No trips found, returning');
        if (mounted) setState(() => _isLoadingCheckInData = false);
        return;
      }

      for (final t in trips) {
        try {
          print(
              '📍 [UnifiedSpotDetailModal] Fetching trip detail for "${t.name}" (${t.id})...');
          final detail = await repo.getTripById(t.id).timeout(
            const Duration(seconds: 3),
            onTimeout: () {
              print(
                  '⏰ [UnifiedSpotDetailModal] getTripById timeout for ${t.name}');
              throw TimeoutException('Trip detail timeout');
            },
          );
          final tripSpots = detail.tripSpots ?? [];
          print(
              '📍 [UnifiedSpotDetailModal] Trip "${t.name}" has ${tripSpots.length} tripSpots');

          // 打印所有 tripSpots 的基本信息以便调试
          for (int i = 0; i < tripSpots.length && i < 10; i++) {
            final ts = tripSpots[i];
            print(
                '   [$i] spotId=${ts.spotId}, name="${ts.spot?.name ?? "unknown"}", googlePlaceId=${ts.spot?.googlePlaceId}');
          }

          final tripSpot = tripSpots.firstWhere(
            (ts) {
              // 匹配 spotId（UUID）或 googlePlaceId
              final matchBySpotId = ts.spotId == _originalSpotId;
              // 也检查 spot 的 googlePlaceId
              final spotGoogleId = ts.spot?.googlePlaceId;
              final matchByGooglePlaceId =
                  spotGoogleId != null && spotGoogleId == _originalSpotId;
              // 也检查 name 匹配（用于处理 ID 不一致的情况）
              final tsSpotName = ts.spot?.name ?? '';
              final matchByName = tsSpotName.isNotEmpty &&
                  tsSpotName.toLowerCase() == _spotName.toLowerCase();

              // 详细日志 - 对名称相似的地点输出比较信息
              final searchPrefix = _spotName.length >= 5
                  ? _spotName.toLowerCase().substring(0, 5)
                  : _spotName.toLowerCase();
              if (tsSpotName.toLowerCase().contains(searchPrefix)) {
                print('🔍 [UnifiedSpotDetailModal] Comparing "$tsSpotName":');
                print(
                    '    ts.spotId=${ts.spotId}, _originalSpotId=$_originalSpotId, match=$matchBySpotId');
                print(
                    '    ts.spot.googlePlaceId=$spotGoogleId, match=$matchByGooglePlaceId');
                print('    matchByName=$matchByName');
                print(
                    '    ts.isSaved=${ts.isSaved}, ts.isVisited=${ts.isVisited}');
                print(
                    '    ts.visitDate=${ts.visitDate}, ts.userRating=${ts.userRating}, ts.userNotes=${ts.userNotes}');
              }

              if (matchBySpotId) return true;
              if (matchByGooglePlaceId) return true;
              if (matchByName) return true;
              return false;
            },
            orElse: () => throw StateError('not found'),
          );
          // tripSpot 匹配成功
          _destinationId = detail.id;
          // 保存实际的 place UUID，用于后续操作
          _actualPlaceId = tripSpot.spotId;
          print(
              '🎯 [UnifiedSpotDetailModal] Before setState: mounted=$mounted, _isWishlist=$_isWishlist');
          print(
              '🎯 [UnifiedSpotDetailModal] tripSpot.isSaved=${tripSpot.isSaved}, tripSpot.isVisited=${tripSpot.isVisited}');
          print('🎯 [UnifiedSpotDetailModal] tripSpot check-in details:');
          print('    visitDate=${tripSpot.visitDate}');
          print('    userRating=${tripSpot.userRating}');
          print('    userNotes=${tripSpot.userNotes}');
          print('    userPhotos=${tripSpot.userPhotos?.length ?? 0} photos');

          // 直接更新状态变量
          _isWishlist = tripSpot.isSaved;
          _isMustGo = tripSpot.isMustGo;
          _isTodaysPlan = tripSpot.isTodaysPlan;
          _isVisited = tripSpot.isVisited;
          _visitDate = tripSpot.visitDate;
          _userRating = tripSpot.userRating;
          _userNotes = tripSpot.userNotes;
          _userPhotos = tripSpot.userPhotos ?? [];
          _isLoadingCheckInData = false;

          print('🎯 [UnifiedSpotDetailModal] After assignment:');
          print(
              '    _visitDate=$_visitDate, _userRating=$_userRating, _userNotes=$_userNotes, _userPhotos=${_userPhotos.length}');

          // 使用 addPostFrameCallback 确保 setState 在正确的时机执行
          if (mounted) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) {
                setState(() {
                  print(
                      '🎯 [UnifiedSpotDetailModal] Inside setState callback: _isWishlist=$_isWishlist, _isVisited=$_isVisited');
                });
              }
            });
          }
          print(
              '✅ [UnifiedSpotDetailModal] After setting values: _isWishlist=$_isWishlist, _isVisited=$_isVisited');
          // 更新缓存，包含完整 check-in 数据，确保下次打开时能正确读取
          _updateWishlistCache(
            destinationId: detail.id,
            isSaved: tripSpot.isSaved, // 从后端读取isSaved状态
            isMustGo: tripSpot.isMustGo,
            isTodaysPlan: tripSpot.isTodaysPlan,
            isVisited: tripSpot.isVisited,
            visitDate: tripSpot.visitDate,
            userRating: tripSpot.userRating,
            userNotes: tripSpot.userNotes,
            userPhotos: tripSpot.userPhotos,
          );
          return;
        } catch (tripError) {
          // 这个 trip 中没有找到匹配的 tripSpot，继续查找下一个 trip
          print(
              '⚠️ [UnifiedSpotDetailModal] Trip "${t.name}" error or no match: $tripError');
        }
      }

      // 如果没有找到数据，也要清除加载状态
      print(
          '❌ [UnifiedSpotDetailModal] No matching tripSpot found in any trip');
      if (mounted) {
        setState(() {
          _isLoadingCheckInData = false;
        });
      }
    } catch (e, stackTrace) {
      print('❌ [UnifiedSpotDetailModal] Error loading wishlist status: $e');
      print('❌ [UnifiedSpotDetailModal] Stack trace: $stackTrace');
      if (mounted) {
        setState(() {
          _isLoadingCheckInData = false;
        });
      }
    }
  }

  /// 加载地点关联的合集（随机选择一个展示）
  Future<void> _loadLinkedCollection() async {
    // 只有当 spotId 是有效的 UUID 时才调用 API
    // 如果是 googlePlaceId 格式，跳过加载（会在 _loadWishlistStatus 后再尝试）
    final currentSpotId = _spotId;
    if (!_isValidUUID(currentSpotId)) {
      print(
          '⚠️ [UnifiedSpotDetailModal] Skipping collection load - spotId is not UUID: $currentSpotId');
      setState(() {
        _isCollectionLoaded = true;
      });
      return;
    }

    try {
      final repo = ref.read(collectionRepositoryProvider);
      final collections = await repo.getCollectionsForPlace(currentSpotId);

      if (mounted) {
        if (collections.isNotEmpty) {
          // 随机选择一个合集展示
          final random = math.Random();
          final selectedCollection =
              collections[random.nextInt(collections.length)];
          setState(() {
            _linkedCollection = selectedCollection;
            _isCollectionLoaded = true;
          });
        } else {
          setState(() {
            _isCollectionLoaded = true;
          });
        }
      }
    } catch (e) {
      // 静默失败，标记为已加载
      print('⚠️ Failed to load linked collection: $e');
      if (mounted) {
        setState(() {
          _isCollectionLoaded = true;
        });
      }
    }
  }

  void _copyToClipboard(String text, String label) {
    Clipboard.setData(ClipboardData(text: text));
    final l10n = AppLocalizations(ref.read(localeProvider).languageCode);
    CustomToast.showSuccess(context, l10n.copySuccess);
  }

  Widget _buildCheckInButton() => GestureDetector(
        onTap: _isVisited ? null : _handleCheckIn,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: AppTheme.white,
            borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
            border:
                Border.all(color: AppTheme.black, width: AppTheme.borderMedium),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_isVisited) ...[
                const Text('✓',
                    style: TextStyle(fontSize: 14, color: AppTheme.black)),
                const SizedBox(width: 4),
              ],
              Text(
                _isVisited ? 'Checked in' : 'Check in',
                style: AppTheme.labelSmall(context).copyWith(
                  color: AppTheme.black,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      );

  Future<void> _handleCheckIn() async {
    final authed = await requireAuth(context, ref);
    if (!authed) return;
    if (!context.mounted) return;

    final now = DateTime.now();
    final spotModel = Spot(
      id: _spotId,
      googlePlaceId: _spotId,
      name: _spotName,
      city: _spotCity ?? '',
      latitude: _getLatitude(),
      longitude: _getLongitude(),
      tags: _spotTags,
      images: _spotImages,
      rating: _spotRating,
      ratingCount: _spotRatingCount,
      category: _getCategory(),
      createdAt: now,
      updatedAt: now,
    );

    showDialog<void>(
      context: context,
      builder: (context) => CheckInDialog(
        spot: spotModel,
        onCheckIn: (visitDate, rating, notes,
            {List<File>? newImages, List<String>? existingPhotos}) async {
          // Optimistic update - immediately show checked in state
          if (mounted) {
            setState(() {
              _isVisited = true;
              _visitDate = visitDate;
              _userRating = rating.toInt();
              _userNotes = notes;
              _userPhotos = [...?existingPhotos];
            });
          }
          CustomToast.showSuccess(this.context, 'Checked in to $_spotName');

          try {
            final rawCity = (_spotCity ?? '').trim();
            final rawCountry = (_getCountry() ?? '').trim();
            final destinationCity = rawCity.isNotEmpty
                ? rawCity
                : (rawCountry.isNotEmpty ? rawCountry : 'Unknown');
            final destId =
                (_destinationId != null && _destinationId!.trim().isNotEmpty)
                    ? _destinationId
                    : await ensureDestinationForCity(ref, destinationCity);
            if (destId == null) {
              // Revert on error
              if (mounted) {
                setState(() {
                  _isVisited = false;
                  _visitDate = null;
                  _userRating = null;
                  _userNotes = null;
                  _userPhotos = [];
                });
              }
              CustomToast.showError(
                  this.context, 'Failed to create destination');
              return;
            }
            _destinationId = destId;

            // Upload new images if any
            List<String> allPhotoUrls = [...?existingPhotos];
            if (newImages != null && newImages.isNotEmpty) {
              final uploadService = ref.read(imageUploadServiceProvider);
              final uploadedUrls = await uploadService.uploadImages(newImages);
              allPhotoUrls.addAll(uploadedUrls);
              // Update UI with uploaded photos
              if (mounted) {
                setState(() {
                  _userPhotos = allPhotoUrls;
                });
              }
            }

            // 使用新的布尔字段，check-in 时保留 isTodaysPlan 状态
            final updatedTripSpot =
                await ref.read(tripRepositoryProvider).manageTripSpot(
                      tripId: destId,
                      spotId: _spotId,
                      isSaved: _isWishlist,
                      isVisited: true,
                      // 不修改 isTodaysPlan，保留原状态
                      visitDate: visitDate,
                      userRating: rating.toInt(),
                      userNotes: notes,
                      userPhotos: allPhotoUrls.isNotEmpty ? allPhotoUrls : null,
                      spotPayload: _spotPayload(),
                    );
            if (mounted && updatedTripSpot != null) {
              final returnedSpotId = updatedTripSpot.spotId;
              if (_isValidUUID(returnedSpotId)) {
                _actualPlaceId = returnedSpotId;
              }
              _destinationId = updatedTripSpot.tripId;
              setState(() {
                _isVisited = updatedTripSpot.isVisited;
                _visitDate = updatedTripSpot.visitDate ?? _visitDate;
                _userRating = updatedTripSpot.userRating ?? _userRating;
                _userNotes = updatedTripSpot.userNotes ?? _userNotes;
                _userPhotos = updatedTripSpot.userPhotos ?? _userPhotos;
              });
            }
            // 立即更新同步缓存，避免下次打开时闪烁
            _updateWishlistCache(
              destinationId: destId,
              isSaved: _isWishlist,
              isMustGo: _isMustGo,
              isTodaysPlan: _isTodaysPlan, // 保留原状态
              isVisited: true,
              visitDate: visitDate,
              userRating: rating.toInt(),
              userNotes: notes,
              userPhotos: allPhotoUrls.isNotEmpty ? allPhotoUrls : null,
            );
            ref.invalidate(tripsProvider);
            ref.invalidate(wishlistStatusProvider);
            // 通知父组件重新加载数据，以确保 visited 列表更新
            widget.onStatusChanged?.call(
              _spotId,
              isVisited: true,
              needsReload: true,
              visitDate: updatedTripSpot?.visitDate ?? visitDate,
              userRating: updatedTripSpot?.userRating ?? rating.toInt(),
              userNotes: updatedTripSpot?.userNotes ?? notes,
              userPhotos: updatedTripSpot?.userPhotos ??
                  (allPhotoUrls.isNotEmpty ? allPhotoUrls : null),
              destinationId: updatedTripSpot?.tripId ?? destId,
            );
          } catch (e) {
            // Revert on error
            if (mounted) {
              setState(() {
                _isVisited = false;
                _visitDate = null;
                _userRating = null;
                _userNotes = null;
                _userPhotos = [];
              });
            }
            CustomToast.showError(this.context, 'Error: $e');
          }
        },
      ),
    );
  }

  Future<void> _handleEditCheckIn() async {
    if (!_isVisited) return;

    final now = DateTime.now();
    final spotModel = Spot(
      id: _spotId,
      googlePlaceId: _spotId,
      name: _spotName,
      city: _spotCity ?? '',
      latitude: _getLatitude(),
      longitude: _getLongitude(),
      tags: _spotTags,
      images: _spotImages,
      rating: _spotRating,
      ratingCount: _spotRatingCount,
      category: _getCategory(),
      createdAt: now,
      updatedAt: now,
    );

    showDialog<void>(
      context: context,
      builder: (context) => CheckInDialog(
        spot: spotModel,
        isEditMode: true,
        initialVisitDate: _visitDate,
        initialRating: _userRating?.toDouble(),
        initialNotes: _userNotes,
        initialPhotos: _userPhotos.isNotEmpty ? _userPhotos : null,
        onCheckIn: (visitDate, rating, notes,
            {List<File>? newImages, List<String>? existingPhotos}) async {
          try {
            if (_destinationId == null) {
              CustomToast.showError(context, 'Destination not found');
              return;
            }

            // 1. 立即更新本地状态（乐观更新）- 用户立即看到变化
            List<String> allPhotoUrls = [...?existingPhotos];
            if (mounted) {
              setState(() {
                _visitDate = visitDate;
                _userRating = rating.toInt();
                _userNotes = notes;
                _userPhotos = allPhotoUrls;
              });
              CustomToast.showSuccess(context, 'Check-in updated');
            }

            // 2. 在后台上传新图片（如果有）
            if (newImages != null && newImages.isNotEmpty) {
              final uploadService = ref.read(imageUploadServiceProvider);
              final uploadedUrls = await uploadService.uploadImages(newImages);
              allPhotoUrls.addAll(uploadedUrls);

              // 更新照片列表
              if (mounted) {
                setState(() {
                  _userPhotos = allPhotoUrls;
                });
              }
            }

            // 3. 在后台同步到服务器 - 使用新的布尔字段
            final updatedTripSpot =
                await ref.read(tripRepositoryProvider).manageTripSpot(
                      tripId: _destinationId!,
                      spotId: _spotId,
                      isVisited: true,
                      // 不修改 isTodaysPlan，保留原状态
                      visitDate: visitDate,
                      userRating: rating.toInt(),
                      userNotes: notes,
                      userPhotos: allPhotoUrls.isNotEmpty ? allPhotoUrls : null,
                    );
            if (mounted && updatedTripSpot != null) {
              final returnedSpotId = updatedTripSpot.spotId;
              if (_isValidUUID(returnedSpotId)) {
                _actualPlaceId = returnedSpotId;
              }
              _destinationId = updatedTripSpot.tripId;
              setState(() {
                _isVisited = updatedTripSpot.isVisited;
                _visitDate = updatedTripSpot.visitDate ?? _visitDate;
                _userRating = updatedTripSpot.userRating ?? _userRating;
                _userNotes = updatedTripSpot.userNotes ?? _userNotes;
                _userPhotos = updatedTripSpot.userPhotos ?? _userPhotos;
              });
            }

            // 4. 同步更新缓存，确保再次进入时展示最新数据
            _updateWishlistCache(
              destinationId: _destinationId,
              isSaved: true, // 编辑check-in时必然已保存
              isMustGo: _isMustGo,
              isTodaysPlan: _isTodaysPlan,
              isVisited: true,
              visitDate: visitDate,
              userRating: rating.toInt(),
              userNotes: notes,
              userPhotos: allPhotoUrls.isNotEmpty ? allPhotoUrls : null,
            );

            // 4. 刷新缓存，确保其他页面也能看到最新数据
            ref.invalidate(tripsProvider);
            ref.invalidate(wishlistStatusProvider);

            // 5. 通知父组件更新，需要重新加载以显示最新数据
            widget.onStatusChanged?.call(
              _spotId,
              isVisited: true,
              needsReload: true,
              visitDate: updatedTripSpot?.visitDate ?? visitDate,
              userRating: updatedTripSpot?.userRating ?? rating.toInt(),
              userNotes: updatedTripSpot?.userNotes ?? notes,
              userPhotos: updatedTripSpot?.userPhotos ??
                  (allPhotoUrls.isNotEmpty ? allPhotoUrls : null),
              destinationId: updatedTripSpot?.tripId ?? _destinationId,
            );
          } catch (e) {
            // 如果服务器同步失败，回滚本地状态
            if (mounted) {
              setState(() {
                _visitDate = widget.initialVisitDate;
                _userRating = widget.initialUserRating;
                _userNotes = widget.initialUserNotes;
                _userPhotos = widget.initialUserPhotos ?? [];
              });
            }
            CustomToast.showError(context, 'Error: $e');
          }
        },
      ),
    );
  }

  Future<void> _handleDeleteCheckIn() async {
    if (!_isVisited || _destinationId == null) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppTheme.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
          side: const BorderSide(
              color: AppTheme.black, width: AppTheme.borderMedium),
        ),
        title: Text(
          'Delete Check-in',
          style: AppTheme.headlineMedium(context)
              .copyWith(fontWeight: FontWeight.bold),
        ),
        content: Text(
          'Are you sure you want to delete this check-in? This action cannot be undone.',
          style: AppTheme.bodyMedium(context),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(
              'Cancel',
              style: AppTheme.labelLarge(context).copyWith(
                color: AppTheme.black,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primaryYellow,
              foregroundColor: AppTheme.black,
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                side: const BorderSide(
                    color: AppTheme.black, width: AppTheme.borderMedium),
              ),
            ),
            child: Text(
              'Delete',
              style: AppTheme.labelLarge(context).copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
    );

    if (confirmed ?? false) {
      try {
        await ref.read(tripRepositoryProvider).manageTripSpot(
              tripId: _destinationId!,
              spotId: _spotId,
              remove: true,
            );
        // 立即更新同步缓存，避免下次打开时闪烁
        _updateWishlistCache(remove: true);
        ref.invalidate(tripsProvider);
        ref.invalidate(wishlistStatusProvider);
        if (mounted) {
          setState(() {
            _isVisited = false;
            _visitDate = null;
            _userRating = null;
            _userNotes = null;
            _userPhotos = [];
            _isWishlist = false;
          });
          CustomToast.showSuccess(context, 'Check-in deleted');
          widget.onStatusChanged?.call(
            _spotId,
            isVisited: false,
            isRemoved: true,
            needsReload: true,
            visitDate: null,
            userRating: null,
            userNotes: null,
            userPhotos: const [],
            destinationId: _destinationId,
          );
        }
      } catch (e) {
        CustomToast.showError(context, 'Error: $e');
      }
    }
  }

  /// 构建 check-in 数据加载骨架屏
  Widget _buildCheckInLoadingSkeleton() => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppTheme.background,
          borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
          border: Border.all(color: AppTheme.black, width: AppTheme.borderThin),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text('✓', style: TextStyle(fontSize: 20)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Your Visit',
                    style: AppTheme.headlineMedium(context)
                        .copyWith(fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            // 骨架屏：模拟加载中的内容
            Container(
              height: 16,
              width: double.infinity,
              decoration: BoxDecoration(
                color: AppTheme.mediumGray.withOpacity(0.3),
                borderRadius: BorderRadius.circular(4),
              ),
            ),
            const SizedBox(height: 8),
            Container(
              height: 16,
              width: 200,
              decoration: BoxDecoration(
                color: AppTheme.mediumGray.withOpacity(0.3),
                borderRadius: BorderRadius.circular(4),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Container(
                  height: 14,
                  width: 80,
                  decoration: BoxDecoration(
                    color: AppTheme.mediumGray.withOpacity(0.3),
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                const SizedBox(width: 12),
                ...List.generate(
                  5,
                  (index) => Padding(
                    padding: const EdgeInsets.only(right: 4),
                    child: Icon(
                      Icons.star_border,
                      size: 16,
                      color: AppTheme.mediumGray.withOpacity(0.3),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      );

  Widget _buildUserCheckInInfo() {
    final hasVisitDate = _visitDate != null;
    final hasRating = _userRating != null && _userRating! > 0;
    final hasNotes = _userNotes != null && _userNotes!.isNotEmpty;
    final hasPhotos = _userPhotos.isNotEmpty;
    final hasAnyInfo = hasVisitDate || hasRating || hasNotes || hasPhotos;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.background,
        borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
        border: Border.all(color: AppTheme.black, width: AppTheme.borderThin),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('✓', style: TextStyle(fontSize: 20)),
              const SizedBox(width: 8),
              Expanded(
                child: Text('Your Visit',
                    style: AppTheme.headlineMedium(context)
                        .copyWith(fontWeight: FontWeight.bold)),
              ),
              GestureDetector(
                onTap: _handleEditCheckIn,
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppTheme.background,
                    borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                    border: Border.all(
                        color: AppTheme.black, width: AppTheme.borderThin),
                  ),
                  child:
                      const Icon(Icons.edit, size: 18, color: AppTheme.black),
                ),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: _handleDeleteCheckIn,
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppTheme.background,
                    borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                    border: Border.all(
                        color: AppTheme.black, width: AppTheme.borderThin),
                  ),
                  child: const Icon(Icons.delete_outline,
                      size: 18, color: AppTheme.black),
                ),
              ),
            ],
          ),
          // 如果没有任何信息，显示提示
          if (!hasAnyInfo) ...[
            const SizedBox(height: 12),
            Text(
              'Tap edit to add your visit details',
              style: AppTheme.bodySmall(context)
                  .copyWith(color: AppTheme.mediumGray),
            ),
          ],
          if (hasVisitDate) ...[
            const SizedBox(height: 8),
            Text('${_visitDate!.year}/${_visitDate!.month}/${_visitDate!.day}',
                style: AppTheme.bodySmall(context)
                    .copyWith(color: AppTheme.mediumGray)),
          ],
          if (hasRating) ...[
            const SizedBox(height: 12),
            Row(
                children: List.generate(
                    5,
                    (index) => Icon(
                        index < _userRating! ? Icons.star : Icons.star_border,
                        color: AppTheme.primaryYellow,
                        size: 20))),
          ],
          if (hasNotes) ...[
            const SizedBox(height: 12),
            Text(_userNotes!, style: AppTheme.bodyMedium(context)),
          ],
          if (hasPhotos) ...[
            const SizedBox(height: 12),
            SizedBox(
              height: 80,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                itemCount: _userPhotos.length,
                itemBuilder: (context, index) => GestureDetector(
                  onTap: () => _viewUserPhotoFullScreen(_userPhotos[index]),
                  child: Container(
                    width: 80,
                    height: 80,
                    margin: const EdgeInsets.only(right: 8),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                      border: Border.all(
                          color: AppTheme.black, width: AppTheme.borderThin),
                    ),
                    child: ClipRRect(
                      borderRadius:
                          BorderRadius.circular(AppTheme.radiusSmall - 1),
                      child: _userPhotos[index].startsWith('data:')
                          ? Image.memory(
                              _decodeBase64Image(_userPhotos[index])!,
                              fit: BoxFit.cover)
                          : Image.network(_userPhotos[index],
                              fit: BoxFit.cover),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Future<bool> _handleAddWishlist() async {
    print('💾 [_handleAddWishlist] Starting for: $_spotName');

    // 1. 先检查登录状态（同步检查，不阻塞）
    final auth = ref.read(authProvider);
    if (!auth.isAuthenticated) {
      print(
          '💾 [_handleAddWishlist] User not authenticated, navigating to login');
      // 未登录，跳转登录页
      final result = await context.push('/login');
      if (result != true) {
        print('💾 [_handleAddWishlist] Login cancelled or failed');
        return false;
      }
      print('💾 [_handleAddWishlist] Login successful');
    }

    // 2. Optimistic update - 立即更新 UI
    print('💾 [_handleAddWishlist] Performing optimistic update');
    setState(() {
      _isWishlist = true;
      _hasStatusChanged = true;
    });

    CustomToast.showSuccess(context, 'Saved');

    // 3. 等待 API 调用完成（确保服务器数据更新）
    print('💾 [_handleAddWishlist] Waiting for API to complete...');
    final saveFuture = _saveToBackend();
    _trackPendingOperation(saveFuture);
    await saveFuture;
    print('💾 [_handleAddWishlist] API completed successfully');
    return true;
  }

  /// 后台保存到服务器（不阻塞 UI）
  Future<void> _saveToBackend() async {
    print('💾💾💾 [_saveToBackend] METHOD CALLED - START');
    print('💾 [_saveToBackend] _spotName: $_spotName');
    print('💾 [_saveToBackend] _spotCity: $_spotCity');
    print('💾 [_saveToBackend] _destinationId: $_destinationId');
    print('💾 [_saveToBackend] mounted: $mounted');

    try {
      print('💾 [_saveToBackend] Entering try block');
      // 获取或创建 destination
      String? destId = _destinationId;
      if (destId == null) {
        print('💾 [_saveToBackend] destId is null, need to create destination');
        final cityName =
            (_spotCity?.isNotEmpty ?? false) ? _spotCity! : 'Saved Places';
        print('💾 [_saveToBackend] cityName: $cityName');
        destId = await ensureDestinationForCity(ref, cityName);
        if (destId == null) {
          print('❌ [_saveToBackend] Failed to create destination');
          if (mounted) {
            setState(() => _isWishlist = false);
            CustomToast.showError(context, 'Failed to save');
          }
          return;
        }
        print('💾 [_saveToBackend] Created destination: $destId');
        _destinationId = destId;
      } else {
        print('💾 [_saveToBackend] Using existing destId: $destId');
      }

      print(
          '💾 [_saveToBackend] Calling API with destId=$destId, spotId=$_spotId');

      // 调用 API
      final tripSpot = await ref.read(tripRepositoryProvider).manageTripSpot(
            tripId: destId,
            spotId: _spotId,
            isSaved: true,
            spotPayload: _spotPayload(),
          );

      print('💾 [_saveToBackend] API returned tripSpot: ${tripSpot?.spotId}');

      // 更新实际的 place UUID（后端返回的真实 ID）
      if (tripSpot != null && tripSpot.spotId.isNotEmpty) {
        _actualPlaceId = tripSpot.spotId;
        print('💾 [_saveToBackend] Updated _actualPlaceId to: $_actualPlaceId');
      }

      // 收集所有缓存 keys 并更新
      final cacheKeys = _collectCacheKeys();
      print('💾 [_saveToBackend] Updating cache with keys: $cacheKeys');

      _updateWishlistCache(
        destinationId: destId,
        isSaved: true, // 保存时明确标记为已收藏
        isMustGo: _isMustGo,
        isTodaysPlan: _isTodaysPlan,
        isVisited: _isVisited,
      );

      // 确保状态持久化
      if (mounted) {
        setState(() {
          _isWishlist = true;
          _hasStatusChanged = true;
        });
      }

      // 立即刷新所有相关 provider，确保其他页面快速更新
      print('🔄 [_saveToBackend] Invalidating providers for immediate sync...');
      ref.invalidate(tripsProvider);
      ref.invalidate(wishlistStatusProvider);

      // 强制刷新 tripsProvider 以立即加载最新数据
      try {
        await ref.refresh(tripsProvider.future).timeout(
          const Duration(seconds: 2),
          onTimeout: () {
            print(
                '⚠️ [_saveToBackend] Provider refresh timeout, continuing anyway');
            return [];
          },
        );
        print('✅ [_saveToBackend] Providers refreshed successfully');
      } catch (e) {
        print('⚠️ [_saveToBackend] Provider refresh error: $e');
      }

      widget.onStatusChanged?.call(_spotId, needsReload: true);

      print('✅ [_saveToBackend] Save completed successfully');
    } catch (e) {
      // 失败时回滚
      print('❌ [_saveToBackend] Error: $e');
      if (mounted) {
        setState(() => _isWishlist = false);
        CustomToast.showError(context, '❌ Failed to save: $e');
      }
    }
  }

  Future<bool> _handleRemoveWishlist() async {
    print('🗑️ [_handleRemoveWishlist] START - spot: $_spotName');
    print(
        '🗑️ [_handleRemoveWishlist] _destinationId: $_destinationId, _spotId: $_spotId');
    print('🗑️ [_handleRemoveWishlist] _isVisited: $_isVisited');

    // 1. Optimistic update - 立即更新 UI
    final prevWishlist = _isWishlist;
    final prevMustGo = _isMustGo;
    final prevTodaysPlan = _isTodaysPlan;

    setState(() {
      _isWishlist = false;
      _isMustGo = false;
      _isTodaysPlan = false;
      _hasStatusChanged = true;
    });

    CustomToast.showSuccess(context, 'Removed');

    // 2. 通知父组件
    widget.onStatusChanged
        ?.call(_spotId, isRemoved: !_isVisited, needsReload: true);

    // 3. 等待API调用完成
    final removeCompleter = Completer<void>();
    _trackPendingOperation(removeCompleter.future);
    if (_destinationId != null) {
      try {
        print('🗑️ [_handleRemoveWishlist] Calling API...');
        if (_isVisited) {
          print(
              '🗑️ [_handleRemoveWishlist] API call: isSaved=false, keeping visited data');
          final result = await ref.read(tripRepositoryProvider).manageTripSpot(
                tripId: _destinationId!,
                spotId: _spotId,
                isSaved: false,
                isMustGo: false,
                isTodaysPlan: false,
                spotPayload: _spotPayload(),
              );
          print(
              '✅ [_handleRemoveWishlist] API success (keep visited): ${result?.id}');
        } else {
          print('🗑️ [_handleRemoveWishlist] API call: remove=true');
          await ref.read(tripRepositoryProvider).manageTripSpot(
                tripId: _destinationId!,
                spotId: _spotId,
                remove: true,
              );
          print('✅ [_handleRemoveWishlist] API success (complete removal)');
          _destinationId = null;
        }
        ref.invalidate(tripsProvider);
        ref.invalidate(wishlistStatusProvider);
        print('✅ [_handleRemoveWishlist] Providers invalidated');

        // 4. API完成后更新缓存（确保与服务器状态一致）
        if (_isVisited) {
          print(
              '🗑️ [_handleRemoveWishlist] Updating cache: isSaved=false, keeping visited');
          _updateWishlistCache(
            destinationId: _destinationId,
            isSaved: false,
            isMustGo: false,
            isTodaysPlan: false,
            isVisited: true,
          );
        } else {
          print('🗑️ [_handleRemoveWishlist] Removing from cache completely');
          _updateWishlistCache(remove: true);
        }
      } catch (e, stackTrace) {
        // 失败时回滚
        print('❌ [_handleRemoveWishlist] API FAILED: $e');
        print('❌ [_handleRemoveWishlist] Stack trace: $stackTrace');

        if (mounted) {
          setState(() {
            _isWishlist = prevWishlist;
            _isMustGo = prevMustGo;
            _isTodaysPlan = prevTodaysPlan;
          });
          // 回滚缓存
          _updateWishlistCache(
            destinationId: _destinationId,
            isSaved: true, // 回滚为已收藏
            isMustGo: prevMustGo,
            isTodaysPlan: prevTodaysPlan,
            isVisited: _isVisited,
          );
          CustomToast.showError(context, 'Failed to remove: $e');
        }
        return false;
      } finally {
        if (!removeCompleter.isCompleted) {
          removeCompleter.complete();
        }
      }
    } else {
      print('⚠️ [_handleRemoveWishlist] No destinationId, skipping API call');
    }
    if (!removeCompleter.isCompleted) {
      removeCompleter.complete();
    }

    print('✅ [_handleRemoveWishlist] COMPLETE');
    return true;
  }

  Future<bool> _handleToggleMustGo(bool isChecked) async {
    // 如果还没收藏，先收藏
    if (!_isWishlist) {
      final saved = await _handleAddWishlist();
      if (!saved) return false;
    }

    if (_destinationId == null) {
      final destId = await ensureDestinationForCity(ref, _spotCity ?? '');
      if (destId == null) {
        _showError('Failed to create destination');
        return false;
      }
      _destinationId = destId;
    }

    // Optimistic update - change state immediately
    final wasChecked = _isMustGo;
    setState(() => _isMustGo = isChecked);
    widget.onStatusChanged?.call(_spotId, isMustGo: isChecked);

    try {
      // 使用新的布尔字段
      await ref.read(tripRepositoryProvider).manageTripSpot(
            tripId: _destinationId!,
            spotId: _spotId,
            isMustGo: isChecked,
            spotPayload: _spotPayload(),
          );
      // 立即更新同步缓存，避免下次打开时闪烁
      _updateWishlistCache(
        destinationId: _destinationId,
        isSaved: true, // toggle mustGo时必然已保存
        isMustGo: isChecked,
        isTodaysPlan: _isTodaysPlan,
        isVisited: _isVisited,
        visitDate: _visitDate,
        userRating: _userRating,
        userNotes: _userNotes,
        userPhotos: _userPhotos,
      );

      // 立即刷新 providers 以确保 VAGO 列表快速更新
      ref.invalidate(tripsProvider);
      ref.invalidate(wishlistStatusProvider);
      try {
        await ref.refresh(tripsProvider.future).timeout(
              const Duration(seconds: 2),
              onTimeout: () => [],
            );
      } catch (e) {
        print('⚠️ [toggleMustGo] Provider refresh error: $e');
      }

      if (mounted) {
        setState(() => _hasStatusChanged = true);
      }
      return true;
    } catch (e) {
      // Revert on error
      if (mounted) setState(() => _isMustGo = wasChecked);
      widget.onStatusChanged?.call(_spotId, isMustGo: wasChecked);
      _showError('Error: $e');
      return false;
    }
  }

  Future<bool> _handleToggleTodaysPlan(bool isChecked) async {
    // 如果还没收藏，先收藏
    if (!_isWishlist) {
      final saved = await _handleAddWishlist();
      if (!saved) return false;
    }

    if (_destinationId == null) {
      final destId = await ensureDestinationForCity(ref, _spotCity ?? '');
      if (destId == null) {
        _showError('Failed to create destination');
        return false;
      }
      _destinationId = destId;
    }

    // Optimistic update - change state immediately
    final wasChecked = _isTodaysPlan;
    setState(() => _isTodaysPlan = isChecked);
    widget.onStatusChanged?.call(_spotId, isTodaysPlan: isChecked);

    try {
      // 使用新的布尔字段
      await ref.read(tripRepositoryProvider).manageTripSpot(
            tripId: _destinationId!,
            spotId: _spotId,
            isTodaysPlan: isChecked,
            spotPayload: _spotPayload(),
          );
      // 立即更新同步缓存，避免下次打开时闪烁
      _updateWishlistCache(
        destinationId: _destinationId,
        isSaved: true, // toggle today's plan时必然已保存
        isMustGo: _isMustGo,
        isTodaysPlan: isChecked,
        isVisited: _isVisited,
        visitDate: _visitDate,
        userRating: _userRating,
        userNotes: _userNotes,
        userPhotos: _userPhotos,
      );

      // 立即刷新 providers 以确保 VAGO 列表快速更新
      ref.invalidate(tripsProvider);
      ref.invalidate(wishlistStatusProvider);
      try {
        await ref.refresh(tripsProvider.future).timeout(
              const Duration(seconds: 2),
              onTimeout: () => [],
            );
      } catch (e) {
        print('⚠️ [toggleTodaysPlan] Provider refresh error: $e');
      }

      if (mounted) {
        setState(() => _hasStatusChanged = true);
      }
      return true;
    } catch (e) {
      // Revert on error
      if (mounted) setState(() => _isTodaysPlan = wasChecked);
      widget.onStatusChanged?.call(_spotId, isTodaysPlan: wasChecked);
      _showError('Error: $e');
      return false;
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    CustomToast.showError(context, message);
  }

  Map<String, dynamic> _spotPayload() {
    // 获取原始的 googlePlaceId
    String? googlePlaceId;
    if (widget.spot is Spot) {
      googlePlaceId = (widget.spot as Spot).googlePlaceId;
    }
    if (googlePlaceId == null || googlePlaceId.isEmpty) {
      try {
        googlePlaceId = (widget.spot as dynamic).googlePlaceId as String?;
      } catch (_) {}
    }
    // 如果没有 googlePlaceId，使用原始 spotId（可能是 googlePlaceId）
    googlePlaceId ??= _originalSpotId;

    return {
      'name': _spotName,
      'city': _spotCity ?? '',
      'country': _getCountry() ?? '',
      'latitude': _getLatitude(),
      'longitude': _getLongitude(),
      'address': _spotAddress,
      'description': _spotDescription,
      'rating': _spotRating,
      'ratingCount': _spotRatingCount,
      'category': _getCategory(),
      'tags': _spotTags,
      'coverImage': _spotImages.isNotEmpty ? _spotImages.first : null,
      'images': _spotImages,
      'googlePlaceId': googlePlaceId,
      'source': 'app_wishlist',
    };
  }

  // Check if opening hours is 24/7
  bool _is24Hours() {
    final raw = _spotOpeningHours;
    if (raw == null) return false;
    final periods = raw['periods'] as List?;
    if (periods == null || periods.length != 1) return false;
    final period = periods.first as Map<String, dynamic>?;
    if (period == null) return false;
    final openInfo = period['open'] as Map<String, dynamic>?;
    if (openInfo == null) return false;
    final time = openInfo['time']?.toString().replaceAll(':', '') ?? '';
    final hasClose = period['close'] != null;
    return time == '0000' && !hasClose;
  }

  // Check if all 7 days are 24 hours based on weekday_text
  bool _isAll24HoursFromWeekdayText() {
    final weekdayText = _getWeekdayText();
    if (weekdayText == null || weekdayText.isEmpty) return false;

    // Check if all days contain "Open 24 hours" or similar
    for (final dayText in weekdayText) {
      final lower = dayText.toLowerCase();
      if (!lower.contains('open 24') &&
          !lower.contains('24 hours') &&
          lower != '7x24' &&
          lower != '24/7') {
        return false;
      }
    }
    return true;
  }

  // Get weekday text for 7 days display
  List<String>? _getWeekdayText() {
    final raw = _spotOpeningHours;
    if (raw == null) return null;
    final weekdayText = raw['weekday_text'];
    if (weekdayText is List && weekdayText.isNotEmpty) {
      return weekdayText.map((e) {
        final text = e?.toString() ?? '';
        // 处理 "{day: Monday, hours: 9 AM to 10:30 PM}" 格式
        if (text.startsWith('{') &&
            text.contains('day:') &&
            text.contains('hours:')) {
          final dayMatch =
              RegExp(r'day:\s*(\w+)', caseSensitive: false).firstMatch(text);
          final hoursMatch =
              RegExp(r'hours:\s*(.+?)(?:\}|$)', caseSensitive: false)
                  .firstMatch(text);
          if (dayMatch != null && hoursMatch != null) {
            final day = dayMatch.group(1)!;
            var hours = hoursMatch.group(1)!.trim();
            // 移除末尾的 } 如果存在
            if (hours.endsWith('}')) {
              hours = hours.substring(0, hours.length - 1).trim();
            }
            // 将 "to" 替换为 "–"
            hours = hours.replaceAll(' to ', ' – ');
            return '$day: $hours';
          }
        }
        return text;
      }).toList();
    }
    return null;
  }

  Widget _buildOpeningHoursSection() {
    final raw = _spotOpeningHours;
    if (raw == null) return const SizedBox.shrink();

    final eval = OpeningHoursUtils.evaluate(
      raw,
      country: _getCountry(),
      longitude: _getLongitude(),
    );
    if (eval == null) return const SizedBox.shrink();

    final is24h = _is24Hours() || _isAll24HoursFromWeekdayText();
    final weekdayText = _getWeekdayText();
    final canExpand = !is24h && weekdayText != null && weekdayText.isNotEmpty;

    final isClosingSoon = eval.isClosingSoon;
    final isClosed = !eval.isOpen;
    final summaryText = eval.summaryText;

    // Build text widget - only "Closed," in red
    Widget textWidget;
    if (isClosed && summaryText.startsWith('Closed')) {
      // Check if there's a comma after "Closed"
      final hasComma = summaryText.startsWith('Closed,');
      final redPart = hasComma ? 'Closed,' : 'Closed';
      final restText = summaryText.substring(redPart.length);

      textWidget = RichText(
        text: TextSpan(
          children: [
            TextSpan(
              text: redPart,
              style: AppTheme.bodyMedium(context).copyWith(
                color: AppTheme.error,
                fontWeight: FontWeight.w500,
              ),
            ),
            if (restText.isNotEmpty)
              TextSpan(
                text: restText,
                style: AppTheme.bodyMedium(context).copyWith(
                  color: AppTheme.black,
                  fontWeight: FontWeight.w500,
                ),
              ),
          ],
        ),
      );
    } else {
      // Normal text (open or closing soon)
      final textColor = isClosingSoon ? AppTheme.error : AppTheme.black;
      textWidget = Text(
        summaryText,
        style: AppTheme.bodyMedium(context).copyWith(
          color: textColor,
          fontWeight: FontWeight.w500,
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: canExpand
              ? () => setState(
                  () => _isOpeningHoursExpanded = !_isOpeningHoursExpanded)
              : null,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const Icon(Icons.access_time, size: 18, color: AppTheme.black),
              const SizedBox(width: 8),
              Expanded(child: textWidget),
              if (canExpand)
                Icon(
                  _isOpeningHoursExpanded
                      ? Icons.keyboard_arrow_up
                      : Icons.keyboard_arrow_down,
                  size: 20,
                  color: AppTheme.black,
                ),
            ],
          ),
        ),
        if (_isOpeningHoursExpanded && weekdayText != null) ...[
          const SizedBox(height: 12),
          ...weekdayText.map((dayText) => Padding(
                padding: const EdgeInsets.only(bottom: 4, left: 26),
                child: Text(
                  dayText,
                  style: AppTheme.bodySmall(context).copyWith(
                    color: AppTheme.black.withOpacity(0.6),
                  ),
                ),
              )),
        ],
      ],
    );
  }

  Widget _buildInfoRow({
    required IconData icon,
    required String text,
    VoidCallback? onCopy,
  }) =>
      Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Icon(icon, size: 18, color: AppTheme.black),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: AppTheme.bodyMedium(context).copyWith(
                color: AppTheme.black,
              ),
            ),
          ),
          if (onCopy != null)
            GestureDetector(
              onTap: onCopy,
              child: Padding(
                padding: const EdgeInsets.only(left: 8, top: 2),
                child: const Icon(Icons.copy, size: 18, color: AppTheme.black),
              ),
            ),
        ],
      );

  /// 构建合集入口卡片 - 封面图左上角，宽度自适应
  Widget _buildCollectionEntryCard() {
    final collection = _linkedCollection;
    if (collection == null) return const SizedBox.shrink();

    final collectionName = collection['name'] as String? ?? '';

    return GestureDetector(
      onTap: () => _navigateToCollection(collection),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.9),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('📚', style: TextStyle(fontSize: 14)),
            const SizedBox(width: 6),
            ConstrainedBox(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.5,
              ),
              child: Text(
                collectionName,
                style: AppTheme.labelSmall(context).copyWith(
                  fontWeight: FontWeight.w500,
                  color: AppTheme.black,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 2),
            const Icon(
              Icons.chevron_right,
              size: 16,
              color: AppTheme.black,
            ),
          ],
        ),
      ),
    );
  }

  /// 跳转到合集地图页
  void _navigateToCollection(Map<String, dynamic> collection) {
    final collectionId = collection['id'] as String?;
    final collectionName = collection['name'] as String? ?? '';
    final coverImage = collection['coverImage'] as String?;
    final description = collection['description'] as String?;
    final collectionSpots = collection['collectionSpots'] as List<dynamic>?;
    final isFavorited = collection['isFavorited'] as bool?;

    if (collectionId == null) return;

    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => CollectionSpotsMapPage(
          city: _spotCity ?? '',
          collectionTitle: collectionName,
          collectionId: collectionId,
          initialIsFavorited: isFavorited,
          coverImage: coverImage,
          description: description,
          people: LinkItem.parseList(collection['people'], isPeople: true),
          works: LinkItem.parseList(collection['works'], isPeople: false),
          preloadedSpots: collectionSpots?.cast<Map<String, dynamic>>(),
        ),
      ),
    );
  }

  /// 检查是否有剧照数据
  bool _hasStillsData() {
    try {
      // 尝试从 map_page_new.dart 的 Spot 类型获取
      final dynamic spot = widget.spot;

      // 检查是否有 customFields 属性
      if (spot == null) return false;

      // 尝试获取 customFields
      dynamic customFields;
      try {
        customFields = spot.customFields;
      } catch (e) {
        // 如果没有 customFields 属性，返回 false
        return false;
      }

      if (customFields == null) return false;

      // 检查是否是 PlaceCustomFields 类型
      if (customFields is PlaceCustomFields) {
        return customFields.hasStills;
      }

      // 尝试访问 hasStills 属性
      try {
        return customFields.hasStills == true;
      } catch (e) {
        return false;
      }
    } catch (e) {
      print('⚠️ _hasStillsData error: $e');
      return false;
    }
  }

  /// 获取剧照数据
  PlaceCustomFields? _getCustomFields() {
    try {
      final dynamic spot = widget.spot;
      if (spot == null) return null;

      dynamic customFields;
      try {
        customFields = spot.customFields;
      } catch (e) {
        return null;
      }

      if (customFields == null) return null;

      if (customFields is PlaceCustomFields) {
        return customFields;
      }

      return null;
    } catch (e) {
      print('⚠️ _getCustomFields error: $e');
      return null;
    }
  }

  /// 构建剧照入口按钮
  Widget _buildStillsEntryButton() {
    return GestureDetector(
      onTap: _navigateToStillsList,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.9),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.movie_outlined, size: 16, color: AppTheme.black),
            const SizedBox(width: 6),
            Text(
              'Stills',
              style: AppTheme.labelSmall(context).copyWith(
                fontWeight: FontWeight.w500,
                color: AppTheme.black,
              ),
            ),
            const SizedBox(width: 2),
            const Icon(
              Icons.chevron_right,
              size: 16,
              color: AppTheme.black,
            ),
          ],
        ),
      ),
    );
  }

  /// 跳转到剧照列表页
  void _navigateToStillsList() {
    final customFields = _getCustomFields();
    if (customFields == null) return;

    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => StillsListPage(
          placeName: _spotName,
          customFields: customFields,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Debug: 打印当前状态
    print(
        '🏗️ [UnifiedSpotDetailModal] build() called: _isWishlist=$_isWishlist, _isVisited=$_isVisited, _isMustGo=$_isMustGo');

    // 不再阻塞加载：立即显示详情内容，合集入口会在加载完成后出现

    return Stack(
      clipBehavior: Clip.none,
      children: [
        // Main modal content
        Container(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.85,
          ),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
            border: Border.all(color: AppTheme.black, width: 2),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // 1. Image section with close button and collection entry
              // 只有当有有效图片时才显示图片区域
              if (_validSpotImages.isNotEmpty)
                Stack(
                  children: [
                    // 图片容器 - 详情页图片铺满，无左右边距
                    SizedBox(
                      height: 300,
                      child: GestureDetector(
                        onTap: () => _showFullScreenImage(_currentImageIndex),
                        child: PageView.builder(
                          controller: _imagePageController,
                          onPageChanged: (index) =>
                              setState(() => _currentImageIndex = index),
                          itemCount: _validSpotImages.length,
                          itemBuilder: (context, index) {
                            final imageSource = _validSpotImages[index];
                            if (imageSource.startsWith('data:')) {
                              final bytes = _decodeBase64Image(imageSource);
                              if (bytes != null) {
                                return ClipRRect(
                                  borderRadius: const BorderRadius.vertical(
                                      top: Radius.circular(22)),
                                  child: Image.memory(
                                    bytes,
                                    fit: BoxFit.cover,
                                    width: double.infinity,
                                    height: double.infinity,
                                    gaplessPlayback: true,
                                    errorBuilder: (_, __, ___) =>
                                        _buildPlaceholder(),
                                  ),
                                );
                              }
                              return _buildPlaceholder();
                            }
                            return ClipRRect(
                              borderRadius: const BorderRadius.vertical(
                                  top: Radius.circular(22)),
                              child: Image.network(
                                imageSource,
                                fit: BoxFit.cover,
                                width: double.infinity,
                                height: double.infinity,
                                gaplessPlayback: true,
                                frameBuilder: (context, child, frame,
                                    wasSynchronouslyLoaded) {
                                  if (wasSynchronouslyLoaded) return child;
                                  return child;
                                },
                                errorBuilder: (_, __, ___) =>
                                    _buildPlaceholder(),
                              ),
                            );
                          },
                        ),
                      ),
                    ),
                    if (_validSpotImages.length > 1)
                      Positioned(
                        bottom: 12,
                        left: 0,
                        right: 0,
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: List.generate(
                            _validSpotImages.length,
                            (index) => Container(
                              margin: const EdgeInsets.symmetric(horizontal: 4),
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: index == _currentImageIndex
                                    ? AppTheme.primaryYellow
                                    : Colors.white.withOpacity(0.5),
                                border:
                                    Border.all(color: AppTheme.black, width: 1),
                              ),
                            ),
                          ),
                        ),
                      ),
                    // 合集入口卡片 - 封面图左上角
                    if (_linkedCollection != null &&
                        !widget.hideCollectionEntry)
                      Positioned(
                        top: 16,
                        left: 16,
                        child: _buildCollectionEntryCard(),
                      ),
                    // 剧照入口按钮 - 封面图右下角
                    if (_hasStillsData())
                      Positioned(
                        right: 16,
                        bottom: _validSpotImages.length > 1 ? 32 : 16,
                        child: _buildStillsEntryButton(),
                      ),
                  ],
                ),
              // 没有有效图片时，不显示顶部占位区域
              if (_validSpotImages.isEmpty) const SizedBox(height: 8),
              // Scrollable content
              Flexible(
                fit: FlexFit.loose,
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // 2. Title - max 2 lines with ellipsis
                      Text(
                        _spotName,
                        style: AppTheme.headlineLarge(context),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 12),
                      // 3. Tags - max 4 tags, horizontal scroll
                      if (_effectiveTags().isNotEmpty) ...[
                        SizedBox(
                          height: 28,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            itemCount: _effectiveTags().take(4).length,
                            separatorBuilder: (_, __) =>
                                const SizedBox(width: 8),
                            itemBuilder: (context, index) {
                              final tag = _effectiveTags()[index];
                              return Container(
                                alignment: Alignment.center,
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 10),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFF2F2F2),
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(
                                      color: AppTheme.black.withOpacity(0.2),
                                      width: 1),
                                ),
                                child: Text(
                                  tag,
                                  style: AppTheme.labelSmall(context).copyWith(
                                    color: AppTheme.black.withOpacity(0.48),
                                    height: 1.0,
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],
                      // 4. Description - max 3 lines with ellipsis
                      if (_spotDescription != null &&
                          _spotDescription!.isNotEmpty) ...[
                        Text(
                          _spotDescription!,
                          style: AppTheme.bodyMedium(context)
                              .copyWith(color: AppTheme.darkGray),
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 16),
                      ],
                      // 5. Rating or Recommendation Phrase with Check-in button on the right
                      // 优先显示评分（如果有有效评分）
                      if (_hasValidRating) ...[
                        Row(
                          children: [
                            Text(
                              _spotRating!.toStringAsFixed(1),
                              style: AppTheme.headlineMedium(context)
                                  .copyWith(fontWeight: FontWeight.bold),
                            ),
                            const SizedBox(width: 8),
                            ...List.generate(
                              5,
                              (index) => Icon(
                                index < _spotRating!.floor()
                                    ? Icons.star
                                    : (index < _spotRating!
                                        ? Icons.star_half
                                        : Icons.star_border),
                                color: AppTheme.primaryYellow,
                                size: 20,
                              ),
                            ),
                            if (_spotRatingCount != null) ...[
                              const SizedBox(width: 8),
                              Text(
                                formatRatingCount(_spotRatingCount),
                                style: AppTheme.bodySmall(context)
                                    .copyWith(color: AppTheme.mediumGray),
                              ),
                            ],
                            const Spacer(),
                            _buildCheckInButton(),
                          ],
                        ),
                        const SizedBox(height: 16),
                      ] else if (_isAIOnlySpot ||
                          _spotRecommendationPhrase != null ||
                          (_spotDescription != null &&
                              _spotDescription!.isNotEmpty)) ...[
                        // 没有评分但有推荐短语或描述时：显示推荐短语
                        Row(
                          children: [
                            const Icon(Icons.auto_awesome,
                                size: 20, color: AppTheme.primaryYellow),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _spotRecommendationPhrase ??
                                    _getDefaultRecommendationPhrase(),
                                style:
                                    AppTheme.headlineMedium(context).copyWith(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 16,
                                ),
                              ),
                            ),
                            _buildCheckInButton(),
                          ],
                        ),
                        const SizedBox(height: 16),
                      ] else ...[
                        // 没有评分也没有推荐语：只显示 Check-in 按钮
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [_buildCheckInButton()],
                        ),
                        const SizedBox(height: 16),
                      ],
                      // 6. Other info: opening hours, address, phone, website
                      // Opening hours with expand/collapse
                      _buildOpeningHoursSection(),
                      if (_spotOpeningHours != null) const SizedBox(height: 12),
                      // Address with navigation button
                      if (_spotAddress != null && _spotAddress!.isNotEmpty) ...[
                        _buildAddressRowWithNavigation(),
                        const SizedBox(height: 12),
                      ],
                      // Phone with copy
                      if (_spotPhoneNumber != null &&
                          _spotPhoneNumber!.isNotEmpty) ...[
                        _buildInfoRow(
                          icon: Icons.phone_outlined,
                          text: _spotPhoneNumber!,
                          onCopy: () =>
                              _copyToClipboard(_spotPhoneNumber!, 'Phone'),
                        ),
                        const SizedBox(height: 12),
                      ],
                      // Website with copy
                      if (_spotWebsite != null && _spotWebsite!.isNotEmpty) ...[
                        _buildInfoRow(
                          icon: Icons.language,
                          text: _spotWebsite!,
                          onCopy: () =>
                              _copyToClipboard(_spotWebsite!, 'Website'),
                        ),
                        const SizedBox(height: 16),
                      ],
                      // 7. User Check-in Info
                      if (_isVisited && !_isLoadingCheckInData) ...[
                        const SizedBox(height: 8),
                        _buildUserCheckInInfo(),
                      ] else if (_isVisited && _isLoadingCheckInData) ...[
                        // 显示加载状态
                        const SizedBox(height: 8),
                        _buildCheckInLoadingSkeleton(),
                      ],
                    ],
                  ),
                ),
              ),
              // 8. Fixed bottom bar with SaveSpotButton
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: Colors.white,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.08),
                      blurRadius: 8,
                      offset: const Offset(0, -4),
                    ),
                  ],
                ),
                child: SafeArea(
                  top: false,
                  child: _isWishlist
                      ? SaveSpotButton(
                          key: ValueKey(
                              'save-button-$_isWishlist-$_isMustGo-$_isTodaysPlan-$_isVisited'),
                          isSaved: true,
                          isMustGo: _isMustGo,
                          isTodaysPlan: _isTodaysPlan,
                          onSave: () async {
                            print(
                                '🔘🔘🔘 SaveSpotButton onSave called but _isWishlist=$_isWishlist (already saved) - no action taken');
                            return true;
                          },
                          onUnsave: () async {
                            await _handleRemoveWishlist();
                            return true;
                          },
                          onToggleMustGo: (isChecked) async =>
                              await _handleToggleMustGo(isChecked),
                          onToggleTodaysPlan: (isChecked) async =>
                              await _handleToggleTodaysPlan(isChecked),
                        )
                      : GestureDetector(
                          key: const ValueKey('save-button-unsaved'),
                          onTap: () {
                            print(
                                '🔘 [UnifiedSpotDetailModal] Save button tapped!');
                            print('🔘 Current _isWishlist: $_isWishlist');
                            _handleAddWishlist();
                          },
                          child: Container(
                            width: double.infinity,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            decoration: BoxDecoration(
                              color: AppTheme.primaryYellow,
                              borderRadius:
                                  BorderRadius.circular(AppTheme.radiusSmall),
                              border:
                                  Border.all(color: AppTheme.black, width: 2),
                              boxShadow: AppTheme.cardShadow,
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(Icons.favorite_border,
                                    color: AppTheme.black, size: 24),
                                const SizedBox(width: 12),
                                Text('Save',
                                    style: AppTheme.labelLarge(context)
                                        .copyWith(
                                            color: AppTheme.black,
                                            fontWeight: FontWeight.bold,
                                            fontSize: 18)),
                              ],
                            ),
                          ),
                        ),
                ),
              ),
            ],
          ),
        ),
        // 关闭按钮 - 放在详情页外部右上角
        Positioned(
          top: -44,
          right: 16,
          child: GestureDetector(
            onTap: () => Navigator.pop(context, _hasStatusChanged),
            child: Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.45),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.close,
                color: Colors.white,
                size: 22,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildAddressRowWithNavigation() => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(top: 2),
            child: Icon(Icons.location_on_outlined,
                size: 18, color: AppTheme.black),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              _spotAddress!,
              style: AppTheme.bodyMedium(context).copyWith(
                color: AppTheme.black,
              ),
            ),
          ),
          GestureDetector(
            onTap: _showNavigationOptions,
            child: const Padding(
              padding: EdgeInsets.only(left: 8, top: 2),
              child: Icon(Icons.navigation_outlined,
                  size: 18, color: AppTheme.black),
            ),
          ),
        ],
      );

  void _showNavigationOptions() {
    final lat = _getLatitude();
    final lng = _getLongitude();
    final name = Uri.encodeComponent(_spotName);

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
                'Open in Maps',
                style: AppTheme.headlineMedium(context)
                    .copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 20),
              // Google Maps
              _buildMapOption(
                icon: '🗺️',
                title: 'Google Maps',
                onTap: () {
                  Navigator.pop(context);
                  _openGoogleMaps(lat, lng, name);
                },
              ),
              const SizedBox(height: 12),
              // Amap (高德地图)
              _buildMapOption(
                icon: '🧭',
                title: '高德地图',
                onTap: () {
                  Navigator.pop(context);
                  _openAmap(lat, lng, name);
                },
              ),
              const SizedBox(height: 12),
              // Apple Maps
              _buildMapOption(
                icon: '🍎',
                title: 'Apple Maps',
                onTap: () {
                  Navigator.pop(context);
                  _openAppleMaps(lat, lng, name);
                },
              ),
              const SizedBox(height: 16),
              // Cancel button - white with black border
              GestureDetector(
                onTap: () => Navigator.pop(context),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  decoration: BoxDecoration(
                    color: AppTheme.white,
                    borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                    border: Border.all(color: AppTheme.black, width: 2),
                  ),
                  child: Center(
                    child: Text(
                      'Cancel',
                      style: AppTheme.labelLarge(context).copyWith(
                        color: AppTheme.black,
                        fontWeight: FontWeight.w500,
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

  Widget _buildMapOption({
    required String icon,
    required String title,
    required VoidCallback onTap,
  }) =>
      GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: AppTheme.white,
            borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
            border: Border.all(color: AppTheme.black, width: 2),
            boxShadow: const [
              BoxShadow(
                color: AppTheme.black,
                offset: Offset(2, 3),
                blurRadius: 0,
              ),
            ],
          ),
          child: Row(
            children: [
              Text(icon, style: const TextStyle(fontSize: 24)),
              const SizedBox(width: 12),
              Text(
                title,
                style: AppTheme.bodyLarge(context)
                    .copyWith(fontWeight: FontWeight.w500),
              ),
              const Spacer(),
              const Icon(Icons.chevron_right, color: AppTheme.black),
            ],
          ),
        ),
      );

  Future<void> _openGoogleMaps(double lat, double lng, String name) async {
    final url = Uri.parse(
        'https://www.google.com/maps/search/?api=1&query=$lat,$lng&query_place_id=$name');
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    } else {
      CustomToast.showError(context, 'Cannot open Google Maps');
    }
  }

  Future<void> _openAmap(double lat, double lng, String name) async {
    // Try to open Amap app first, fallback to web
    final appUrl = Uri.parse(
        'amapuri://route/plan/?dlat=$lat&dlon=$lng&dname=$name&dev=0&t=0');
    final webUrl =
        Uri.parse('https://uri.amap.com/marker?position=$lng,$lat&name=$name');

    if (await canLaunchUrl(appUrl)) {
      await launchUrl(appUrl);
    } else if (await canLaunchUrl(webUrl)) {
      await launchUrl(webUrl, mode: LaunchMode.externalApplication);
    } else {
      CustomToast.showError(context, 'Cannot open Amap');
    }
  }

  Future<void> _openAppleMaps(double lat, double lng, String name) async {
    final url = Uri.parse('https://maps.apple.com/?q=$name&ll=$lat,$lng');
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    } else {
      CustomToast.showError(context, 'Cannot open Apple Maps');
    }
  }
}
