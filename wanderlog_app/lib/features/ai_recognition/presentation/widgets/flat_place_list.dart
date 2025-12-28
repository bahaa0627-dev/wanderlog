import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/ai_recognition/data/models/search_v2_result.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart' show TripSpotStatus;
import 'package:wanderlog/shared/utils/destination_utils.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';

/// 平铺展示组件 - 无分类时使用
/// 
/// Requirements: 9.4, 9.5
/// - 无分类时使用此组件
/// - 最多显示 5 个地点
/// - 3:2 横向卡片，summary 在卡片上方
/// - 去掉 AI/Verified 标签
class FlatPlaceList extends StatelessWidget {
  const FlatPlaceList({
    required this.places,
    this.onPlaceTap,
    this.maxPlaces = 5,
    super.key,
  });

  /// 地点列表
  final List<PlaceResult> places;

  /// 地点点击回调
  final void Function(PlaceResult place)? onPlaceTap;

  /// 最大显示数量
  final int maxPlaces;

  @override
  Widget build(BuildContext context) {
    // 限制最多显示 5 个地点
    final displayPlaces = places.take(maxPlaces).toList();

    if (displayPlaces.isEmpty) {
      return const SizedBox.shrink();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (int i = 0; i < displayPlaces.length; i++) ...[
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: FlatPlaceCard(
              place: displayPlaces[i],
              onTap: () => onPlaceTap?.call(displayPlaces[i]),
            ),
          ),
          if (i < displayPlaces.length - 1) const SizedBox(height: 16),
        ],
      ],
    );
  }
}

/// 3:2 横向地点卡片 - 用于无分类平铺展示
/// Summary 在卡片上方，卡片内只有图片、标签、名称、评分和收藏按钮
class FlatPlaceCard extends ConsumerStatefulWidget {
  const FlatPlaceCard({
    required this.place,
    this.onTap,
    super.key,
  });

  final PlaceResult place;
  final VoidCallback? onTap;

  @override
  ConsumerState<FlatPlaceCard> createState() => _FlatPlaceCardState();
}

class _FlatPlaceCardState extends ConsumerState<FlatPlaceCard> {
  bool _isInWishlist = false;
  bool _isSaving = false;

  Widget _buildCoverImage() {
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
      errorBuilder: (_, __, ___) => widget.place.isAIOnly ? buildAIPlaceholder() : defaultPlaceholder,
    );
  }

  Widget _buildRatingOrPhrase(BuildContext context) {
    // AI-only 地点显示推荐短语
    if (widget.place.isAIOnly || !widget.place.hasRating) {
      final phrase = widget.place.recommendationPhrase ?? 'Recommended';
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.auto_awesome, size: 14, color: AppTheme.primaryYellow),
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

  Widget _buildTags(BuildContext context) {
    final tags = widget.place.tags ?? [];
    if (tags.isEmpty) return const SizedBox.shrink();

    return Wrap(
      spacing: 4,
      runSpacing: 4,
      children: tags.take(2).map((tag) {
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
      if (_isInWishlist) {
        // 已收藏，移除
        setState(() => _isInWishlist = false);
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
            'tags': widget.place.tags,
            'coverImage': widget.place.coverImage,
            'images': [widget.place.coverImage],
            'googlePlaceId': widget.place.googlePlaceId,
            'source': widget.place.source.name,
          },
        );

        ref.invalidate(tripsProvider);
        setState(() => _isInWishlist = true);
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Summary 在卡片上方，流文本形式
        if (widget.place.summary.isNotEmpty) ...[
          Text(
            widget.place.summary,
            style: AppTheme.bodyMedium(context).copyWith(
              color: AppTheme.mediumGray,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 8),
        ],
        // 3:2 卡片
        GestureDetector(
          onTap: widget.onTap,
          child: AspectRatio(
            aspectRatio: 3 / 2,
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
                    // 封面图片铺满
                    _buildCoverImage(),
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
                            stops: const [0.5, 1.0],
                          ),
                        ),
                      ),
                    ),
                    // 右上角收藏按钮
                    Positioned(
                      top: 8,
                      right: 8,
                      child: GestureDetector(
                        onTap: _handleWishlistTap,
                        child: Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            shape: BoxShape.circle,
                            border: Border.all(color: AppTheme.black, width: 1.5),
                          ),
                          child: _isSaving
                              ? const Padding(
                                  padding: EdgeInsets.all(8),
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    valueColor: AlwaysStoppedAnimation<Color>(AppTheme.black),
                                  ),
                                )
                              : Icon(
                                  _isInWishlist ? Icons.favorite : Icons.favorite_border,
                                  size: 18,
                                  color: _isInWishlist ? Colors.red : AppTheme.black,
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
      ],
    );
  }
}
