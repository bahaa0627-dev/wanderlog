import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';
import 'package:wanderlog/features/search/presentation/pages/search_results_map_page.dart';
import 'package:wanderlog/features/search/providers/countries_cities_stats_provider.dart';

/// 搜索菜单页面 - 城市和标签选择
class SearchMenuPage extends ConsumerStatefulWidget {
  const SearchMenuPage({super.key});

  @override
  ConsumerState<SearchMenuPage> createState() => _SearchMenuPageState();
}

class _SearchMenuPageState extends ConsumerState<SearchMenuPage> {
  /// 城市地点数量最小阈值（与 map 页面保持一致）
  static const int _minPlaceCount = 5;

  String? _selectedCountry;
  String? _selectedCity;
  final Set<String> _selectedTags = {};

  // 兴趣标签分类
  static const Map<String, List<String>> _interestCategories = {
    'Things to do': [
      'Landmarks',
      'Shopping',
      'Entertainment',
      'Nightlife',
      'Sports',
      'Wellness',
    ],
    'Nature': [
      'Parks',
      'Beaches',
      'Mountains',
      'Lakes',
      'Gardens',
      'Wildlife',
    ],
    'Arts': [
      'Museums',
      'Galleries',
      'Theater',
      'Architecture',
      'Street Art',
      'Photography',
    ],
    'Food': [
      'Restaurants',
      'Cafes',
      'Street Food',
      'Fine Dining',
      'Local Cuisine',
      'Bakeries',
    ],
  };

  static const Map<String, String> _categoryEmojis = {
    'Things to do': '🎯',
    'Nature': '🌿',
    'Arts': '🎨',
    'Food': '🍽️',
  };

  @override
  void initState() {
    super.initState();
    // 加载国家城市统计数据
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(countriesCitiesStatsProvider.notifier).load();
    });
  }

  /// 获取过滤后的城市列表（地点数 >= _minPlaceCount）
  List<CityStats> _getFilteredCities(CountriesCitiesStatsState state) {
    if (_selectedCountry == null) return [];
    return state
        .getCities(_selectedCountry!)
        .where((c) => c.placeCount >= _minPlaceCount)
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
    final statsState = ref.watch(countriesCitiesStatsProvider);

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        backgroundColor: AppTheme.background,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.close, color: AppTheme.black),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(
          'Search',
          style: AppTheme.headlineMedium(context),
        ),
        centerTitle: true,
      ),
      body: statsState.isLoading
          ? const Center(child: CircularProgressIndicator())
          : statsState.error != null
              ? _buildErrorView(statsState.error!)
              : _buildContent(statsState),
    );
  }

  Widget _buildErrorView(String error) => Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('Failed to load data', style: AppTheme.bodyLarge(context)),
            const SizedBox(height: 8),
            Text(error, style: AppTheme.bodySmall(context)),
            const SizedBox(height: 16),
            PrimaryButton(
              text: 'Retry',
              onPressed: () =>
                  ref.read(countriesCitiesStatsProvider.notifier).refresh(),
            ),
          ],
        ),
      );

  Widget _buildContent(CountriesCitiesStatsState statsState) => Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // City Section
                  _buildSectionTitle('🏙 City'),
                  const SizedBox(height: 12),
                  _buildCountryDropdown(statsState),
                  const SizedBox(height: 12),
                  _buildCityDropdown(statsState),
                  const SizedBox(height: 24),

                  // Interests Section
                  _buildSectionTitle('🌟 Interests'),
                  const SizedBox(height: 12),
                  ..._interestCategories.entries.map(
                    (entry) => _buildInterestCategory(entry.key, entry.value),
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
        style: AppTheme.headlineMedium(context).copyWith(fontSize: 20),
      );

  Widget _buildCountryDropdown(CountriesCitiesStatsState statsState) {
    final countries = statsState.countries;

    return Container(
      decoration: BoxDecoration(
        color: AppTheme.white,
        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
        border: Border.all(color: AppTheme.black, width: AppTheme.borderMedium),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: _selectedCountry,
          hint: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              'Select Country',
              style: AppTheme.bodyMedium(context).copyWith(
                color: AppTheme.mediumGray,
              ),
            ),
          ),
          isExpanded: true,
          icon: const Padding(
            padding: EdgeInsets.only(right: 12),
            child: Icon(Icons.keyboard_arrow_down, color: AppTheme.black),
          ),
          items: countries.map((country) => DropdownMenuItem<String>(
              value: country.name,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(country.name,
                          style: AppTheme.bodyMedium(context)),
                    ),
                    Text(
                      '${country.placeCount}',
                      style: AppTheme.bodySmall(context).copyWith(
                        color: AppTheme.mediumGray,
                      ),
                    ),
                  ],
                ),
              ),
            )).toList(),
          onChanged: (value) {
            setState(() {
              _selectedCountry = value;
              _selectedCity = null; // Reset city when country changes
            });
          },
        ),
      ),
    );
  }

  Widget _buildCityDropdown(CountriesCitiesStatsState statsState) {
    final cities = _getFilteredCities(statsState);
    final bool hasCountry = _selectedCountry != null;

    return Container(
      decoration: BoxDecoration(
        color: hasCountry ? AppTheme.white : AppTheme.lightGray,
        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
        border: Border.all(
          color: hasCountry ? AppTheme.black : AppTheme.mediumGray,
          width: AppTheme.borderMedium,
        ),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: _selectedCity,
          hint: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              hasCountry ? 'Select City' : 'Choose country first',
              style: AppTheme.bodyMedium(context).copyWith(
                color: AppTheme.mediumGray,
              ),
            ),
          ),
          isExpanded: true,
          icon: Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Icon(
              Icons.keyboard_arrow_down,
              color: hasCountry ? AppTheme.black : AppTheme.mediumGray,
            ),
          ),
          items: hasCountry
              ? cities
                  .map((city) => DropdownMenuItem<String>(
                        value: city.name,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(city.name,
                                    style: AppTheme.bodyMedium(context),),
                              ),
                              Text(
                                '${city.placeCount}',
                                style: AppTheme.bodySmall(context).copyWith(
                                  color: AppTheme.mediumGray,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),)
                  .toList()
              : null,
          onChanged: hasCountry
              ? (value) {
                  setState(() {
                    _selectedCity = value;
                  });
                }
              : null,
        ),
      ),
    );
  }

  Widget _buildInterestCategory(String category, List<String> tags) {
    final emoji = _categoryEmojis[category] ?? '📍';

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(emoji, style: const TextStyle(fontSize: 16)),
              const SizedBox(width: 8),
              Text(
                category,
                style: AppTheme.titleMedium(context),
              ),
            ],
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
  }

  Widget _buildTagChip(String tag) {
    final isSelected = _selectedTags.contains(tag);

    return GestureDetector(
      onTap: () => _toggleTag(tag),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.primaryYellow : AppTheme.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: AppTheme.black,
            width: AppTheme.borderMedium,
          ),
        ),
        child: Text(
          tag,
          style: AppTheme.labelMedium(context),
        ),
      ),
    );
  }

  Widget _buildSearchButton() => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppTheme.white,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.1),
              blurRadius: 10,
              offset: const Offset(0, -4),
            ),
          ],
        ),
        child: SafeArea(
          child: SizedBox(
            width: double.infinity,
            child: PrimaryButton(
              text: '✨ AI Search & Customize',
              onPressed: _handleSearch,
            ),
          ),
        ),
      );
}
