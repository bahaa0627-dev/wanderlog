import 'package:flutter/material.dart';
import 'package:wanderlog/core/theme/app_theme.dart';

/// 标签类型筛选器 - 用于在显示具体标签前先筛选标签类型
class TagTypeFilterBar extends StatelessWidget {
  const TagTypeFilterBar({
    required this.selectedType,
    required this.onTypeChanged,
    super.key,
  });

  final String? selectedType;
  final void Function(String?) onTypeChanged;

  /// 标签类型定义
  static const Map<String, TagTypeInfo> tagTypes = {
    'all': TagTypeInfo(
      key: 'all',
      label: '全部',
      emoji: '🏷️',
      prefixes: [],
    ),
    'architect': TagTypeInfo(
      key: 'architect',
      label: '建筑师',
      emoji: '👤',
      prefixes: ['architect:'],
    ),
    'style': TagTypeInfo(
      key: 'style',
      label: '风格',
      emoji: '🎨',
      prefixes: ['style:'],
    ),
    'theme': TagTypeInfo(
      key: 'theme',
      label: '主题',
      emoji: '🎯',
      prefixes: ['theme:'],
    ),
    'award': TagTypeInfo(
      key: 'award',
      label: '奖项',
      emoji: '🏆',
      prefixes: ['pritzker', 'pritzker_year:'],
    ),
    'domain': TagTypeInfo(
      key: 'domain',
      label: '领域',
      emoji: '🏛️',
      prefixes: ['domain:'],
    ),
    'meal': TagTypeInfo(
      key: 'meal',
      label: '餐饮',
      emoji: '🍽️',
      prefixes: ['meal:'],
    ),
    'shop': TagTypeInfo(
      key: 'shop',
      label: '商店',
      emoji: '🛍️',
      prefixes: ['shop:'],
    ),
  };

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 50,
      padding: const EdgeInsets.symmetric(vertical: 6),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(
          bottom: BorderSide(
            color: AppTheme.lightGray,
            width: 1,
          ),
        ),
      ),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: tagTypes.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final typeKey = tagTypes.keys.elementAt(index);
          final typeInfo = tagTypes[typeKey]!;
          final isSelected = selectedType == typeKey || (selectedType == null && typeKey == 'all');

          return GestureDetector(
            onTap: () {
              onTypeChanged(typeKey == 'all' ? null : typeKey);
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: isSelected ? AppTheme.primaryYellow : Colors.white,
                borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                border: Border.all(
                  color: AppTheme.black,
                  width: AppTheme.borderMedium,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    typeInfo.emoji,
                    style: const TextStyle(fontSize: 16),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    typeInfo.label,
                    style: AppTheme.labelMedium(context).copyWith(
                      fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  /// 根据标签类型筛选标签列表
  static List<String> filterTagsByType(List<String> tags, String? selectedType) {
    if (selectedType == null || selectedType == 'all') {
      return tags;
    }

    final typeInfo = tagTypes[selectedType];
    if (typeInfo == null) {
      return tags;
    }

    return tags.where((tag) {
      final lowerTag = tag.toLowerCase();
      return typeInfo.prefixes.any((prefix) => lowerTag.startsWith(prefix.toLowerCase()));
    }).toList();
  }

  /// 从标签中提取显示名称（去掉前缀）
  static String getTagDisplayName(String tag) {
    // 尝试移除常见前缀
    for (final typeInfo in tagTypes.values) {
      for (final prefix in typeInfo.prefixes) {
        if (tag.toLowerCase().startsWith(prefix.toLowerCase())) {
          return tag.substring(prefix.length);
        }
      }
    }
    return tag;
  }
}

/// 标签类型信息
class TagTypeInfo {
  const TagTypeInfo({
    required this.key,
    required this.label,
    required this.emoji,
    required this.prefixes,
  });

  final String key;
  final String label;
  final String emoji;
  final List<String> prefixes;
}
