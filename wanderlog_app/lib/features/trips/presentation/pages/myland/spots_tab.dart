import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/shared/models/spot_model.dart';
import 'package:wanderlog/features/trips/presentation/widgets/myland/spot_card.dart';
import 'package:wanderlog/features/trips/presentation/widgets/myland/check_in_dialog.dart';
import 'package:wanderlog/features/trips/presentation/widgets/myland/add_city_dialog.dart';

// 扩展 Spot 类以支持 MyLand 功能
// TODO: 这些属性应该通过 TripSpot 来管理，而不是扩展 Spot
extension SpotMyLandExtension on Spot {
  bool? get isMustGo => false; // TODO: 从 TripSpot 获取
  bool? get isTodaysPlan => false; // TODO: 从 TripSpot 获取
  bool? get isVisited => false; // TODO: 从 TripSpot 获取
}

/// Spots Tab - 显示用户收藏的地点
/// 包含四个子分类：All, MustGo, Today's Plan, Visited
class SpotsTab extends ConsumerStatefulWidget {
  const SpotsTab({super.key});

  @override
  ConsumerState<SpotsTab> createState() => _SpotsTabState();
}

class _SpotsTabState extends ConsumerState<SpotsTab> {
  // 当前选中的子 tab (0: All, 1: MustGo, 2: Today's Plan, 3: Visited)
  int _selectedSubTab = 0;

  // Mock 数据 - 后续替换为真实数据
  final List<Spot> _mockSpots = [];
  
  // 可用城市列表 - TODO: 从后端 API 获取
  final List<String> _availableCities = [
    'Copenhagen',
    'Porto',
    'Paris',
    'Tokyo',
    'Barcelona',
    'Amsterdam',
    'London',
    'Berlin',
  ];

  int get _allCount => _mockSpots.length;
  int get _mustGoCount => _mockSpots.where((s) => s.isMustGo ?? false).length;
  int get _todaysPlanCount => _mockSpots.where((s) => s.isTodaysPlan ?? false).length;
  int get _visitedCount => _mockSpots.where((s) => s.isVisited ?? false).length;

  @override
  void initState() {
    super.initState();
    // 如果 Today's Plan 有数据，默认进入该 tab
    if (_todaysPlanCount > 0) {
      _selectedSubTab = 2;
    }
  }

  void _onSubTabChanged(int index) {
    setState(() {
      _selectedSubTab = index;
    });
  }

  List<Spot> _getFilteredSpots() {
    switch (_selectedSubTab) {
      case 0: // All
        return _mockSpots;
      case 1: // MustGo
        return _mockSpots.where((s) => s.isMustGo ?? false).toList();
      case 2: // Today's Plan
        return _mockSpots.where((s) => s.isTodaysPlan ?? false).toList();
      case 3: // Visited
        return _mockSpots.where((s) => s.isVisited ?? false).toList();
      default:
        return _mockSpots;
    }
  }

  void _handleCheckIn(Spot spot) {
    showDialog<void>(
      context: context,
      builder: (context) => CheckInDialog(
        spot: spot,
        onCheckIn: (DateTime visitDate, double rating, String? notes) {
          // TODO: 保存打卡数据到后端
          // 自动跳转到 Visited tab
          setState(() {
            _selectedSubTab = 3;
          });
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Checked in to ${spot.name}')),
          );
        },
      ),
    );
  }

  void _showAddCityDialog() {
    showDialog<void>(
      context: context,
      builder: (context) => AddCityDialog(
        availableCities: _availableCities,
        onCitySelected: (city) {
          // 跳转到地图页，选中对应城市
          context.push('/map?city=${city.toLowerCase()}&from=myland');
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filteredSpots = _getFilteredSpots();

    return Column(
      children: [
        // 子 Tab 栏
        Container(
          color: AppTheme.white,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _SubTabTextButton(
                  label: 'All',
                  count: _allCount,
                  isSelected: _selectedSubTab == 0,
                  onTap: () => _onSubTabChanged(0),
                ),
                const SizedBox(width: 24),
                _SubTabTextButton(
                  label: 'MustGo',
                  count: _mustGoCount,
                  isSelected: _selectedSubTab == 1,
                  onTap: () => _onSubTabChanged(1),
                ),
                const SizedBox(width: 24),
                _SubTabTextButton(
                  label: "Today's plan",
                  count: _todaysPlanCount,
                  isSelected: _selectedSubTab == 2,
                  onTap: () => _onSubTabChanged(2),
                ),
                const SizedBox(width: 24),
                _SubTabTextButton(
                  label: 'Visited',
                  count: _visitedCount,
                  isSelected: _selectedSubTab == 3,
                  onTap: () => _onSubTabChanged(3),
                ),
              ],
            ),
          ),
        ),

        // 内容区域 - 始终显示列表视图
        Expanded(
          child: _buildListView(filteredSpots),
        ),
      ],
    );
  }

  Widget _buildListView(List<Spot> spots) {
    if (spots.isEmpty) {
      return _buildEmptyState();
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: spots.length,
      itemBuilder: (context, index) {
        return Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: SpotCard(
            spot: spots[index],
            onCheckIn: () => _handleCheckIn(spots[index]),
          ),
        );
      },
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // 占位插画 - 使用简单的图标代替
            Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(
                color: AppTheme.primaryYellow.withOpacity(0.2),
                shape: BoxShape.circle,
                border: Border.all(
                  color: AppTheme.black,
                  width: AppTheme.borderMedium,
                ),
              ),
              child: const Icon(
                Icons.explore_outlined,
                size: 60,
                color: AppTheme.black,
              ),
            ),
            const SizedBox(height: 32),
            
            // 文字提示
            Text(
              "You don't any plan\nadd one more city to explore ;)",
              style: AppTheme.bodyLarge(context).copyWith(
                color: AppTheme.black.withOpacity(0.6),
                height: 1.5,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            
            // Add Trip 按钮 - Neo-Brutalism 风格
            GestureDetector(
              onTap: _showAddCityDialog,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 32,
                  vertical: 16,
                ),
                decoration: BoxDecoration(
                  color: AppTheme.primaryYellow,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: AppTheme.black,
                    width: AppTheme.borderMedium,
                  ),
                  boxShadow: const [
                    BoxShadow(
                      color: AppTheme.black,
                      offset: Offset(2, 3),
                      blurRadius: 0,
                      spreadRadius: 0,
                    ),
                  ],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.add, size: 20, color: AppTheme.black),
                    const SizedBox(width: 8),
                    Text(
                      'Add Trip',
                      style: AppTheme.labelLarge(context).copyWith(
                        fontWeight: FontWeight.bold,
                        color: AppTheme.black,
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
}

/// 子 Tab 文字按钮组件 - 底部黄色线样式
class _SubTabTextButton extends StatelessWidget {
  const _SubTabTextButton({
    required this.label,
    required this.count,
    required this.isSelected,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: AppTheme.bodyLarge(context).copyWith(
              color: isSelected ? AppTheme.black : AppTheme.black.withOpacity(0.4),
              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
            ),
          ),
          if (count > 0) ...[
            const SizedBox(width: 4),
            Text(
              '($count)',
              style: AppTheme.bodyMedium(context).copyWith(
                color: isSelected ? AppTheme.black : AppTheme.black.withOpacity(0.4),
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
