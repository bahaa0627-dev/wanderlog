import 'package:flutter/material.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/trips/presentation/pages/myland/spots_tab.dart';
import 'package:wanderlog/features/trips/presentation/pages/myland/collections_tab.dart';

/// MyLand 主页面 - 包含 Spots 和 Collections 两个 tab
class MyLandScreen extends StatefulWidget {
  const MyLandScreen({super.key});

  @override
  State<MyLandScreen> createState() => _MyLandScreenState();
}

class _MyLandScreenState extends State<MyLandScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      body: Column(
        children: [
          // Tab 栏 - 移除标题，简化样式
          Container(
            padding: const EdgeInsets.fromLTRB(16, 60, 16, 0),
            color: AppTheme.white,
            child: TabBar(
              controller: _tabController,
              labelColor: AppTheme.black,
              unselectedLabelColor: AppTheme.black.withOpacity(0.4),
              labelStyle: AppTheme.headlineMedium(context).copyWith(
                fontWeight: FontWeight.bold,
              ),
              unselectedLabelStyle: AppTheme.headlineMedium(context),
              indicator: const BoxDecoration(), // 移除黑线
              indicatorPadding: EdgeInsets.zero,
              labelPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
              tabs: const [
                Tab(text: 'Spots'),
                Tab(text: 'Collections'),
              ],
            ),
          ),

          // Tab 内容
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: const [
                SpotsTab(),
                CollectionsTab(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
