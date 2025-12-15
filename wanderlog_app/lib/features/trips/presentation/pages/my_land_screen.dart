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
      body: SafeArea(
        child: Column(
          children: [
            // 顶部标题和 Tab 栏
            Container(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
              color: AppTheme.white,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // 标题
                  Text(
                    'MyLand',
                    style: AppTheme.headlineLarge(context).copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 16),
                  
                  // Tab 栏
                  Container(
                    decoration: BoxDecoration(
                      border: Border(
                        bottom: BorderSide(
                          color: AppTheme.black,
                          width: AppTheme.borderMedium,
                        ),
                      ),
                    ),
                    child: TabBar(
                      controller: _tabController,
                      labelColor: AppTheme.black,
                      unselectedLabelColor: AppTheme.black.withOpacity(0.4),
                      labelStyle: AppTheme.bodyLarge(context).copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                      unselectedLabelStyle: AppTheme.bodyLarge(context),
                      indicator: const UnderlineTabIndicator(
                        borderSide: BorderSide(
                          color: AppTheme.primaryYellow,
                          width: 3,
                        ),
                      ),
                      tabs: const [
                        Tab(text: 'Spots'),
                        Tab(text: 'Collections'),
                      ],
                    ),
                  ),
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
      ),
    );
  }
}
