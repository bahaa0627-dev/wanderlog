import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/trips/presentation/pages/myland/spots_tab.dart';
import 'package:wanderlog/features/trips/presentation/pages/myland/collections_tab.dart';
import 'package:wanderlog/features/trips/presentation/widgets/trips_bottom_nav.dart';

/// MyLand 主页面 - 包含 Spots 和 Collections 两个 tab
class MyLandScreen extends StatefulWidget {
  const MyLandScreen({
    super.key,
    this.initialTabIndex = 0,
    this.initialSpotsSubTab,
    this.initialCity,
  });

  final int initialTabIndex;
  final int? initialSpotsSubTab;
  final String? initialCity;

  @override
  State<MyLandScreen> createState() => _MyLandScreenState();
}

class _MyLandScreenState extends State<MyLandScreen> {
  static final SpotsTabController _sharedSpotsTabController =
      SpotsTabController();
  final SpotsTabController _spotsTabController = _sharedSpotsTabController;
  late int _selectedTabIndex;
  String _currentTripCity = '';
  List<String> _cityOptions = const [];
  Map<String, String> _cityToCountry = const {};
  String? _preferredCity;
  bool _hasAppliedInitialCity = false;

  @override
  void initState() {
    super.initState();
    _selectedTabIndex = widget.initialTabIndex.clamp(0, 1);
    // If an initial city is provided, set it as preferred
    if (widget.initialCity != null && widget.initialCity!.isNotEmpty) {
      _preferredCity = widget.initialCity;
    }
  }

  @override
  void didUpdateWidget(covariant MyLandScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initialTabIndex != oldWidget.initialTabIndex &&
        widget.initialTabIndex != _selectedTabIndex) {
      setState(() {
        _selectedTabIndex = widget.initialTabIndex.clamp(0, 1);
      });
    }
  }

  void _handleBottomNavTap(int index) {
    switch (index) {
      case 0:
        context.go('/home');
        break;
      case 1:
        // Already on VAGO/MyLand
        break;
      case 2:
        // Go to Profile/Settings - 使用 go 而不是 push，保持底部导航一致
        context.go('/home?tab=profile');
        break;
    }
  }

  void _onTopTabSelected(int index) {
    if (_selectedTabIndex == index) {
      return;
    }
    setState(() => _selectedTabIndex = index);
  }

  void _handleCityChanged(String city) {
    if (_currentTripCity == city) {
      return;
    }
    setState(() => _currentTripCity = city);
  }

  void _handleCityOptionsChanged(List<String> cities, [Map<String, String>? cityToCountry]) {
    setState(() {
      _cityOptions = cities;
      if (cityToCountry != null) {
        _cityToCountry = cityToCountry;
      }
      if (_preferredCity != null && !_cityOptions.contains(_preferredCity)) {
        _preferredCity = null;
      }
    });
    
    // Apply initial city preference when cities are first loaded
    if (!_hasAppliedInitialCity && widget.initialCity != null && widget.initialCity!.isNotEmpty) {
      final matchingCity = cities.firstWhere(
        (c) => c.toLowerCase() == widget.initialCity!.toLowerCase(),
        orElse: () => '',
      );
      if (matchingCity.isNotEmpty) {
        _hasAppliedInitialCity = true;
        _spotsTabController.selectCity(matchingCity);
        return;
      }
    }
    
    if (_preferredCity != null &&
        _preferredCity != _currentTripCity &&
        cities.contains(_preferredCity!)) {
      _spotsTabController.selectCity(_preferredCity!);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      backgroundColor: AppTheme.background,
      body: Column(
        children: [
          // 顶部安全区域
          SafeArea(
            bottom: false,
            child: Container(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
              color: AppTheme.white,
              child: Row(
                children: [
                  _TopUnderlineTab(
                    label: 'Spots',
                    active: _selectedTabIndex == 0,
                    onTap: () => _onTopTabSelected(0),
                  ),
                  const SizedBox(width: 24),
                  _TopUnderlineTab(
                    label: 'Collections',
                    active: _selectedTabIndex == 1,
                    onTap: () => _onTopTabSelected(1),
                  ),
                  const Spacer(),
                  _CityBadge(
                    city: _currentTripCity,
                    cities: _cityOptions,
                    cityToCountry: _cityToCountry,
                    onSelectCity: (city) {
                      setState(() => _preferredCity = city);
                      _spotsTabController.selectCity(city);
                    },
                    onAddCity: _spotsTabController.showAddCityDialog,
                  ),
                ],
              ),
            ),
          ),
          Expanded(
            child: IndexedStack(
                index: _selectedTabIndex,
                // IndexedStack 会保持所有子 widget 的状态，但只有当前 index 的 widget 会被渲染
                // 这样可以避免切换 tab 时重新加载数据
                children: [
                  SpotsTab(
                    initialSubTab: widget.initialSpotsSubTab,
                    controller: _spotsTabController,
                    onCityChanged: _handleCityChanged,
                    onCityOptionsChanged: _handleCityOptionsChanged,
                  ),
                  CollectionsTab(
                    selectedCity: _currentTripCity,
                  ),
                ],
              ),
            ),
            TripsBottomNav(
              selectedIndex: 1,
              onItemTapped: _handleBottomNavTap,
            ),
          ],
        ),
    );
}

