import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart';
import 'package:wanderlog/features/map/presentation/pages/album_spots_map_page.dart';
import 'package:wanderlog/features/ai_recognition/presentation/widgets/ai_recognition_sheets_new.dart';
import 'package:wanderlog/features/trips/presentation/widgets/trips_bottom_nav.dart';
import 'package:wanderlog/features/collections/providers/collection_providers.dart';

class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class _HomePageState extends ConsumerState<HomePage> {
  int _selectedIndex = 0;
  int _selectedTab = 0; // 0: Album, 1: Map
  bool _isMapFullscreen = false;
  List<Map<String, dynamic>> _collections = [];
  bool _isLoadingCollections = false;

  @override
  void initState() {
    super.initState();
    _loadCollections();
  }

  Future<void> _loadCollections() async {
    setState(() => _isLoadingCollections = true);
    try {
      final repo = ref.read(collectionRepositoryProvider);
      final data = await repo.listCollections();
      setState(() => _collections = data);
    } catch (_) {
      setState(() => _collections = []);
    } finally {
      if (mounted) {
        setState(() => _isLoadingCollections = false);
      }
    }
  }

  void _onNavItemTapped(int index) {
    if (_selectedIndex == index) {
      return;
    }
    setState(() => _selectedIndex = index);
    switch (index) {
      case 0:
        // Already on home, do nothing
        break;
      case 1:
        context.go('/myland');
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
                    ? (_isLoadingCollections
                        ? const Center(child: CircularProgressIndicator())
                        : GridView.builder(
                            padding:
                                const EdgeInsets.symmetric(horizontal: 16),
                            gridDelegate:
                                const SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 2,
                              childAspectRatio: 3 / 4,
                              crossAxisSpacing: 12,
                              mainAxisSpacing: 12,
                            ),
                            itemCount: _collections.length,
                            itemBuilder: (context, index) {
                              final item = _collections[index];
                              final spots = item['collectionSpots'] as List<dynamic>? ?? [];
                              final firstSpot = spots.isNotEmpty ? spots.first['spot'] as Map<String, dynamic>? : null;
                              final city = (firstSpot?['city'] as String?)?.isNotEmpty == true
                                  ? firstSpot!['city'] as String
                                  : 'Multi-city';
                              final tags = (firstSpot?['tags'] as List<dynamic>? ?? [])
                                  .take(3)
                                  .map((e) => '#$e')
                                  .toList();
                              final image = item['coverImage'] as String? ??
                                  (firstSpot?['coverImage'] as String? ??
                                      'https://via.placeholder.com/400x600');
                              final title = item['name'] as String? ?? 'Collection';
                              final count = spots.length;
                              return _TripCard(
                                city: city,
                                count: count,
                                title: title,
                                tags: tags,
                                imageUrl: image,
                                onTap: () {
                                  Navigator.of(context).push(
                                    MaterialPageRoute<void>(
                                      builder: (context) => AlbumSpotsMapPage(
                                        city: city,
                                        albumTitle: title,
                                        collectionId: item['id'] as String?,
                                        description: item['description'] as String?,
                                        coverImage: item['coverImage'] as String?,
                                        people: (item['people'] as List<dynamic>? ?? [])
                                            .map((p) => LinkItem(
                                                  name: p['name'] as String? ?? '',
                                                  link: p['link'] as String?,
                                                  avatarUrl: p['avatarUrl'] as String?,
                                                ))
                                            .toList(),
                                        works: (item['works'] as List<dynamic>? ?? [])
                                            .map((w) => LinkItem(
                                                  name: w['name'] as String? ?? '',
                                                  link: w['link'] as String?,
                                                  coverImage: w['coverImage'] as String?,
                                                ))
                                            .toList(),
                                      ),
                                    ),
                                  );
                                },
                              );
                            },
                          ))
                    : MapPage(
                        onFullscreenChanged: _handleMapFullscreenChanged,
                      ), // 显示地图页面
              ),
              if (!_isMapFullscreen)
                TripsBottomNav(
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
  Widget build(BuildContext context) {
    const double cardRadius = AppTheme.radiusLarge;
    final double innerRadius = cardRadius - AppTheme.borderThick;

    return RepaintBoundary(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          clipBehavior: Clip.hardEdge,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(cardRadius),
            border: Border.all(
              color: AppTheme.black,
              width: AppTheme.borderThick,
            ),
            boxShadow: AppTheme.cardShadow,
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(innerRadius),
            child: Stack(
              fit: StackFit.expand,
              children: [
                // 背景图片 - 支持 DataURL (base64) 和网络图片
                imageUrl.startsWith('data:image/')
                    ? Image.memory(
                        _decodeBase64Image(imageUrl),
                        fit: BoxFit.cover,
                        gaplessPlayback: true,
                        filterQuality: FilterQuality.low,
                        errorBuilder: (context, error, stackTrace) =>
                            const ColoredBox(
                          color: AppTheme.lightGray,
                          child: Icon(
                            Icons.image,
                            size: 50,
                            color: AppTheme.mediumGray,
                          ),
                        ),
                      )
                    : Image.network(
                        imageUrl,
                        fit: BoxFit.cover,
                        gaplessPlayback: true,
                        filterQuality: FilterQuality.low,
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
      ),
    );
  }
  
  // 解码 base64 图片
  static Uint8List _decodeBase64Image(String dataUrl) {
    try {
      final base64String = dataUrl.split(',').last;
      return base64Decode(base64String);
    } catch (e) {
      return Uint8List(0);
    }
  }
}
