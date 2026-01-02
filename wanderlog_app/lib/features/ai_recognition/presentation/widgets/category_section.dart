import 'package:flutter/material.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/ai_recognition/data/models/search_v2_result.dart';
import 'package:wanderlog/features/ai_recognition/presentation/widgets/ai_place_card.dart';

/// 分类展示组件 - 横滑 4:3 卡片布局
/// 
/// Requirements: 9.1, 9.2, 9.3
/// - 显示分类标题（左对齐）
/// - 每个分类至少 2 个有图片的地点
/// - 横向滚动的 4:3 卡片（仅有图片的地点）
/// - 每个卡片下方显示 summary，跟随卡片一起横滑
/// - 没有图片的地点不展示
/// - 标题和第一个卡片左对齐
class CategorySection extends StatelessWidget {
  const CategorySection({
    required this.category,
    this.onPlaceTap,
    super.key,
  });

  /// 分类数据
  final CategoryGroup category;

  /// 地点点击回调
  final void Function(PlaceResult place)? onPlaceTap;

  @override
  Widget build(BuildContext context) {
    // 只显示有图片的地点
    final placesWithImage = category.places
        .where((p) => p.coverImage.isNotEmpty)
        .take(10)
        .toList();
    
    // 如果有图片的地点少于 2 个，不显示该分类
    if (placesWithImage.length < 2) {
      return const SizedBox.shrink();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 分类标题 - 左对齐，不需要额外 padding（外层已有 16px）
        Text(
          category.title,
          style: AppTheme.headlineMedium(context).copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        // 横滑卡片列表 - 仅显示有图片的地点，每个卡片下方带 summary
        Transform.translate(
          offset: const Offset(-16, 0), // 向左偏移抵消外层 padding
          child: SizedBox(
            width: MediaQuery.of(context).size.width, // 占满屏幕宽度
            height: 290, // 卡片 210 + 间距 8 + summary 最多约 60 + 底部间距 12
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.only(left: 16, right: 16), // 左边 16px 让第一个卡片对齐标题
              clipBehavior: Clip.none,
              itemCount: placesWithImage.length,
              separatorBuilder: (_, __) => const SizedBox(width: 12),
              itemBuilder: (context, index) {
                final place = placesWithImage[index];
                return SizedBox(
                  width: 280, // 4:3 比例宽度
                  child: _PlaceCardWithSummary(
                    place: place,
                    onTap: () => onPlaceTap?.call(place),
                  ),
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}

/// 带 summary 的卡片组件 - 卡片 + 下方 summary
class _PlaceCardWithSummary extends StatelessWidget {
  const _PlaceCardWithSummary({
    required this.place,
    this.onTap,
  });

  final PlaceResult place;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 4:3 卡片
        SizedBox(
          height: 210, // 固定卡片高度
          child: AIPlaceCard(
            place: place,
            aspectRatio: 4 / 3,
            onTap: onTap,
            showSummary: false,
          ),
        ),
        const SizedBox(height: 8),
        // Summary 在卡片下方，最多 3 行，超出显示...
        if (place.summary.isNotEmpty)
          Text(
            place.summary,
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
}

/// 多分类展示组件 - 用于展示多个分类
class CategorizedPlacesList extends StatelessWidget {
  const CategorizedPlacesList({
    required this.categories,
    this.onPlaceTap,
    super.key,
  });

  /// 分类列表
  final List<CategoryGroup> categories;

  /// 地点点击回调
  final void Function(PlaceResult place)? onPlaceTap;

  @override
  Widget build(BuildContext context) {
    // 过滤掉没有任何有图片地点的分类
    final validCategories = categories.where((c) {
      final placesWithImage = c.places.where((p) => p.coverImage.isNotEmpty).length;
      return placesWithImage >= 1; // 至少 1 个有图片的地点
    }).toList();

    if (validCategories.isEmpty) {
      return const SizedBox.shrink();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (int i = 0; i < validCategories.length; i++) ...[
          CategorySection(
            category: validCategories[i],
            onPlaceTap: onPlaceTap,
          ),
          if (i < validCategories.length - 1) const SizedBox(height: 12), // 减小分类间距
        ],
      ],
    );
  }
}
