import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/ai_recognition/data/models/search_v2_result.dart';
import 'package:wanderlog/features/ai_recognition/providers/wishlist_status_provider.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart' show TripSpotStatus;
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
  bool _isInWishlist = false;
  bool _isSaving = false;
  String? _destinationId;

  @override
  void initState() {
    super.initState();
    // 立即从缓存同步读取收藏状态
    _loadWishlistStatusFromCache();
  }

  @override
  void didUpdateWidget(AIPlaceCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    // 如果 place 变化，重新加载状态
    if (oldWidget.place.id != widget.place.id || oldWidget.place.name != widget.place.name) {
      _loadWishlistStatusFromCache();
    }
  }

  /// 从缓存加载收藏状态（同步，无需等待）
  void _loadWishlistStatusFromCache() {
    final statusAsync = ref.read(wishlistStatusProvider);
    statusAsync.whenData((statusMap) {
      final spotId = widget.place.id ?? widget.place.name;
      final (isInWishlist, destId) = checkWishlistStatus(statusMap, spotId);
      if (mounted && (isInWishlist != _isInWishlist || destId != _destinationId)) {
        setState(() {
          _isInWishlist = isInWishlist;
          _destinationId = destId;
        });
      }
    });
  }

  /// 解码 base64 图片
  Uint8List? _decodeBase64Image(String dataUri) {
    try {
      return base64Decode(dataUri.split(',').last);
    } catch (_) {
      return null;
    }
  }

  /// 构建封面图片
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
        child: Icon(Icons.image_not_supported, size: 48, color: AppTheme.mediumGray),
      ),
    );

    // 如果是 AI-only 地点且没有图片，使用特殊占位符
    if (imageUrl.isEmpty) {
      return widget.place.isAIOnly ? buildAIPlaceholder() : defaultPlaceholder;
    }

    if (imageUrl.startsWith('data:')) {
      final bytes = _decodeBase64Image(imageUrl);
      if (bytes != null) {
        return Image.memory(
          bytes,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => widget.place.isAIOnly ? buildAIPlaceholder() : defaultPlaceholder,
        );
      }
      return widget.place.isAIOnly ? buildAIPlaceholder() : defaultPlaceholder;
    }

    return Image.network(
      imageUrl,
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
      errorBuilder: (_, __, ___) => widget.place.isAIOnly ? buildAIPlaceholder() : defaultPlaceholder,
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
    if (tags.any((t) => t.toLowerCase().contains('museum') || t.toLowerCase().contains('gallery'))) {
      return 'Cultural treasure';
    }
    if (tags.any((t) => t.toLowerCase().contains('temple') || t.toLowerCase().contains('shrine'))) {
      return 'Sacred landmark';
    }
    if (tags.any((t) => t.toLowerCase().contains('park') || t.toLowerCase().contains('garden'))) {
      return 'Scenic retreat';
    }
    if (tags.any((t) => t.toLowerCase().contains('cafe') || t.toLowerCase().contains('coffee'))) {
      return 'Local favorite';
    }
    if (tags.any((t) => t.toLowerCase().contains('restaurant') || t.toLowerCase().contains('food'))) {
      return 'Culinary gem';
    }
    if (name.contains('castle') || name.contains('palace')) {
      return 'Historic landmark';
    }
    if (name.contains('tower') || name.contains('view')) {
      return 'Iconic viewpoint';
    }
    
    // 随机选择一个通用短语
    final phrases = ['Must-visit', 'Hidden gem', 'Local pick', 'Worth exploring', 'Traveler favorite'];
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
        final cityName = widget.place.city?.isNotEmpty == true 
            ? widget.place.city! 
            : (widget.place.country?.isNotEmpty == true 
                ? widget.place.country! 
                : 'Saved Places');
        
        final destId = await ensureDestinationForCity(ref, cityName);
        if (destId == null) {
          CustomToast.showError(context, 'Failed to save - please try again');
          return;
        }

        // 使用 displayTagsEn 作为 tags，如果没有则回退到原始 tags
        final effectiveTags = widget.place.displayTagsEn ?? widget.place.tags ?? [];

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
      debugPrint('❌ [AIPlaceCard] Wishlist error: $e');
      CustomToast.showError(context, 'Error saving - please try again');
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      child: AspectRatio(
        aspectRatio: widget.aspectRatio,
        child: Container(
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
                // 封面图片
                _buildCoverImage(widget.place.coverImage),
                // 渐变遮罩
                Positioned.fill(
                  child: Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          Colors.black.withOpacity(0.7),
                        ],
                        stops: const [0.4, 1.0],
                      ),
                    ),
                  ),
                ),
                // 右上角收藏按钮 - 收藏后黄底黑桃心
                Positioned(
                  top: 8,
                  right: 8,
                  child: GestureDetector(
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
                                valueColor: AlwaysStoppedAnimation<Color>(AppTheme.black),
                              ),
                            )
                          : Icon(
                              _isInWishlist ? Icons.favorite : Icons.favorite_border,
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
    );
  }
}
