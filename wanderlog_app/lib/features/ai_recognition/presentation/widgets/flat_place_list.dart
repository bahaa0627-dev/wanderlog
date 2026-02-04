import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/ai_recognition/data/models/search_v2_result.dart';
import 'package:wanderlog/features/ai_recognition/providers/wishlist_status_provider.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart'
    show TripSpotStatus;
import 'package:wanderlog/shared/utils/destination_utils.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';
import 'package:wanderlog/shared/utils/number_format_utils.dart';

/// 平铺展示组件 - 无分类时使用
///
/// Requirements: 9.4, 9.5
/// - 无分类时使用此组件
/// - 最多显示 maxPlaces 个地点
/// - 3:2 横向卡片，summary 在卡片下方
/// - 去掉 AI/Verified 标签
/// - 只显示有图片的地点，没有图片的地点会被过滤掉
class FlatPlaceList extends StatelessWidget {
  const FlatPlaceList({
    required this.places,
    this.onPlaceTap,
    this.maxPlaces = 10,
    super.key,
  });

  /// 地点列表
  final List<PlaceResult> places;

  /// 地点点击回调
  final void Function(PlaceResult place)? onPlaceTap;

  /// 最大显示数量（默认10个，用户明确要求时应展示全部）
  final int maxPlaces;

  @override
  Widget build(BuildContext context) {
    // 只显示有图片的地点，过滤掉没有图片的
    final placesWithImage =
        places.where((p) => p.hasValidCoverImage).take(maxPlaces).toList();

    if (placesWithImage.isEmpty) {
      return const SizedBox.shrink();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (int i = 0; i < placesWithImage.length; i++) ...[
          FlatPlaceCard(
            place: placesWithImage[i],
            onTap: () => onPlaceTap?.call(placesWithImage[i]),
          ),
          if (i < placesWithImage.length - 1) const SizedBox(height: 16),
        ],
      ],
    );
  }
}

Future<void> _openExternalUrl(String url) async {
  final uri = Uri.tryParse(url);
  if (uri == null) return;
  if (await canLaunchUrl(uri)) {
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}

/// 检测文本是否包含中文字符
bool _containsChineseText(String text) {
  if (text.trim().isEmpty) return false;
  final chineseRegex = RegExp(r'[\u4e00-\u9fff\u3400-\u4dbf]');
  return chineseRegex.hasMatch(text);
}

Widget _buildLinkedSummaryText({
  required BuildContext context,
  required String text,
  String? website,
  String? ticketUrl,
  TextStyle? style,
}) {
  if (text.trim().isEmpty) return const SizedBox.shrink();

  // 1. 从文本中移除网站相关信息，单独展示
  // 匹配模式：「网站：xxx.com」「网站: xxx」「网站未提供」「Website: xxx」等
  var cleanedText = text
      .replaceAll(
          RegExp(
              r'[。，,\s]*(?:网站|官网|Website)\s*[：:]\s*[^\s。，,.]+(?:\([^)]*\))?[。，,\s]*',
              caseSensitive: false),
          '')
      .replaceAll(RegExp(r'[。，,\s]*(?:网站|官网)[：:]?\s*未提供[。，,\s]*'), '')
      .replaceAll(RegExp(r'[。，,\s]*网站未提供[。，,\s]*'), '')
      .trim();

  // 清理末尾多余的标点符号
  cleanedText = cleanedText.replaceAll(RegExp(r'[。，,]+$'), '').trim();

  final baseStyle = style ??
      AppTheme.bodySmall(context).copyWith(
        color: AppTheme.darkGray,
        height: 1.3,
        fontSize: 13,
      );

  // 网站链接样式：黑色、普通粗细、下划线
  final websiteLinkStyle = baseStyle.copyWith(
    color: AppTheme.black,
    decoration: TextDecoration.underline,
    fontWeight: FontWeight.normal,
  );

  // 提取有效的网站 URL
  String? effectiveWebsite;
  if (website != null && website.trim().isNotEmpty) {
    effectiveWebsite = website.trim();
    // 确保 URL 有协议
    if (!effectiveWebsite.startsWith('http://') &&
        !effectiveWebsite.startsWith('https://')) {
      effectiveWebsite = 'https://$effectiveWebsite';
    }
  }

  // 如果清理后的文本为空且没有网站，返回空
  if (cleanedText.isEmpty && effectiveWebsite == null) {
    return const SizedBox.shrink();
  }

  return Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      // 描述文本
      if (cleanedText.isNotEmpty)
        Text(
          cleanedText,
          style: baseStyle,
        ),
      // 网站链接（单独一行，带 Website:/网站: 前缀）
      if (effectiveWebsite != null) ...[
        const SizedBox(height: 4),
        GestureDetector(
          onTap: () => _openExternalUrl(effectiveWebsite!),
          child: Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: _containsChineseText(text) ? '网站: ' : 'Website: ',
                  style: baseStyle.copyWith(
                    color: AppTheme.black,
                    fontWeight: FontWeight.normal,
                  ),
                ),
                TextSpan(
                  text:
                      effectiveWebsite.replaceFirst(RegExp(r'^https?://'), ''),
                  style: websiteLinkStyle,
                ),
              ],
            ),
          ),
        ),
      ],
    ],
  );
}

