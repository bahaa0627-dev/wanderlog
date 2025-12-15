import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/shared/models/spot_model.dart';
import 'package:wanderlog/features/trips/presentation/widgets/myland/spot_card.dart';
import 'package:wanderlog/features/trips/presentation/widgets/myland/check_in_dialog.dart';

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
  
  // 视图模式：true = 地图视图, false = 列表视图
  bool _isMapView = false;

  // Mock 数据 - 后续替换为真实数据
  final List<Spot> _mockSpots = [];

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
      _isMapView = true; // Today's Plan 默认地图视图
    }
  }

  void _onSubTabChanged(int index) {
    setState(() {
      _selectedSubTab = index;
      // All 和 Visited 默认列表视图，MustGo 和 Today's Plan 默认地图视图
      if (index == 0 || index == 3) {
        _isMapView = false;
      } else {
        _isMapView = true;
      }
    });
  }

  void _toggleView() {
    setState(() {
      _isMapView = !_isMapView;
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
            _isMapView = false;
          });
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Checked in to ${spot.name}')),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filteredSpots = _getFilteredSpots();

    return Column(
      children: [
        // 子 Tab 栏和视图切换按钮
        Container(
          color: AppTheme.white,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Column(
            children: [
              // 子 Tab 栏
              Row(
                children: [
                  _SubTabChip(
                    label: 'All',
                    count: _allCount,
                    isSelected: _selectedSubTab == 0,
                    onTap: () => _onSubTabChanged(0),
                  ),
                  const SizedBox(width: 8),
                  _SubTabChip(
                    label: 'MustGo',
                    count: _mustGoCount,
                    isSelected: _selectedSubTab == 1,
                    onTap: () => _onSubTabChanged(1),
                  ),
                  const SizedBox(width: 8),
                  _SubTabChip(
                    label: "Today's plan",
                    count: _todaysPlanCount,
                    isSelected: _selectedSubTab == 2,
                    onTap: () => _onSubTabChanged(2),
                  ),
                  const SizedBox(width: 8),
                  _SubTabChip(
                    label: 'Visited',
                    count: _visitedCount,
                    isSelected: _selectedSubTab == 3,
                    onTap: () => _onSubTabChanged(3),
                  ),
                ],
              ),
              
              const SizedBox(height: 12),
              
              // 视图切换按钮
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  _ViewToggleButton(
                    icon: Icons.view_list_rounded,
                    isSelected: !_isMapView,
                    onTap: () {
                      if (_isMapView) _toggleView();
                    },
                  ),
                  const SizedBox(width: 8),
                  _ViewToggleButton(
                    icon: Icons.map_outlined,
                    isSelected: _isMapView,
                    onTap: () {
                      if (!_isMapView) _toggleView();
                    },
                  ),
                ],
              ),
            ],
          ),
        ),

        // 内容区域
        Expanded(
          child: _isMapView
              ? _buildMapView(filteredSpots)
              : _buildListView(filteredSpots),
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

  Widget _buildMapView(List<Spot> spots) {
    if (spots.isEmpty) {
      return _buildEmptyState();
    }

    // TODO: 实现地图视图
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            Icons.map_outlined,
            size: 80,
            color: AppTheme.black,
          ),
          const SizedBox(height: 16),
          Text(
            'Map View',
            style: AppTheme.headlineMedium(context),
          ),
          const SizedBox(height: 8),
          Text(
            'Coming soon',
            style: AppTheme.bodyMedium(context).copyWith(
              color: AppTheme.black.withOpacity(0.6),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    String message;
    String hint;

    switch (_selectedSubTab) {
      case 0:
        message = 'No data';
        hint = 'You can have your\nadd place on trip to mapping';
        break;
      case 1:
        message = 'No Must-Go spots';
        hint = 'Mark important spots as Must-Go';
        break;
      case 2:
        message = 'No plans for today';
        hint = 'Add spots to your today\'s plan';
        break;
      case 3:
        message = 'No visited spots';
        hint = 'Check in to spots as you visit them';
        break;
      default:
        message = 'No data';
        hint = '';
    }

    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.location_off_outlined,
            size: 80,
            color: Colors.grey.shade400,
          ),
          const SizedBox(height: 16),
          Text(
            message,
            style: TextStyle(
              fontSize: 18,
              color: Colors.grey.shade600,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            hint,
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey.shade500,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

/// 子 Tab 芯片组件
class _SubTabChip extends StatelessWidget {
  const _SubTabChip({
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
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.primaryYellow : AppTheme.white,
          border: Border.all(
            color: AppTheme.black,
            width: AppTheme.borderMedium,
          ),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: AppTheme.labelMedium(context).copyWith(
                color: AppTheme.black,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
              ),
            ),
            if (count > 0) ...[
              const SizedBox(width: 4),
              Text(
                '($count)',
                style: AppTheme.labelMedium(context).copyWith(
                  color: AppTheme.black,
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// 视图切换按钮
class _ViewToggleButton extends StatelessWidget {
  const _ViewToggleButton({
    required this.icon,
    required this.isSelected,
    required this.onTap,
  });

  final IconData icon;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.primaryYellow : AppTheme.white,
          border: Border.all(
            color: AppTheme.black,
            width: AppTheme.borderMedium,
          ),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(
          icon,
          size: 20,
          color: AppTheme.black,
        ),
      ),
    );
  }
}