class _TopUnderlineTab extends StatelessWidget {
  const _TopUnderlineTab({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    const activeColor = AppTheme.black;
    final inactiveColor = AppTheme.black.withOpacity(0.35);

    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: AppTheme.headlineMedium(context).copyWith(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: active ? activeColor : inactiveColor,
            ),
          ),
          const SizedBox(height: 6),
          AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            curve: Curves.easeInOut,
            height: 3,
            width: 36,
            decoration: BoxDecoration(
              color: active ? activeColor : Colors.transparent,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ],
      ),
    );
  }
}

class _CityBadge extends StatelessWidget {
  const _CityBadge({
    required this.city,
    required this.cities,
    required this.onSelectCity,
    required this.onAddCity,
    this.cityToCountry = const {},
  });

  final String city;
  final List<String> cities;
  final Map<String, String> cityToCountry;
  final ValueChanged<String> onSelectCity;
  final VoidCallback onAddCity;

  @override
  Widget build(BuildContext context) {
    final displayCity = city.isEmpty ? 'All' : city;
    return GestureDetector(
      onTap: () => _showCityPicker(context),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              displayCity,
              style: AppTheme.labelSmall(context).copyWith(
                fontSize: 12,
                color: AppTheme.black.withOpacity(0.65),
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(width: 4),
            const Icon(
              Icons.arrow_drop_down,
              size: 18,
              color: AppTheme.black,
            ),
          ],
        ),
      ),
    );
  }

  void _showCityPicker(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => _CountryCityPickerSheet(
        selectedCity: city,
        cities: cities,
        cityToCountry: cityToCountry,
        onCitySelected: (selectedCity) {
          Navigator.pop(sheetContext);
          onSelectCity(selectedCity);
        },
        onAddCity: () {
          Navigator.pop(sheetContext);
          onAddCity();
        },
      ),
    );
  }
}

/// 国家城市两列选择器底部弹窗
class _CountryCityPickerSheet extends StatefulWidget {
  const _CountryCityPickerSheet({
    required this.selectedCity,
    required this.cities,
    required this.cityToCountry,
    required this.onCitySelected,
    required this.onAddCity,
  });

  final String selectedCity;
  final List<String> cities;
  final Map<String, String> cityToCountry;
  final ValueChanged<String> onCitySelected;
  final VoidCallback onAddCity;

  @override
  State<_CountryCityPickerSheet> createState() => _CountryCityPickerSheetState();
}

class _CountryCityPickerSheetState extends State<_CountryCityPickerSheet> {
  String? _selectedCountry;
  
