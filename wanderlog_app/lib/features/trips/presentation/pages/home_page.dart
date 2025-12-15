import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart';
import 'package:wanderlog/features/map/presentation/pages/album_spots_map_page.dart';
import 'package:wanderlog/features/ai_recognition/presentation/widgets/ai_recognition_sheets_new.dart';

class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class _HomePageState extends ConsumerState<HomePage> {
  int _selectedIndex = 0;
  int _selectedTab = 0; // 0: Album, 1: Map
  bool _isMapFullscreen = false;

  static const _mockTrips = [
    {
      'city': 'copenhagen',
      'count': 15,
      'title': '3 day in copenhagen',
      'tags': ['Landmark', 'Park'], // Top 2 categories by count
      'image':
          'https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?w=800', // 哥本哈根
    },
    {
      'city': 'Porto',
      'count': 10,
      'title': 'Amazing Architectures in Porto',
      'tags': ['architecture', 'Siza'],
      'image':
          'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800', // 波尔图
    },
    {
      'city': 'Paris',
      'count': 85,
      'title': 'Romance & Art in Paris',
      'tags': ['museum', 'cafe', 'fashion'],
      'image':
          'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800', // 巴黎
    },
    {
      'city': 'Tokyo',
      'count': 120,
      'title': 'Tokyo Street Food Adventure',
      'tags': ['food', 'culture', 'nightlife'],
      'image':
          'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800', // 东京
    },
    {
      'city': 'Barcelona',
      'count': 65,
      'title': 'Gaudi & Beach Vibes',
      'tags': ['architecture', 'beach', 'tapas'],
      'image':
          'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800', // 巴塞罗那
    },
    {
      'city': 'Amsterdam',
      'count': 42,
      'title': 'Bikes & Canals',
      'tags': ['canal', 'museum', 'cafe'],
      'image':
          'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=800', // 阿姆斯特丹
    },
  ];

  void _onNavItemTapped(int index) {
    setState(() => _selectedIndex = index);
    switch (index) {
      case 0:
        // Already on home, do nothing
        break;
      case 1:
        context.push('/myland');
        break;
      case 2:
        // Profile page - placeholder
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile page coming soon')),
        );
        break;
    }
  }

  void _handleMapFullscreenChanged(bool isFullscreen) {
    if (_isMapFullscreen == isFullscreen) {
      return;
    }
    setState(() => _isMapFullscreen = isFullscreen);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: AppTheme.background,
        body: SafeArea(
          top: !_isMapFullscreen,
          bottom: !_isMapFullscreen,
          child: Column(
            children: [
              if (!_isMapFullscreen) ...[
                _Header(ref: ref),
                const SizedBox(height: 16),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: SearchBox(
                    hintText: 'Where you wanna go?',
                    readOnly: true,
                    onTap: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Search coming soon')),
                      );
                    },
                    trailingIcon: Icons.photo_library_outlined,
                    onTrailingIconTap: () {
                      AIRecognitionIntroSheet.show(context);
                    },
                  ),
                ),
                const SizedBox(height: 20),
                _TabSwitcher(
                  selectedTab: _selectedTab,
                  onTabChanged: (index) {
                    setState(() {
                      _selectedTab = index;
                      if (index != 1) {
                        _isMapFullscreen = false;
                      }
                    });
                  },
                ),
                const SizedBox(height: 16),
              ],
              Expanded(
                child: _selectedTab == 0
                    ? GridView.builder(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          childAspectRatio: 3 / 4, // 3:4 竖向构图
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                        ),
                        itemCount: _mockTrips.length,
                        itemBuilder: (context, index) {
                          final trip = _mockTrips[index];
                          return _TripCard(
                            city: trip['city'] as String,
                            count: trip['count'] as int,
                            title: trip['title'] as String,
                            tags: (trip['tags'] as List<String>)
                                .map((t) => '#$t')
                                .toList(),
                            imageUrl: trip['image'] as String,
                            onTap: () {
                              Navigator.of(context).push(
                                MaterialPageRoute<void>(
                                  builder: (context) => AlbumSpotsMapPage(
                                    city: trip['city'] as String,
                                    albumTitle: trip['title'] as String,
                                  ),
                                ),
                              );
                            },
                          );
                        },
                      )
                    : MapPage(
                        onFullscreenChanged: _handleMapFullscreenChanged,
                      ), // 显示地图页面
              ),
              if (!_isMapFullscreen)
                _BottomNav(
                  selectedIndex: _selectedIndex,
                  onItemTapped: _onNavItemTapped,
                ),
            ],
          ),
        ),
      );
}

class _Header extends ConsumerWidget {
  const _Header({required this.ref});
  final WidgetRef ref;

