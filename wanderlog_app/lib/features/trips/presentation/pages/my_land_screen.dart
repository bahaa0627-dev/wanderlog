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

class _MyLandScreenState extends State<MyLandScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(
      length: 2,
      vsync: this,
      initialIndex: widget.initialTabIndex.clamp(0, 1),
    );
  }

  @override
  void didUpdateWidget(covariant MyLandScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initialTabIndex != oldWidget.initialTabIndex &&
        widget.initialTabIndex != _tabController.index) {
      _tabController.index = widget.initialTabIndex.clamp(0, 1);
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      body: SafeArea(
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              color: AppTheme.white,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: AppTheme.white,
                  borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                  border: Border.all(
                    color: AppTheme.black,
                    width: AppTheme.borderMedium,
                  ),
                  boxShadow: const [
                    BoxShadow(
                      color: AppTheme.black,
                      offset: Offset(3, 4),
                    ),
                  ],
                ),
                child: TabBar(
                  controller: _tabController,
                  labelColor: AppTheme.black,
                  unselectedLabelColor: AppTheme.black.withOpacity(0.45),
                  labelStyle: AppTheme.headlineMedium(context).copyWith(
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.2,
                  ),
                  unselectedLabelStyle: AppTheme.headlineMedium(context),
                  indicatorSize: TabBarIndicatorSize.tab,
                  indicator: BoxDecoration(
                    color: AppTheme.primaryYellow,
                    borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                    border: Border.all(
                      color: AppTheme.black,
                      width: AppTheme.borderMedium,
                    ),
                  ),
                  indicatorPadding: EdgeInsets.zero,
                  labelPadding: EdgeInsets.zero,
                  tabs: const [
                    Tab(text: 'Spots'),
                    Tab(text: 'Collections'),
                  ],
                ),
              ),
            ),
            Expanded(
              child: TabBarView(
                controller: _tabController,
                children: [
                  SpotsTab(initialSubTab: widget.initialSpotsSubTab),
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