/// 纯文字地点展示组件 - 用于没有图片的地点
///
/// 格式：地点名加粗，下方展示 AI summary（约3行）
class TextOnlyPlaceItem extends ConsumerStatefulWidget {
  const TextOnlyPlaceItem({
    required this.place,
    this.onTap,
    this.onWishlistChanged,
    super.key,
  });

  final PlaceResult place;
  final VoidCallback? onTap;
  final void Function(bool isInWishlist)? onWishlistChanged;

  @override
  ConsumerState<TextOnlyPlaceItem> createState() => _TextOnlyPlaceItemState();
}

class _TextOnlyPlaceItemState extends ConsumerState<TextOnlyPlaceItem> {
  bool _isInWishlist = false;
  bool _isSaving = false;
  String? _destinationId;

  String _truncateDescription(String text, int maxChars) {
    final trimmed = text.trim();
    if (trimmed.length <= maxChars) return trimmed;
    return trimmed.substring(0, maxChars);
  }

  @override
  void initState() {
    super.initState();
    // 初始化时从缓存读取状态
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _syncWishlistStatus();
    });
  }

  @override
  void didUpdateWidget(TextOnlyPlaceItem oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.place.id != widget.place.id ||
        oldWidget.place.name != widget.place.name) {
      _syncWishlistStatus();
    }
  }

  /// 同步收藏状态（使用 watch 监听变化）
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
        widget.onWishlistChanged?.call(false);
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
        widget.onWishlistChanged?.call(true);
        CustomToast.showSuccess(context, 'Saved to wishlist');
      }
    } catch (e) {
      debugPrint('❌ [TextOnlyPlaceItem] Wishlist error: $e');
      CustomToast.showError(context, 'Error saving - please try again');
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // 监听收藏状态变化，自动更新 UI
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

    // 获取 summary 或 recommendationPhrase，去掉"简介:"前缀
    var description = widget.place.summary.isNotEmpty
        ? widget.place.summary
        : (widget.place.recommendationPhrase ?? '');
    // 去掉"简介:"或"简介："前缀
    description = description.replaceFirst(RegExp(r'^简介[：:]\\s*'), '');
    final displayDescription = _truncateDescription(description, 100);

    return GestureDetector(
      onTap: widget.onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppTheme.lightGray.withOpacity(0.3),
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
          border: Border.all(color: AppTheme.black.withOpacity(0.1), width: 1),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 左侧文字内容
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // 地点名称 - 加粗
                  Text(
                    widget.place.name,
                    style: AppTheme.labelLarge(context).copyWith(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                      color: AppTheme.black,
                    ),
                  ),
                  const SizedBox(height: 8),
                  // AI summary - 约3行
                  if (displayDescription.isNotEmpty)
                    _buildLinkedSummaryText(
                      context: context,
                      text: displayDescription,
                      website: widget.place.website,
                      ticketUrl: widget.place.ticketUrl,
                      style: AppTheme.bodyMedium(context).copyWith(
                        color: AppTheme.darkGray,
                        height: 1.4,
                      ),
                    ),
                  // 标签
                  if ((widget.place.displayTagsEn ?? widget.place.tags)
                          ?.isNotEmpty ??
                      false) ...[
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 4,
                      runSpacing: 4,
                      children: (widget.place.displayTagsEn ??
                              widget.place.tags ??
                              [])
                          .take(2)
                          .map((tag) => Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color:
                                      AppTheme.primaryYellow.withOpacity(0.3),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  tag,
                                  style: AppTheme.bodySmall(context).copyWith(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w500,
                                    color: AppTheme.black,
                                  ),
                                ),
                              ))
                          .toList(),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 12),
            // 右侧收藏按钮
            GestureDetector(
              onTap: _handleWishlistTap,
              child: Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: _isInWishlist ? AppTheme.primaryYellow : Colors.white,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppTheme.black, width: 1.5),
                ),
                child: _isSaving
                    ? const Padding(
                        padding: EdgeInsets.all(6),
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          valueColor:
                              AlwaysStoppedAnimation<Color>(AppTheme.black),
                        ),
                      )
                    : Icon(
                        _isInWishlist ? Icons.favorite : Icons.favorite_border,
                        size: 16,
                        color: AppTheme.black,
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 3:2 横向地点卡片 - 用于无分类平铺展示
/// Summary 在卡片上方，卡片内只有图片、标签、名称、评分和收藏按钮
class FlatPlaceCard extends ConsumerStatefulWidget {
  const FlatPlaceCard({
    required this.place,
    this.onTap,
    this.onWishlistChanged,
    super.key,
  });

  final PlaceResult place;
  final VoidCallback? onTap;
  final void Function(bool isInWishlist)? onWishlistChanged;

  @override
  ConsumerState<FlatPlaceCard> createState() => _FlatPlaceCardState();
}

class _FlatPlaceCardState extends ConsumerState<FlatPlaceCard> {
  bool _isInWishlist = false;
  bool _isSaving = false;
  String? _destinationId;

  @override
  void initState() {
    super.initState();
    // 初始化时从缓存读取状态
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _syncWishlistStatus();
    });
  }

  @override
  void didUpdateWidget(FlatPlaceCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.place.id != widget.place.id ||
        oldWidget.place.name != widget.place.name) {
      _syncWishlistStatus();
    }
  }

  /// 同步收藏状态
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

  Widget _buildCoverImage() {
    // AI 地点的占位符 - 使用渐变背景和图标
    Widget buildAIPlaceholder() => Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                AppTheme.primaryYellow.withOpacity(0.3),
                AppTheme.accentBlue.withOpacity(0.2),
              ],
            ),
          ),
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.auto_awesome,
                  size: 40,
                  color: AppTheme.primaryYellow.withOpacity(0.8),
                ),
                const SizedBox(height: 8),
                Text(
                  'AI Recommended',
                  style: TextStyle(
                    color: AppTheme.mediumGray,
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        );

    const defaultPlaceholder = ColoredBox(
      color: AppTheme.lightGray,
      child: Center(
        child: Icon(Icons.image_not_supported,
            size: 48, color: AppTheme.mediumGray),
      ),
    );

    if (widget.place.coverImage.isEmpty) {
      return widget.place.isAIOnly ? buildAIPlaceholder() : defaultPlaceholder;
    }

    return Image.network(
      widget.place.coverImage,
      fit: BoxFit.cover,
      loadingBuilder: (context, child, loadingProgress) {
        if (loadingProgress == null) return child;
        return const ColoredBox(
          color: AppTheme.lightGray,
          child: Center(
            child: CircularProgressIndicator(
              strokeWidth: 2,
              valueColor: AlwaysStoppedAnimation<Color>(AppTheme.primaryYellow),
            ),
          ),
        );
      },
      errorBuilder: (_, __, ___) =>
          widget.place.isAIOnly ? buildAIPlaceholder() : defaultPlaceholder,
    );
  }

  Widget _buildRatingOrPhrase(BuildContext context) {
    // 只有真正从 AI 来源的地点才显示 "AI Recommended"
    // 数据库缓存的地点即使没有评分也不应该显示 AI 标签
    if (widget.place.isAIOnly) {
      final phrase = widget.place.recommendationPhrase?.isNotEmpty ?? false
          ? widget.place.recommendationPhrase!
          : _getDefaultPhrase();
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.auto_awesome,
              size: 14, color: AppTheme.primaryYellow),
          const SizedBox(width: 4),
          Text(
            phrase,
            style: AppTheme.bodySmall(context).copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w600,
              fontSize: 12,
            ),
          ),
        ],
      );
    }

    // 有评分的地点显示评分，没有评分则返回空
    if (!widget.place.hasRating) {
      return const SizedBox.shrink();
    }
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.star, size: 14, color: AppTheme.primaryYellow),
        const SizedBox(width: 4),
        Text(
          widget.place.rating!.toStringAsFixed(1),
          style: AppTheme.bodySmall(context).copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w600,
          ),
        ),
        if (widget.place.ratingCount != null) ...[
          const SizedBox(width: 4),
          Text(
            formatRatingCount(widget.place.ratingCount),
            style: AppTheme.bodySmall(context).copyWith(
              color: Colors.white.withOpacity(0.8),
              fontSize: 11,
            ),
          ),
        ],
      ],
    );
  }

  /// 根据地点特征生成默认推荐短语
  String _getDefaultPhrase() {
    final tags = widget.place.tags ?? [];
    final name = widget.place.name.toLowerCase();

    if (tags.any((t) =>
        t.toLowerCase().contains('museum') ||
        t.toLowerCase().contains('gallery'))) {
      return 'Cultural treasure';
    }
    if (tags.any((t) =>
        t.toLowerCase().contains('temple') ||
        t.toLowerCase().contains('shrine'))) {
      return 'Sacred landmark';
    }
    if (tags.any((t) =>
        t.toLowerCase().contains('park') ||
        t.toLowerCase().contains('garden'))) {
      return 'Scenic retreat';
    }
    if (tags.any((t) =>
        t.toLowerCase().contains('cafe') ||
        t.toLowerCase().contains('coffee'))) {
      return 'Local favorite';
    }
    if (tags.any((t) =>
        t.toLowerCase().contains('restaurant') ||
        t.toLowerCase().contains('food'))) {
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
    return phrases[widget.place.name.length % phrases.length];
  }

  Widget _buildTags(BuildContext context) {
    // 优先使用后端计算好的 displayTagsEn，否则回退到 tags
    final displayTags = widget.place.displayTagsEn ?? widget.place.tags ?? [];
    if (displayTags.isEmpty) return const SizedBox.shrink();

    return Wrap(
      spacing: 4,
      runSpacing: 4,
      children: displayTags
          .take(2)
          .map((tag) => Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
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
              ))
          .toList(),
    );
  }

  /// 处理收藏点击
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
        // 已收藏，移除
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
        widget.onWishlistChanged?.call(false);
        CustomToast.showSuccess(context, 'Removed from wishlist');
      } else {
        // 未收藏，添加
        // 使用 city，如果为空则使用 country，如果都为空则使用 "Saved Places"
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

        // 使用 displayTagsEn 作为 tags，如果没有则回退到原始 tags
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
        widget.onWishlistChanged?.call(true);
        CustomToast.showSuccess(context, 'Saved to wishlist');
      }
    } catch (e) {
      debugPrint('❌ [FlatPlaceCard] Wishlist error: $e');
      CustomToast.showError(context, 'Error saving - please try again');
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // 监听收藏状态变化，自动更新 UI
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

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 3:2 卡片
        GestureDetector(
          onTap: widget.onTap,
          child: AspectRatio(
            aspectRatio: 3 / 2,
            child: Container(
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
                    // 封面图片铺满
                    _buildCoverImage(),
                    // 渐变遮罩 - 增强底部遮罩确保白字可读
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
                    // 右上角收藏按钮 - 收藏后黄底红桃心
                    Positioned(
                      top: 8,
                      right: 8,
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
                            border:
                                Border.all(color: AppTheme.black, width: 1.5),
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
                                  size: 18,
                                  color: AppTheme.black,
                                ),
                        ),
                      ),
                    ),
                    // 底部信息
                    Positioned(
                      left: 12,
                      right: 12,
                      bottom: 12,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // 标签
                          _buildTags(context),
                          const SizedBox(height: 6),
                          // 地点名称
                          Text(
                            widget.place.name,
                            style: AppTheme.labelLarge(context).copyWith(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 4),
                          // 评分或推荐短语
                          _buildRatingOrPhrase(context),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        // Summary 在卡片下方，完整展示不截断
        if (widget.place.summary.isNotEmpty)
          _buildLinkedSummaryText(
            context: context,
            text: widget.place.summary,
            website: widget.place.website,
            ticketUrl: widget.place.ticketUrl,
          ),
      ],
    );
  }
}