  void _showUserMenu(BuildContext context, WidgetRef ref) {
    final authState = ref.read(authProvider);
    final user = authState.user;

    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppTheme.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // User info
              Row(
                children: [
                  Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: AppTheme.primaryYellow,
                      shape: BoxShape.circle,
                      border: Border.all(color: AppTheme.black, width: 2),
                    ),
                    child: Center(
                      child: Text(
                        (user?.name?.isNotEmpty ?? false)
                            ? user!.name![0].toUpperCase()
                            : user?.email[0].toUpperCase() ?? 'U',
                        style: AppTheme.headlineMedium(context),
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (user?.name?.isNotEmpty ?? false)
                          Text(
                            user!.name!,
                            style: AppTheme.titleMedium(context),
                          ),
                        Text(
                          user?.email ?? '',
                          style: AppTheme.bodyMedium(context).copyWith(
                            color: AppTheme.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              const Divider(color: AppTheme.border),
              const SizedBox(height: 8),
              // Logout button
              ListTile(
                leading: const Icon(Icons.logout, color: AppTheme.error),
                title: Text(
                  'Log out',
                  style: AppTheme.titleMedium(context).copyWith(
                    color: AppTheme.error,
                  ),
                ),
                onTap: () async {
                  Navigator.of(context).pop();
                  // Show loading indicator
                  showDialog<void>(
                    context: context,
                    barrierDismissible: false,
                    builder: (context) => const Center(
                      child: CircularProgressIndicator(),
                    ),
                  );
                  
                  try {
                    await ref.read(authProvider.notifier).logout();
                    // Close loading indicator
                    if (context.mounted) {
                      Navigator.of(context).pop();
                      context.go('/login');
                    }
                  } catch (e) {
                    // Close loading indicator
                    if (context.mounted) {
                      Navigator.of(context).pop();
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Logout failed: $e')),
                      );
                    }
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final isAuthenticated = authState.isAuthenticated;

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Text(
            'WanderLog',
            style: AppTheme.displayMedium(context),
          ),
          const Spacer(),
          if (isAuthenticated)
            IconButtonCustom(
              icon: Icons.account_circle,
              onPressed: () => _showUserMenu(context, ref),
            )
          else
            TextButtonCustom(
              text: 'sign in',
              onPressed: () => context.go('/login'),
            ),
        ],
      ),
    );
  }
}

class _TabSwitcher extends StatelessWidget {
  const _TabSwitcher({
    required this.selectedTab,
    required this.onTabChanged,
  });

  final int selectedTab;
  final ValueChanged<int> onTabChanged;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 60), // 左右各60px margin
        child: Container(
          height: 44,
          decoration: BoxDecoration(
            color: AppTheme.white,
            borderRadius: BorderRadius.circular(22), // 全圆角
            border: Border.all(
              color: AppTheme.black,
              width: 1,
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: () => onTabChanged(0),
                  child: Container(
                    decoration: BoxDecoration(
                      color: selectedTab == 0
                          ? AppTheme.primaryYellow
                          : Colors.transparent,
                      borderRadius: const BorderRadius.only(
                        topLeft: Radius.circular(20),
                        bottomLeft: Radius.circular(20),
                      ),
                    ),
                    child: Center(
                      child: Text(
                        'Album',
                        style: AppTheme.labelLarge(context),
                      ),
                    ),
                  ),
                ),
              ),
              Container(
                width: 1,
                color: AppTheme.black,
              ),
              Expanded(
                child: GestureDetector(
                  onTap: () => onTabChanged(1),
                  child: Container(
                    decoration: BoxDecoration(
                      color: selectedTab == 1
                          ? AppTheme.primaryYellow
                          : Colors.transparent,
                      borderRadius: const BorderRadius.only(
                        topRight: Radius.circular(20),
                        bottomRight: Radius.circular(20),
                      ),
                    ),
                    child: Center(
                      child: Text(
                        'Map',
                        style: AppTheme.labelLarge(context),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
}

class _TripCard extends StatelessWidget {
  const _TripCard({
    required this.city,
    required this.count,
    required this.title,
    required this.tags,
    required this.imageUrl,
    required this.onTap,
  });

  final String city;
  final int count;
  final String title;
  final List<String> tags;
  final String imageUrl;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
            border: Border.all(
              color: AppTheme.black,
              width: AppTheme.borderThick,
            ),
            boxShadow: AppTheme.cardShadow,
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppTheme.radiusLarge - 2),
            child: Stack(
              fit: StackFit.expand,
              children: [
                // 背景图片
                Image.network(
                  imageUrl,
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) =>
                      const ColoredBox(
                    color: AppTheme.lightGray,
                    child: Icon(
                      Icons.image,
                      size: 50,
                      color: AppTheme.mediumGray,
                    ),
                  ),
                ),

                // 底部黑色渐变蒙层
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: Container(
                    height: 150,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          Colors.black.withOpacity(0.7),
                          Colors.black.withOpacity(0.9),
                        ],
                      ),
                    ),
                  ),
                ),

                // 内容层
                Positioned(
                  left: 12,
                  right: 12,
                  top: 12,
                  bottom: 12,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // 顶部标签
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              color: AppTheme.primaryYellow.withOpacity(0.5),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(
                              city.toLowerCase(),
                              style: AppTheme.labelSmall(context).copyWith(
                                color: AppTheme.black,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              color: AppTheme.primaryYellow.withOpacity(0.5),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  count.toString(),
                                  style: AppTheme.labelSmall(context).copyWith(
                                    color: AppTheme.black,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(width: 2),
                                const Icon(
                                  Icons.location_on,
                                  size: 12,
                                  color: AppTheme.black,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),

                      const Spacer(),

                      // 底部标题和标签
                      Text(
                        title,
                        style: AppTheme.headlineMedium(context).copyWith(
                          color: AppTheme.white,
                          shadows: [
                            const Shadow(
                              color: Colors.black,
                              blurRadius: 4,
                            ),
                          ],
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: tags
                            .take(2)
                            .map(
                              (tag) => Text(
                                tag,
                                style: AppTheme.labelSmall(context).copyWith(
                                  color: AppTheme.white.withOpacity(0.9),
                                ),
                              ),
                            )
                            .toList(),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      );
}

class _BottomNav extends StatelessWidget {
  const _BottomNav({
    required this.selectedIndex,
    required this.onItemTapped,
  });
  final int selectedIndex;
  final void Function(int) onItemTapped;

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
