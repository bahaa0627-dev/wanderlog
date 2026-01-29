import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';
import 'package:wanderlog/features/search/providers/countries_cities_stats_provider.dart';
import 'package:wanderlog/features/search/presentation/pages/search_results_map_page.dart';

/// 搜索菜单组件 - 从搜索框下方弹出
class SearchMenuOverlay extends ConsumerStatefulWidget {
  const SearchMenuOverlay({
    required this.searchBoxKey, required this.onClose, super.key,
  });

  final GlobalKey searchBoxKey;
  final VoidCallback onClose;

  @override
  ConsumerState<SearchMenuOverlay> createState() => _SearchMenuOverlayState();
}

class _SearchMenuOverlayState extends ConsumerState<SearchMenuOverlay> {
  static const int _minPlaceCount = 5;
  String? _selectedCountry;
  String? _selectedCity;
  final Set<String> _selectedTags = {};

  // 兴趣标签分类 - 前端展示标签
  static const Map<String, List<String>> _interestCategories = {
    'Things to do': ['Museum', 'Attraction', 'Store', 'Park', 'Cemetery'],
    'Arts': ['Architecture', 'Pilgrimage', 'Knitting'],
    'Food': ['Cafe', 'Bakery', 'Brunch', 'Restaurant'],
  };

