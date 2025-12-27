import 'package:flutter/material.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/ai_recognition/data/models/search_v2_result.dart';

/// 平铺展示组件 - 横向卡片布局
/// 
/// Requirements: 9.4, 9.5
/// - 无分类时使用此组件
/// - 最多显示 5 个地点
/// - 横向卡片样式
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
            child: HorizontalPlaceCard(
              place: displayPlaces[i],
              onTap: () => onPlaceTap?.call(displayPlaces[i]),
            ),
          ),
          if (i < displayPlaces.length - 1) const SizedBox(height: 12),
        ],
      ],
    );
  }
}

/// 横向地点卡片 - 用于平铺展示
class HorizontalPlaceCard extends StatelessWidget {
  const HorizontalPlaceCard({
    required this.place,
    this.onTap,
    super.key,
  });

  /// 地点数据
  final PlaceResult place;

  /// 点击回调
  final VoidCallback? onTap;

  /// 构建封面图片
  Widget _buildCoverImage() {
    const placeholder = ColoredBox(
      color: AppTheme.lightGray,
      child: Center(
        child: Icon(Icons.image_not_supported, size: 32, color: AppTheme.mediumGray),
      ),
    );

    if (place.coverImage.isEmpty) return placeholder;

    return Image.network(
      place.coverImage,
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
      errorBuilder: (_, __, ___) => placeholder,
    );
  }

  /// 构建评分或推荐短语
  Widget _buildRatingOrPhrase(BuildContext context) {
    // AI-only 地点显示推荐短语
    if (place.isAIOnly || !place.hasRating) {
      final phrase = place.recommendationPhrase ?? 'AI Recommended';
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.auto_awesome,
            size: 14,
            color: AppTheme.accentBlue,
          ),
          const SizedBox(width: 4),
          Text(
            phrase,
            style: AppTheme.bodySmall(context).copyWith(
              color: AppTheme.accentBlue,
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
          place.rating!.toStringAsFixed(1),
          style: AppTheme.bodySmall(context).copyWith(
            color: AppTheme.black,
            fontWeight: FontWeight.w600,
          ),
        ),
        if (place.ratingCount != null) ...[
          const SizedBox(width: 4),
          Text(
            '(${place.ratingCount})',
            style: AppTheme.bodySmall(context).copyWith(
              color: AppTheme.mediumGray,
              fontSize: 12,
            ),
          ),
        ],
      ],
    );
  }

  /// 构建标签列表
  Widget _buildTags(BuildContext context) {
    final tags = place.tags ?? [];
    if (tags.isEmpty) return const SizedBox.shrink();

    return Wrap(
      spacing: 4,
      runSpacing: 4,
      children: tags.take(2).map((tag) {
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: AppTheme.primaryYellow.withOpacity(0.3),
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
        );
      }).toList(),
    );
  }

  /// 构建来源标识
  Widget _buildSourceBadge(BuildContext context) {
    if (place.isVerified) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: AppTheme.accentGreen,
          borderRadius: BorderRadius.circular(4),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.verified, size: 10, color: Colors.white),
            const SizedBox(width: 2),
            Text(
              'Verified',
              style: AppTheme.bodySmall(context).copyWith(
                color: Colors.white,
                fontSize: 9,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: AppTheme.accentBlue,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.auto_awesome, size: 10, color: Colors.white),
          const SizedBox(width: 2),
          Text(
            'AI',
            style: AppTheme.bodySmall(context).copyWith(
              color: Colors.white,
              fontSize: 9,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 120,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
          border: Border.all(color: AppTheme.black, width: AppTheme.borderMedium),
          boxShadow: AppTheme.cardShadow,
        ),
        child: Row(
          children: [
            // 左侧图片
            SizedBox(
              width: 120,
              child: ClipRRect(
                borderRadius: const BorderRadius.horizontal(
                  left: Radius.circular(AppTheme.radiusMedium - 2),
                ),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    _buildCoverImage(),
                    // 来源标识
                    Positioned(
                      top: 6,
                      left: 6,
                      child: _buildSourceBadge(context),
                    ),
                  ],
                ),
              ),
            ),
            // 右侧信息
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // 标签
                    _buildTags(context),
                    if ((place.tags ?? []).isNotEmpty) const SizedBox(height: 4),
                    // 地点名称
                    Text(
                      place.name,
                      style: AppTheme.labelLarge(context).copyWith(
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    // 评分或推荐短语
                    _buildRatingOrPhrase(context),
                    // Summary
                    if (place.summary.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        place.summary,
                        style: AppTheme.bodySmall(context).copyWith(
                          color: AppTheme.mediumGray,
                          fontSize: 12,
                          height: 1.2,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
