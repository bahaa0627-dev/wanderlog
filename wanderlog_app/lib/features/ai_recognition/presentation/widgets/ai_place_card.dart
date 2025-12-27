import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/ai_recognition/data/models/search_v2_result.dart';

/// AI 地点卡片组件
/// 
/// Requirements: 11.1, 11.2, 11.4
/// - 显示 recommendationPhrase 替代评分（AI-only 地点）
/// - 显示 AI 标签和 summary
/// - 支持 4:3 和横向两种布局
class AIPlaceCard extends StatelessWidget {
  const AIPlaceCard({
    required this.place,
    this.aspectRatio = 4 / 3,
    this.onTap,
    this.showSummary = true,
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
    const placeholder = ColoredBox(
      color: AppTheme.lightGray,
      child: Center(
        child: Icon(Icons.image_not_supported, size: 48, color: AppTheme.mediumGray),
      ),
    );

    if (imageUrl.isEmpty) return placeholder;

    if (imageUrl.startsWith('data:')) {
      final bytes = _decodeBase64Image(imageUrl);
      if (bytes != null) {
        return Image.memory(
          bytes,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => placeholder,
        );
      }
      return placeholder;
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
      errorBuilder: (_, __, ___) => placeholder,
    );
  }

  /// 构建评分或推荐短语
  Widget _buildRatingOrPhrase(BuildContext context) {
    // AI-only 地点显示推荐短语
    if (place.isAIOnly || !place.hasRating) {
      final phrase = place.recommendationPhrase ?? 'AI Recommended';
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: AppTheme.accentBlue.withOpacity(0.9),
          borderRadius: BorderRadius.circular(4),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.auto_awesome, size: 12, color: Colors.white),
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
        ),
      );
    }

    // 有评分的地点显示评分
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.star, size: 16, color: AppTheme.primaryYellow),
        const SizedBox(width: 4),
        Text(
          place.rating!.toStringAsFixed(1),
          style: AppTheme.bodySmall(context).copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w600,
          ),
        ),
        if (place.ratingCount != null) ...[
          const SizedBox(width: 4),
          Text(
            '(${place.ratingCount})',
            style: AppTheme.bodySmall(context).copyWith(
              color: Colors.white.withOpacity(0.8),
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
      children: tags.take(3).map((tag) {
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: AppTheme.primaryYellow,
            borderRadius: BorderRadius.circular(4),
            border: Border.all(color: AppTheme.black, width: 1),
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

  /// 构建来源标识
  Widget _buildSourceBadge(BuildContext context) {
    if (place.isVerified) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: AppTheme.accentGreen.withOpacity(0.9),
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
        color: AppTheme.accentBlue.withOpacity(0.9),
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
      child: AspectRatio(
        aspectRatio: aspectRatio,
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
                _buildCoverImage(place.coverImage),
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
                // 左上角来源标识
                Positioned(
                  top: 8,
                  left: 8,
                  child: _buildSourceBadge(context),
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
                      const SizedBox(height: 8),
                      // 地点名称
                      Text(
                        place.name,
                        style: AppTheme.labelLarge(context).copyWith(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      // 评分或推荐短语
                      _buildRatingOrPhrase(context),
                      // Summary（可选）
                      if (showSummary && place.summary.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          place.summary,
                          style: AppTheme.bodySmall(context).copyWith(
                            color: Colors.white.withOpacity(0.9),
                            fontSize: 12,
                            height: 1.3,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
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
