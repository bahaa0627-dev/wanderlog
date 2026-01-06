import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/ai_recognition/data/models/search_v2_result.dart';
import 'package:wanderlog/features/ai_recognition/providers/wishlist_status_provider.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart'
    show TripSpotStatus;
import 'package:wanderlog/shared/utils/destination_utils.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';

/// AI 地点卡片组件
///
/// Requirements: 11.1, 11.2, 11.4
/// - 显示 recommendationPhrase 替代评分（AI-only 地点）
/// - 显示标签和 summary
/// - 支持 4:3 和横向两种布局
/// - 去掉 AI/Verified 标签，添加收藏按钮
class AIPlaceCard extends ConsumerStatefulWidget {
  const AIPlaceCard({
    required this.place,
    this.aspectRatio = 4 / 3,
    this.onTap,
    this.showSummary = true,
    this.onWishlistChanged,
    super.key,
  });

  /// 地点数据
  final PlaceResult place;

  /// 卡片宽高比（默认 4:3）
  final double aspectRatio;

  /// 点击回调
  final VoidCallback? onTap;

  /// 是否显示 summary
  final bool showSummary;

  /// 收藏状态变化回调
  final void Function(bool isInWishlist)? onWishlistChanged;

  @override
  ConsumerState<AIPlaceCard> createState() => _AIPlaceCardState();
}

class _AIPlaceCardState extends ConsumerState<AIPlaceCard> {
  bool _isSaving = false;
  int _imageRetryCount = 0;
  static const int _maxRetries = 3;
  String? _currentImageUrl;
  
  // 乐观更新状态
  bool? _optimisticWishlistState;

  /// 获取当前地点的 spotId
  String get _spotId => widget.place.id ?? widget.place.name;

  /// 从 provider 获取收藏状态（响应式）
  (bool, String?) _getWishlistStatus(Map<String, String?> statusMap) {
    // 如果有乐观更新状态，优先使用
    if (_optimisticWishlistState != null) {
      return (_optimisticWishlistState!, statusMap[_spotId]);
    }
    return checkWishlistStatus(statusMap, _spotId);
  }

  @override
  void initState() {
    super.initState();
    _currentImageUrl = widget.place.coverImage;
  }

  @override
  void didUpdateWidget(AIPlaceCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    // 如果 place 变化，重置图片状态和乐观更新状态
    if (oldWidget.place.id != widget.place.id ||
        oldWidget.place.coverImage != widget.place.coverImage) {
      _imageRetryCount = 0;
      _currentImageUrl = widget.place.coverImage;
      _optimisticWishlistState = null;
    }
  }

  /// 解码 base64 图片
  Uint8List? _decodeBase64Image(String dataUri) {
    try {
      return base64Decode(dataUri.split(',').last);
    } catch (_) {
      return null;
    }
  }

  /// 重试加载图片
  void _retryImageLoad() {
    if (_imageRetryCount < _maxRetries && mounted) {
      setState(() {
        _imageRetryCount++;
        // 添加时间戳强制刷新缓存
        final baseUrl = widget.place.coverImage;
        if (baseUrl.isNotEmpty && !baseUrl.startsWith('data:')) {
          final separator = baseUrl.contains('?') ? '&' : '?';
          _currentImageUrl =
              '$baseUrl${separator}_retry=$_imageRetryCount&_t=${DateTime.now().millisecondsSinceEpoch}';
        }
      });
      debugPrint(
          '🔄 [AIPlaceCard] Retrying image load for "${widget.place.name}" (attempt $_imageRetryCount/$_maxRetries)');
    }
  }

