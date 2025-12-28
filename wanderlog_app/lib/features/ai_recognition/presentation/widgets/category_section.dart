import 'package:flutter/material.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/ai_recognition/data/models/search_v2_result.dart';
import 'package:wanderlog/features/ai_recognition/presentation/widgets/ai_place_card.dart';

/// 分类展示组件 - 横滑 4:3 卡片布局
/// 
/// Requirements: 9.1, 9.2, 9.3
/// - 显示分类标题（左对齐）
/// - 每个分类 2-5 个地点
/// - 横向滚动的 4:3 卡片
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
    // 限制每个分类显示 2-5 个地点
    final displayPlaces = category.places.take(5).toList();
    if (displayPlaces.length < 2) {
      // 如果少于 2 个地点，不显示该分类
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
        const SizedBox(height: 12),
        // 横滑卡片列表 - 使用负 margin 让卡片延伸到屏幕边缘
        Transform.translate(
          offset: const Offset(-16, 0), // 向左偏移抵消外层 padding
          child: SizedBox(
            width: MediaQuery.of(context).size.width, // 占满屏幕宽度
            height: 240,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.only(left: 16, right: 16), // 左边 16px 让第一个卡片对齐标题
              clipBehavior: Clip.none,
              itemCount: displayPlaces.length,
              separatorBuilder: (_, __) => const SizedBox(width: 12),
              itemBuilder: (context, index) {
                final place = displayPlaces[index];
                return SizedBox(
                  width: 280, // 4:3 比例宽度
                  child: AIPlaceCard(
                    place: place,
                    aspectRatio: 4 / 3,
                    onTap: () => onPlaceTap?.call(place),
                    showSummary: false, // 分类卡片不显示 summary，避免 overflow
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
    // 过滤掉少于 2 个地点的分类
    final validCategories = categories.where((c) => c.places.length >= 2).toList();

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
          if (i < validCategories.length - 1) const SizedBox(height: 24),
        ],
      ],
    );
  }
}
