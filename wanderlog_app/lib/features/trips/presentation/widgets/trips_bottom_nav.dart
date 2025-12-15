import 'package:flutter/material.dart';
import 'package:wanderlog/core/theme/app_theme.dart';

class TripsBottomNav extends StatelessWidget {
  const TripsBottomNav({
    required this.selectedIndex,
    required this.onItemTapped,
    super.key,
  });

  final int selectedIndex;
  final ValueChanged<int> onItemTapped;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        decoration: const BoxDecoration(
          color: AppTheme.white,
          border: Border(
            top: BorderSide(
              color: AppTheme.black,
              width: AppTheme.borderMedium,
            ),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            _NavItem(
              label: 'Home',
              active: selectedIndex == 0,
              onTap: () => onItemTapped(0),
            ),
            _NavItem(
              label: 'MyLand',
              active: selectedIndex == 1,
              onTap: () => onItemTapped(1),
            ),
            _NavItem(
              label: 'Profile',
              active: selectedIndex == 2,
              onTap: () => onItemTapped(2),
            ),
          ],
        ),
      );
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
          decoration: active
              ? BoxDecoration(
                  color: AppTheme.primaryYellow,
                  borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                )
              : null,
          child: Text(
            label,
            style: AppTheme.labelLarge(context).copyWith(
              color: active ? AppTheme.black : AppTheme.mediumGray,
            ),
          ),
        ),
      );
}
