import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';
import 'package:wanderlog/features/search/providers/countries_cities_provider.dart';
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
  String? _selectedCountry;
  String? _selectedCity;
  final Set<String> _selectedTags = {};

  // 兴趣标签分类（根据图片）
  static const Map<String, List<String>> _interestCategories = {
    'Things to do': ['Museum', 'Attractions', 'Store'],
    'Nature': ['Park', 'Cemetery', 'Hiking'],
    'Arts': ['Architecture', 'Pilgrimage', 'Knitting'],
    'Food': ['Cafe', 'Bread', 'Brunch', 'Restaurant'],
  };

  List<String> get _countries {
    final data = ref.watch(countriesCitiesProvider);
    final countries = data.keys.toList()..sort();
    print('🌍 Countries loaded: ${countries.length} - $countries');
    return countries;
  }

  List<String> get _availableCities {
    if (_selectedCountry == null) return [];
    final data = ref.watch(countriesCitiesProvider);
    return data[_selectedCountry] ?? [];
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

    widget.onClose();
    Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (context) => SearchResultsMapPage(
          city: _selectedCity!,
          country: _selectedCountry!,
          selectedTags: _selectedTags.toList(),
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
    
    return Container(
      height: 44,
      decoration: BoxDecoration(
        color: AppTheme.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: AppTheme.black, width: 1.5),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: value,
          hint: Padding(
            padding: const EdgeInsets.only(left: 16),
            child: Text(
              hint,
              style: AppTheme.bodyMedium(context).copyWith(
                color: AppTheme.mediumGray,
                fontSize: 14,
              ),
            ),
          ),
          isExpanded: true,
          icon: const Padding(
            padding: EdgeInsets.only(right: 8),
            child: Icon(Icons.keyboard_arrow_down, color: AppTheme.black, size: 20),
          ),
          selectedItemBuilder: (context) => items.map((item) => Padding(
              padding: const EdgeInsets.only(left: 16),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  item,
                  style: AppTheme.bodyMedium(context).copyWith(fontSize: 14),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            )).toList(),
          items: items.map((item) => DropdownMenuItem<String>(
              value: item,
              child: Text(
                item,
                style: AppTheme.bodyMedium(context).copyWith(fontSize: 14),
              ),
            )).toList(),
          onChanged: onChanged,
        ),
      ),
    );
  }

  Widget _buildCityDropdown() {
    final hasCountry = _selectedCountry != null;
    final cities = _availableCities;
    
    return Container(
      height: 44,
      decoration: BoxDecoration(
        color: AppTheme.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: AppTheme.black, width: 1.5),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: _selectedCity,
          hint: Padding(
            padding: const EdgeInsets.only(left: 16),
            child: Text(
              'City',
              style: AppTheme.bodyMedium(context).copyWith(
                color: AppTheme.mediumGray,
                fontSize: 14,
              ),
            ),
          ),
          isExpanded: true,
          icon: const Padding(
            padding: EdgeInsets.only(right: 8),
            child: Icon(Icons.keyboard_arrow_down, color: AppTheme.black, size: 20),
          ),
          selectedItemBuilder: hasCountry ? (context) => cities.map((item) => Padding(
              padding: const EdgeInsets.only(left: 16),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  item,
                  style: AppTheme.bodyMedium(context).copyWith(fontSize: 14),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            )).toList() : null,
          items: hasCountry
              ? cities.map((item) => DropdownMenuItem<String>(
                    value: item,
                    child: Text(
                      item,
                      style: AppTheme.bodyMedium(context).copyWith(fontSize: 14),
                    ),
                  )).toList()
              : [
                  DropdownMenuItem<String>(
                    enabled: false,
                    child: Text(
                      'Choose country first',
                      style: AppTheme.bodyMedium(context).copyWith(
                        color: AppTheme.mediumGray,
                        fontSize: 14,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ),
                ],
          onChanged: hasCountry ? (value) {
            setState(() {
              _selectedCity = value;
            });
          } : null,
        ),
      ),
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