  /// 构建封面图片（带重试机制）
  Widget _buildCoverImage(String imageUrl) {
    // AI 地点的占位符 - 使用渐变背景和图标
    Widget buildAIPlaceholder() {
      return Container(
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
    }

    const defaultPlaceholder = ColoredBox(
      color: AppTheme.lightGray,
      child: Center(
        child: Icon(Icons.image_not_supported,
            size: 48, color: AppTheme.mediumGray),
      ),
    );

    // 使用当前图片 URL（可能包含重试参数）
    final effectiveUrl = _currentImageUrl ?? imageUrl;

    // 如果是 AI-only 地点且没有图片，使用特殊占位符
    if (effectiveUrl.isEmpty) {
      return widget.place.isAIOnly ? buildAIPlaceholder() : defaultPlaceholder;
    }

    if (effectiveUrl.startsWith('data:')) {
      final bytes = _decodeBase64Image(effectiveUrl);
      if (bytes != null) {
        return Image.memory(
          bytes,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) =>
              widget.place.isAIOnly ? buildAIPlaceholder() : defaultPlaceholder,
        );
      }
      return widget.place.isAIOnly ? buildAIPlaceholder() : defaultPlaceholder;
    }

    return Image.network(
      effectiveUrl,
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
      errorBuilder: (context, error, stackTrace) {
        debugPrint(
            '❌ [AIPlaceCard] Image load failed for "${widget.place.name}": $error');
        // 如果还有重试次数，延迟后重试
        if (_imageRetryCount < _maxRetries) {
          Future.delayed(Duration(milliseconds: 500 * (_imageRetryCount + 1)),
              _retryImageLoad);
        }
        // 显示加载中状态（等待重试）
        if (_imageRetryCount < _maxRetries) {
          return const ColoredBox(
            color: AppTheme.lightGray,
            child: Center(
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor:
                    AlwaysStoppedAnimation<Color>(AppTheme.primaryYellow),
              ),
            ),
          );
        }
        return widget.place.isAIOnly
            ? buildAIPlaceholder()
            : defaultPlaceholder;
      },
    );
  }

  /// 构建评分或推荐短语
  Widget _buildRatingOrPhrase(BuildContext context) {
    // AI-only 地点显示推荐短语
    if (widget.place.isAIOnly || !widget.place.hasRating) {
      // 使用 AI 返回的推荐短语，如果没有则根据地点特征生成
      final phrase = widget.place.recommendationPhrase?.isNotEmpty == true
          ? widget.place.recommendationPhrase!
          : _getDefaultPhrase();
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.auto_awesome, size: 12, color: AppTheme.primaryYellow),
          const SizedBox(width: 4),
          Text(
            phrase,
            style: AppTheme.bodySmall(context).copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w600,
              fontSize: 11,
            ),
          ),
        ],
      );
    }

    // 有评分的地点显示评分
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
            '(${widget.place.ratingCount})',
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

    // 根据标签或名称特征选择短语
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

    // 随机选择一个通用短语
    final phrases = [
      'Must-visit',
      'Hidden gem',
      'Local pick',
      'Worth exploring',
      'Traveler favorite'
    ];
    return phrases[widget.place.name.length % phrases.length];
  }

  /// 构建标签列表
  Widget _buildTags(BuildContext context) {
    // 优先使用后端计算好的 displayTagsEn，否则回退到 tags
    final displayTags = widget.place.displayTagsEn ?? widget.place.tags ?? [];
    if (displayTags.isEmpty) return const SizedBox.shrink();

    return Wrap(
      spacing: 4,
      runSpacing: 4,
      children: displayTags.take(2).map((tag) {
        return Container(
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
        );
      }).toList(),
    );
  }

  /// 处理收藏点击
  ///
  /// Requirements: 2.1, 2.2, 2.3, 2.4
  /// - Invalidate and refresh wishlist status cache after API call
  /// - Update heart icon to filled/unfilled state
  /// - Show success/error toast message
  /// - Revert state on failure
  Future<void> _handleWishlistTap(
      bool isInWishlist, String? destinationId) async {
    if (_isSaving) return;

    final auth = ref.read(authProvider);
    if (!auth.isAuthenticated) {
      final authed = await requireAuth(context, ref);
      if (!authed) return;
    }

    setState(() => _isSaving = true);
    
    // 乐观更新：立即更新 UI 状态
    final previousState = _optimisticWishlistState;
    setState(() => _optimisticWishlistState = !isInWishlist);

    try {
      if (isInWishlist && destinationId != null) {
        // 已收藏，移除
        await ref.read(tripRepositoryProvider).manageTripSpot(
              tripId: destinationId,
              spotId: _spotId,
              remove: true,
            );

        // Invalidate providers and wait for refresh to complete
        // This ensures UI updates with fresh data before showing toast
        ref.invalidate(tripsProvider);
        ref.invalidate(wishlistStatusProvider);

        // Force provider refresh by reading the future - ensures UI state is updated
        await ref.read(wishlistStatusProvider.future);
        
        // 清除乐观更新状态，使用真实数据
        if (mounted) {
          setState(() => _optimisticWishlistState = null);
        }

        // Call callback after provider refresh completes
        widget.onWishlistChanged?.call(false);

        if (mounted) {
          CustomToast.showSuccess(context, 'Removed from wishlist');
        }
      } else {
        // 未收藏，添加
        // 使用 city，如果为空则使用 country，如果都为空则使用 "Saved Places"
        final cityName = widget.place.city?.isNotEmpty == true
            ? widget.place.city!
            : (widget.place.country?.isNotEmpty == true
                ? widget.place.country!
                : 'Saved Places');

        final destId = await ensureDestinationForCity(ref, cityName);
        if (destId == null) {
          if (mounted) {
            // 回滚乐观更新
            setState(() {
              _optimisticWishlistState = previousState;
              _isSaving = false;
            });
            CustomToast.showError(context, 'Failed to save - please try again');
          }
          return;
        }

        // 使用 displayTagsEn 作为 tags，如果没有则回退到原始 tags
        final effectiveTags =
            widget.place.displayTagsEn ?? widget.place.tags ?? [];

        await ref.read(tripRepositoryProvider).manageTripSpot(
          tripId: destId,
          spotId: _spotId,
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

        // Invalidate providers and wait for refresh to complete
        // This ensures UI updates with fresh data before showing toast
        ref.invalidate(tripsProvider);
        ref.invalidate(wishlistStatusProvider);

        // Force provider refresh by reading the future - ensures UI state is updated
        await ref.read(wishlistStatusProvider.future);
        
        // 清除乐观更新状态，使用真实数据
        if (mounted) {
          setState(() => _optimisticWishlistState = null);
        }

        // Call callback after provider refresh completes
        widget.onWishlistChanged?.call(true);

        if (mounted) {
          CustomToast.showSuccess(context, 'Saved to wishlist');
        }
      }
    } catch (e) {
      debugPrint('❌ [AIPlaceCard] Wishlist error: $e');
      // 回滚乐观更新
      if (mounted) {
        setState(() => _optimisticWishlistState = previousState);
        CustomToast.showError(context, 'Error saving - please try again');
      }
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // 使用 ref.watch 响应式获取收藏状态
    final wishlistAsync = ref.watch(wishlistStatusProvider);

    Widget wrapWithSummary(Widget card) {
      if (!widget.showSummary || widget.place.summary.isEmpty) return card;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          card,
          const SizedBox(height: 8),
          Text(
            widget.place.summary,
            style: AppTheme.bodySmall(context).copyWith(
              color: AppTheme.darkGray,
              height: 1.4,
              fontSize: 13,
            ),
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      );
    }

    return wishlistAsync.when(
      data: (statusMap) {
        final (isInWishlist, destinationId) = _getWishlistStatus(statusMap);

        return wrapWithSummary(
          GestureDetector(
            onTap: widget.onTap,
            child: AspectRatio(
              aspectRatio: widget.aspectRatio,
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                  border: Border.all(
                      color: AppTheme.black, width: AppTheme.borderMedium),
                  boxShadow: AppTheme.cardShadow,
                ),
                child: ClipRRect(
                  borderRadius:
                      BorderRadius.circular(AppTheme.radiusMedium - 2),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      // 封面图片
                      _buildCoverImage(widget.place.coverImage),
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
                              stops: const [0.35, 0.65, 1.0],
                            ),
                          ),
                        ),
                      ),
                      // 右上角收藏按钮 - 收藏后黄底黑桃心
                      Positioned(
                        top: 8,
                        right: 8,
                        child: GestureDetector(
                          onTap: () =>
                              _handleWishlistTap(isInWishlist, destinationId),
                          child: Container(
                            width: 32,
                            height: 32,
                            decoration: BoxDecoration(
                              color: isInWishlist
                                  ? AppTheme.primaryYellow
                                  : Colors.white,
                              shape: BoxShape.circle,
                              border:
                                  Border.all(color: AppTheme.black, width: 1.5),
                            ),
                            child: _isSaving
                                ? const Padding(
                                    padding: EdgeInsets.all(6),
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      valueColor: AlwaysStoppedAnimation<Color>(
                                          AppTheme.black),
                                    ),
                                  )
                                : Icon(
                                    isInWishlist
                                        ? Icons.favorite
                                        : Icons.favorite_border,
                                    size: 16,
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
                                fontSize: 16,
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
        );
      },
      loading: () =>
          wrapWithSummary(_buildCardWithWishlistState(context, false)),
      error: (_, __) =>
          wrapWithSummary(_buildCardWithWishlistState(context, false)),
    );
  }

  /// 构建带有指定收藏状态的卡片（用于 loading/error 状态）
  Widget _buildCardWithWishlistState(BuildContext context, bool isInWishlist) {
    return GestureDetector(
      onTap: widget.onTap,
      child: AspectRatio(
        aspectRatio: widget.aspectRatio,
        child: Container(
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
              children: [
                _buildCoverImage(widget.place.coverImage),
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
                        stops: const [0.35, 0.65, 1.0],
                      ),
                    ),
                  ),
                ),
                Positioned(
                  top: 8,
                  right: 8,
                  child: GestureDetector(
                    onTap: () => _handleWishlistTap(false, null),
                    child: Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppTheme.black, width: 1.5),
                      ),
                      child: const Icon(Icons.favorite_border,
                          size: 16, color: AppTheme.black),
                    ),
                  ),
                ),
                Positioned(
                  left: 12,
                  right: 12,
                  bottom: 12,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _buildTags(context),
                      const SizedBox(height: 6),
                      Text(
                        widget.place.name,
                        style: AppTheme.labelLarge(context).copyWith(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      _buildRatingOrPhrase(context),
                    ],
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