  // 前端标签到后端分类/标签的映射（忽略大小写）
  // category: 匹配 category 字段
  // tags: 匹配 tags 或 ai_tags 字段
  static const Map<String, Map<String, dynamic>> _tagMapping = {
    // Things to do
    'museum': {'type': 'category', 'values': ['museum']},
    'attraction': {'type': 'category', 'values': ['landmark', 'castle', 'church', 'library', 'art_gallery']},
    'store': {'type': 'category', 'values': ['shop', 'bookstore', 'thrift_store', 'market', 'shopping_mall']},
    'park': {'type': 'category', 'values': ['park']},
    'cemetery': {'type': 'category', 'values': ['cemetery']},
    // Arts
    'architecture': {'type': 'tags', 'values': ['architecture', 'domain:architecture']},
    'pilgrimage': {'type': 'tags', 'values': ['pilgrimage']},
    'knitting': {'type': 'category', 'values': ['yarn_store']},
    // Food
    'cafe': {'type': 'category', 'values': ['cafe']},
    'bakery': {'type': 'category', 'values': ['bakery']},
    'brunch': {'type': 'tags', 'values': ['brunch', 'meal:brunch']},
    'restaurant': {'type': 'category', 'values': ['restaurant', 'bar']},
  };

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(countriesCitiesStatsProvider.notifier).load();
    });
  }

  /// 将前端选中的标签转换为后端查询参数
  static Map<String, List<String>> convertTagsForSearch(Set<String> selectedTags) {
    final categories = <String>{};
    final tags = <String>{};
    
    for (final tag in selectedTags) {
      final mapping = _tagMapping[tag.toLowerCase()];
      if (mapping != null) {
        final type = mapping['type'] as String;
        final values = mapping['values'] as List<String>;
        if (type == 'category') {
          categories.addAll(values);
        } else if (type == 'tags') {
          tags.addAll(values);
        }
      }
    }
    
    return {
      'categories': categories.toList(),
      'tags': tags.toList(),
    };
  }

  List<String> get _countries {
    final statsState = ref.watch(countriesCitiesStatsProvider);
    final countries = statsState.countryNames;
    print('🌍 Countries loaded: ${countries.length} - $countries');
    return countries;
  }

  List<String> get _availableCities {
    if (_selectedCountry == null) return [];
    final statsState = ref.watch(countriesCitiesStatsProvider);
    return statsState
        .getCities(_selectedCountry!)
        .where((c) => c.placeCount >= _minPlaceCount)
        .map((c) => c.name)
        .toList();
  }

  void _toggleTag(String tag) {
    setState(() {
      if (_selectedTags.contains(tag)) {
        _selectedTags.remove(tag);
      } else {
        _selectedTags.add(tag);
      }
    });
  }

  void _handleSearch() {
    if (_selectedCity == null) {
      CustomToast.showInfo(context, 'Please select a city first');
      return;
    }

    // 转换标签为后端查询参数
    final searchParams = _SearchMenuOverlayState.convertTagsForSearch(_selectedTags);

    widget.onClose();
    Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (context) => SearchResultsMapPage(
          city: _selectedCity!,
          country: _selectedCountry!,
          selectedTags: _selectedTags.toList(),
          categoryFilters: searchParams['categories'] ?? [],
          tagFilters: searchParams['tags'] ?? [],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // 获取搜索框位置
    final RenderBox? searchBox = widget.searchBoxKey.currentContext?.findRenderObject() as RenderBox?;
    final searchBoxPosition = searchBox?.localToGlobal(Offset.zero) ?? Offset.zero;
    final searchBoxSize = searchBox?.size ?? ui.Size.zero;
    
    final topOffset = searchBoxPosition.dy + searchBoxSize.height + 8;
    // 底部留出更多空间给 bottom bar
    final bottomPadding = MediaQuery.of(context).padding.bottom + 80;
    
    return Stack(
      clipBehavior: Clip.none, // 允许下拉菜单超出边界
      children: [
        // 背景遮罩 - 使用半透明黑色以便能接收点击事件
        Positioned.fill(
          child: GestureDetector(
            onTap: widget.onClose,
            child: Container(color: Colors.black.withOpacity(0.01)),
          ),
        ),
        // 菜单内容
        Positioned(
          top: topOffset,
          left: 16,
          right: 16,
          child: Material(
            color: Colors.transparent,
            child: Container(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(context).size.height - topOffset - bottomPadding,
              ),
              decoration: BoxDecoration(
                color: AppTheme.white,
                borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
                border: Border.all(color: AppTheme.black, width: AppTheme.borderThick),
                boxShadow: AppTheme.strongShadow,
              ),
              child: _buildContent(),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildContent() => Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // 可滚动内容
        Flexible(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // City Section
                _buildSectionTitle('🏙 City'),
                const SizedBox(height: 12),
                _buildDropdownRow(),
                const SizedBox(height: 24),
                
                // Interests Section
                _buildSectionTitle('🌟 Interests'),
                const SizedBox(height: 12),
                ..._interestCategories.entries.map((entry) => 
                  _buildInterestCategory(entry.key, entry.value),
                ),
              ],
            ),
          ),
        ),
        // Search Button
        _buildSearchButton(),
      ],
    );

  Widget _buildSectionTitle(String title) => Text(
      title,
      style: AppTheme.headlineMedium(context).copyWith(fontSize: 22),
    );

  Widget _buildDropdownRow() => Row(
      children: [
        // Country dropdown
        Expanded(
          child: _buildCompactDropdown(
            value: _selectedCountry,
            hint: 'Country',
            items: _countries,
            onChanged: (value) {
              setState(() {
                _selectedCountry = value;
                _selectedCity = null;
              });
            },
          ),
        ),
        const SizedBox(width: 12),
        // City dropdown - 始终可点击
        Expanded(
          child: _buildCityDropdown(),
        ),
      ],
    );

  Widget _buildCompactDropdown({
    required String? value,
    required String hint,
    required List<String> items,
    required ValueChanged<String?> onChanged,
  }) {
    // 如果没有数据，显示加载中
    if (items.isEmpty) {
      return Container(
        height: 44,
        decoration: BoxDecoration(
          color: AppTheme.white,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: AppTheme.black, width: 1.5),
        ),
        child: Padding(
          padding: const EdgeInsets.only(left: 16),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(
              'Loading...',
              style: AppTheme.bodyMedium(context).copyWith(
                color: AppTheme.mediumGray,
                fontSize: 14,
              ),
            ),
          ),
        ),
      );
    }
    
    return _CustomDropdown(
      value: value,
      hint: hint,
      items: items,
      onChanged: onChanged,
    );
  }

  Widget _buildCityDropdown() {
    final hasCountry = _selectedCountry != null;
    final cities = _availableCities;
    
    return _CustomDropdown(
      value: _selectedCity,
      hint: 'City',
      items: hasCountry ? cities : [],
      enabled: hasCountry,
      emptyHint: 'Choose country first',
      onChanged: hasCountry ? (value) {
        setState(() {
          _selectedCity = value;
        });
      } : null,
    );
  }

  Widget _buildInterestCategory(String category, List<String> tags) => Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            category,
            style: AppTheme.titleMedium(context).copyWith(fontSize: 15),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: tags.map((tag) => _buildTagChip(tag)).toList(),
          ),
        ],
      ),
    );

  Widget _buildTagChip(String tag) {
    final isSelected = _selectedTags.contains(tag);
    
    return GestureDetector(
      onTap: () => _toggleTag(tag),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.primaryYellow : AppTheme.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppTheme.black, width: 1.5),
        ),
        child: Text(
          tag,
          style: AppTheme.labelMedium(context).copyWith(fontSize: 13),
        ),
      ),
    );
  }

  Widget _buildSearchButton() => Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
      child: PrimaryButton(
        text: 'AI Search & Customize',
        onPressed: _handleSearch,
      ),
    );
}

