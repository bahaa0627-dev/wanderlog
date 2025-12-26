import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';
import 'package:wanderlog/features/search/data/search_repository.dart';
import 'package:wanderlog/features/search/presentation/pages/search_results_map_page.dart';
import 'package:wanderlog/features/search/providers/countries_cities_provider.dart';

/// 搜索菜单页面 - 城市和标签选择
class SearchMenuPage extends ConsumerStatefulWidget {
  const SearchMenuPage({super.key});

  @override
  ConsumerState<SearchMenuPage> createState() => _SearchMenuPageState();
}

class _SearchMenuPageState extends ConsumerState<SearchMenuPage> {
  String? _selectedCountry;
  String? _selectedCity;
  final Set<String> _selectedTags = {};
  
  List<String> _countries = [];
  Map<String, List<String>> _citiesByCountry = {};
  bool _isLoading = true;
  String? _error;

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
    _loadCountriesAndCities();
    // 同时刷新国家城市缓存
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(countriesCitiesProvider.notifier).refresh();
    });
  }

  Future<void> _loadCountriesAndCities() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final repository = ref.read(searchRepositoryProvider);
      final data = await repository.getCountriesAndCities();
      
      setState(() {
        _countries = data.keys.toList()..sort();
        _citiesByCountry = data;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  List<String> get _availableCities {
    if (_selectedCountry == null) return [];
    return _citiesByCountry[_selectedCountry] ?? [];
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
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _buildErrorView()
              : _buildContent(),
    );
  }

  Widget _buildErrorView() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text('Failed to load data', style: AppTheme.bodyLarge(context)),
          const SizedBox(height: 8),
          Text(_error!, style: AppTheme.bodySmall(context)),
          const SizedBox(height: 16),
          PrimaryButton(
            text: 'Retry',
            onPressed: _loadCountriesAndCities,
          ),
        ],
      ),
    );
  }

  Widget _buildContent() {
    return Column(
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
                _buildCountryDropdown(),
                const SizedBox(height: 12),
                _buildCityDropdown(),
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
  }

  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: AppTheme.headlineMedium(context).copyWith(fontSize: 20),
    );
  }

  Widget _buildCountryDropdown() {
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
          items: _countries.map((country) {
            return DropdownMenuItem<String>(
              value: country,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(country, style: AppTheme.bodyMedium(context)),
              ),
            );
          }).toList(),
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

  Widget _buildCityDropdown() {
    final cities = _availableCities;
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
              ? cities.map((city) {
                  return DropdownMenuItem<String>(
                    value: city,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Text(city, style: AppTheme.bodyMedium(context)),
                    ),
                  );
                }).toList()
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

  Widget _buildSearchButton() {
    return Container(
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
}
