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
  });

  final int initialTabIndex;
  final int? initialSpotsSubTab;

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
  String? _preferredCity;

  @override
  void initState() {
    super.initState();
    _selectedTabIndex = widget.initialTabIndex.clamp(0, 1);
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
        break;
      case 2:
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile page coming soon')),
        );
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

  void _handleCityOptionsChanged(List<String> cities) {
    setState(() {
      _cityOptions = cities;
      if (_preferredCity != null && !_cityOptions.contains(_preferredCity)) {
        _preferredCity = null;
      }
    });
    if (_preferredCity != null &&
        _preferredCity != _currentTripCity &&
        cities.contains(_preferredCity!)) {
      _spotsTabController.selectCity(_preferredCity!);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      body: SafeArea(
        child: Column(
          children: [
            Container(
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
                    onSelectCity: (city) {
                      setState(() => _preferredCity = city);
                      _spotsTabController.selectCity(city);
                    },
                    onAddCity: _spotsTabController.showAddCityDialog,
                  ),
                ],
              ),
            ),
            Expanded(
              child: IndexedStack(
                index: _selectedTabIndex,
                children: [
                  SpotsTab(
                    initialSubTab: widget.initialSpotsSubTab,
                    controller: _spotsTabController,
                    onCityChanged: _handleCityChanged,
                    onCityOptionsChanged: _handleCityOptionsChanged,
                  ),
                  const CollectionsTab(),
                ],
              ),
            ),
            TripsBottomNav(
              selectedIndex: 1,
              onItemTapped: _handleBottomNavTap,
            ),
          ],
        ),
      ),
    );
  }
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
    final activeColor = AppTheme.black;
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
  });

  final String city;
  final List<String> cities;
  final ValueChanged<String> onSelectCity;
  final VoidCallback onAddCity;

  static const _addValue = '__add_city__';

  @override
  Widget build(BuildContext context) {
    final displayCity = city.isEmpty ? 'Trip city' : city;
    final badge = Padding(
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
    );

    return PopupMenuButton<String>(
      offset: const Offset(0, 24),
      elevation: 4,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: AppTheme.black, width: 1),
      ),
      onSelected: (value) {
        if (value == _addValue) {
          onAddCity();
        } else {
          onSelectCity(value);
        }
      },
      itemBuilder: (context) {
        final entries = <PopupMenuEntry<String>>[];
        if (cities.isNotEmpty) {
          entries.addAll(
            cities.map(
              (cityName) => PopupMenuItem<String>(
                value: cityName,
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        cityName,
                        style: AppTheme.labelSmall(context).copyWith(
                          fontSize: 12,
                          color: AppTheme.black.withOpacity(0.65),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (cityName == city)
                      const Icon(
                        Icons.check,
                        size: 16,
                        color: AppTheme.black,
                      ),
                  ],
                ),
              ),
            ),
          );
          entries.add(const PopupMenuDivider(height: 4));
        }
        entries.add(
          PopupMenuItem<String>(
            value: _addValue,
            child: Row(
              children: [
                const Icon(Icons.add, size: 16, color: AppTheme.black),
                const SizedBox(width: 8),
                Text(
                  'destination',
                  style: AppTheme.labelSmall(context).copyWith(
                    fontSize: 12,
                    color: AppTheme.black.withOpacity(0.65),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        );
        return entries;
      },
      child: badge,
    );
  }
}