/// 搜索菜单底部弹出组件（保留兼容）
class SearchMenuSheet extends ConsumerStatefulWidget {
  const SearchMenuSheet({super.key});

  static Future<void> show(BuildContext context) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => const SearchMenuSheet(),
    );

  @override
  ConsumerState<SearchMenuSheet> createState() => _SearchMenuSheetState();
}

class _SearchMenuSheetState extends ConsumerState<SearchMenuSheet> {
  @override
  Widget build(BuildContext context) => Container();
}

/// 自定义下拉组件 - 菜单从按钮下边缘向下展开
class _CustomDropdown extends StatefulWidget {
  const _CustomDropdown({
    required this.value,
    required this.hint,
    required this.items,
    required this.onChanged,
    this.enabled = true,
    this.emptyHint,
  });

  final String? value;
  final String hint;
  final List<String> items;
  final ValueChanged<String?>? onChanged;
  final bool enabled;
  final String? emptyHint;

  @override
  State<_CustomDropdown> createState() => _CustomDropdownState();
}

class _CustomDropdownState extends State<_CustomDropdown> {
  final GlobalKey _buttonKey = GlobalKey();

  @override
  Widget build(BuildContext context) {
    final displayText = widget.value ?? widget.hint;
    final isHint = widget.value == null;
    
    return LayoutBuilder(
      builder: (context, constraints) {
        // 获取按钮实际宽度
        final buttonWidth = constraints.maxWidth;
        
        return Container(
          key: _buttonKey,
          height: 44,
          decoration: BoxDecoration(
            color: AppTheme.white,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: AppTheme.black, width: 1.5),
          ),
          child: PopupMenuButton<String>(
            enabled: widget.enabled && widget.items.isNotEmpty,
            offset: const Offset(0, 48), // 增加间距，从44改为48
            constraints: BoxConstraints(
              maxHeight: 300,
              minWidth: buttonWidth, // 使用按钮宽度
              maxWidth: buttonWidth, // 限制最大宽度与按钮一致
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: const BorderSide(color: AppTheme.black, width: 1.5),
            ),
            color: AppTheme.white,
            onSelected: widget.onChanged,
            itemBuilder: (context) {
              if (widget.items.isEmpty && widget.emptyHint != null) {
                return [
                  PopupMenuItem<String>(
                    enabled: false,
                    height: 48, // 增加选项高度
                    child: Text(
                      widget.emptyHint!,
                      style: AppTheme.bodyMedium(context).copyWith(
                        color: AppTheme.mediumGray,
                        fontSize: 14,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ),
                ];
              }
              return widget.items.map((item) => PopupMenuItem<String>(
                value: item,
                height: 48, // 增加选项高度，默认是48但明确设置
                child: Text(
                  item,
                  style: AppTheme.bodyMedium(context).copyWith(fontSize: 14),
                ),
              )).toList();
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      displayText,
                      style: AppTheme.bodyMedium(context).copyWith(
                        color: isHint ? AppTheme.mediumGray : AppTheme.black,
                        fontSize: 14,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Icon(
                    Icons.keyboard_arrow_down,
                    color: widget.enabled ? AppTheme.black : AppTheme.mediumGray,
                    size: 20,
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