  // 构建国家到城市列表的映射
  Map<String, List<String>> get _countryToCities {
    final Map<String, List<String>> result = {};
    for (final city in widget.cities) {
      if (city == 'All') continue;
      final country = widget.cityToCountry[city] ?? 'Other';
      result.putIfAbsent(country, () => []).add(city);
    }
    return result;
  }
  
  List<String> get _countries => _countryToCities.keys.toList();
  
  List<String> get _citiesForSelectedCountry {
    if (_selectedCountry == null) return [];
    return _countryToCities[_selectedCountry] ?? [];
  }

  @override
  void initState() {
    super.initState();
    // 根据当前选中的城市找到对应的国家
    if (widget.selectedCity.isNotEmpty && widget.selectedCity != 'All') {
      _selectedCountry = widget.cityToCountry[widget.selectedCity];
    }
    // 如果没有找到，默认选择第一个国家
    if (_selectedCountry == null && _countries.isNotEmpty) {
      _selectedCountry = _countries.first;
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.45,
      minChildSize: 0.3,
      maxChildSize: 0.7,
      expand: false,
      builder: (context, scrollController) => Container(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Text('Select City', style: AppTheme.headlineMedium(context)),
                const Spacer(),
                // All 选项
                GestureDetector(
                  onTap: () => widget.onCitySelected('All'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: widget.selectedCity.isEmpty || widget.selectedCity == 'All'
                          ? AppTheme.primaryYellow.withOpacity(0.3)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppTheme.border),
                    ),
                    child: Text(
                      'All',
                      style: AppTheme.bodyMedium(context).copyWith(
                        fontWeight: widget.selectedCity.isEmpty || widget.selectedCity == 'All'
                            ? FontWeight.bold
                            : FontWeight.normal,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Expanded(
              child: _countries.isEmpty
                  ? Center(
                      child: Text(
                        'No cities yet',
                        style: AppTheme.bodyMedium(context).copyWith(
                          color: AppTheme.mediumGray,
                        ),
                      ),
                    )
                  : _buildCountryCityColumns(scrollController),
            ),
            const SizedBox(height: 12),
            // + destination 入口
            GestureDetector(
              onTap: widget.onAddCity,
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 14),
                decoration: BoxDecoration(
                  border: Border.all(color: AppTheme.border),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.add, size: 20, color: AppTheme.black),
                    const SizedBox(width: 8),
                    Text(
                      'destination',
                      style: AppTheme.bodyMedium(context).copyWith(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildCountryCityColumns(ScrollController scrollController) {
    return Row(
      children: [
        // 左侧国家列表
        Expanded(
          flex: 2,
          child: Container(
            decoration: BoxDecoration(
              border: Border(
                right: BorderSide(color: AppTheme.border, width: 1),
              ),
            ),
            child: ListView.builder(
              itemCount: _countries.length,
              itemBuilder: (context, index) {
                final country = _countries[index];
                final isSelected = country == _selectedCountry;
                return GestureDetector(
                  onTap: () {
                    setState(() {
                      _selectedCountry = country;
                    });
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                    color: isSelected ? AppTheme.primaryYellow.withOpacity(0.2) : Colors.transparent,
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            country,
                            style: AppTheme.bodyMedium(context).copyWith(
                              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (isSelected)
                          const Icon(Icons.chevron_right, size: 18, color: AppTheme.mediumGray),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ),
        // 右侧城市列表
        Expanded(
          flex: 3,
          child: ListView.builder(
            controller: scrollController,
            itemCount: _citiesForSelectedCountry.length,
            itemBuilder: (context, index) {
              final cityName = _citiesForSelectedCountry[index];
              final isSelected = cityName == widget.selectedCity;
              return GestureDetector(
                onTap: () => widget.onCitySelected(cityName),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                  color: isSelected ? AppTheme.primaryYellow.withOpacity(0.2) : Colors.transparent,
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          cityName,
                          style: AppTheme.bodyMedium(context).copyWith(
                            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (isSelected)
                        const Icon(Icons.check, size: 18, color: AppTheme.primaryYellow),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
