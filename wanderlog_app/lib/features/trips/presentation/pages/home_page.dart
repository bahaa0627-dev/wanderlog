import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart';
import 'package:wanderlog/features/map/presentation/pages/collection_spots_map_page.dart';
import 'package:wanderlog/features/ai_recognition/presentation/pages/ai_chat_page.dart';
import 'package:wanderlog/features/trips/presentation/widgets/trips_bottom_nav.dart';
import 'package:wanderlog/features/collections/providers/collection_providers.dart';
import 'package:wanderlog/features/collections/providers/collections_cache_provider.dart';
import 'package:wanderlog/features/map/providers/places_cache_provider.dart';
import 'package:wanderlog/features/search/presentation/widgets/search_menu_sheet.dart';
import 'package:wanderlog/features/search/providers/countries_cities_provider.dart';

class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class _HomePageState extends ConsumerState<HomePage> {
  int _selectedIndex = 0;
  int _selectedTab = 0; // 0: Collection, 1: Map
  bool _isMapFullscreen = false;
  bool _showSearchMenu = false;
  List<Map<String, dynamic>> _recommendations = [];
  bool _isLoadingRecommendations = false;
  int _mapResetKey = 0; // 用于重置 map 选中状态
  
  final GlobalKey _searchBoxKey = GlobalKey();

  bool _asBool(dynamic value) {
    if (value is bool) return value;
    if (value is num) return value != 0;
    if (value is String) return value == 'true' || value == '1';
    return false;
  }

  @override
  void initState() {
    super.initState();
    _loadRecommendations();
    // 使用 addPostFrameCallback 延迟预加载，避免在 widget 构建期间修改 provider
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(placesCacheProvider.notifier).preloadPlaces();
      ref.read(collectionsCacheProvider.notifier).preloadCollections();
      ref.read(countriesCitiesProvider.notifier).preload();
    });
  }

  Future<void> _loadRecommendations() async {
    if (!mounted) return;
    setState(() => _isLoadingRecommendations = true);
    try {
      final repo = ref.read(collectionRepositoryProvider);
      final data = await repo.listRecommendations();
      print('✅ Loaded ${data.length} recommendations');
      print('📦 Recommendations data: $data');
      if (mounted) {
        setState(() => _recommendations = data);
      }
    } catch (e, stackTrace) {
      print('❌ Error loading recommendations: $e');
      print('📋 Stack trace: $stackTrace');
      if (mounted) {
        setState(() => _recommendations = []);
      }
    } finally {
      if (mounted) {
        setState(() => _isLoadingRecommendations = false);
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
  
  void _toggleSearchMenu() {
    print('📍 Search box tapped! _showSearchMenu: $_showSearchMenu');
    setState(() {
      _showSearchMenu = !_showSearchMenu;
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: AppTheme.background,
        body: Stack(
          children: [
            SafeArea(
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
                        key: _searchBoxKey,
                        hintText: 'Where you wanna go?',
                        readOnly: true,
                        onTap: _toggleSearchMenu,
                        trailingWidget: GestureDetector(
                          onTap: () {
                            Navigator.of(context).push<void>(
                              MaterialPageRoute<void>(
                                builder: (context) => const AIChatPage(),
                              ),
                            );
                          },
                          child: Container(
                            margin: const EdgeInsets.only(right: 8),
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: AppTheme.white,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(color: AppTheme.black, width: 1.5),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Text('✨', style: TextStyle(fontSize: 14)),
                                const SizedBox(width: 4),
                                Text(
                                  'AI',
                                  style: AppTheme.labelSmall(context).copyWith(
                                    fontWeight: FontWeight.w700,
                                    color: AppTheme.black,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
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
                          // 切换到 map 时递增 key，触发重置选中状态
                          if (index == 1) {
                            _mapResetKey++;
                          }
                        });
                      },
                    ),
                    const SizedBox(height: 16),
                  ],
                  Expanded(
                    child: IndexedStack(
                      index: _selectedTab,
                      children: [
                        // Tab 0: Collection
                        _isLoadingRecommendations
                            ? const Center(child: CircularProgressIndicator())
                            : _recommendations.isEmpty
                                ? Center(
                                    child: Column(
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        const Text('No recommendations available'),
                                        const SizedBox(height: 16),
                                        Text('Loaded: ${_recommendations.length} recommendations'),
                                        TextButton(
                                          onPressed: _loadRecommendations,
                                          child: const Text('Retry'),
                                    ),
                                  ],
                                ),
                              )
                            : ListView.builder(
                                padding: const EdgeInsets.symmetric(vertical: 16),
                                itemCount: _recommendations.length,
                                itemBuilder: (context, recommendationIndex) {
                                  final recommendation = _recommendations[recommendationIndex];
                                  final items = recommendation['items'] as List<dynamic>? ?? [];
                                  final recommendationName = recommendation['name'] as String? ?? '';
                                  final hasMore = items.length > 5;
                                  final displayItems = items.take(5).toList();
                                  
                                  return Padding(
                                    padding: const EdgeInsets.only(bottom: 24),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        // 推荐标题行
                                        Padding(
                                          padding: const EdgeInsets.symmetric(horizontal: 16),
                                          child: Row(
                                            children: [
                                              // 黄色竖杠
                                              Container(
                                                width: 4,
                                                height: 20,
                                                decoration: BoxDecoration(
                                                  color: AppTheme.primaryYellow,
                                                  borderRadius: BorderRadius.circular(2),
                                                ),
                                              ),
                                              const SizedBox(width: 8),
                                              // 推荐名称
                                              Expanded(
                                                child: Text(
                                                  recommendationName,
                                                  style: AppTheme.headlineLarge(context).copyWith(
                                                    fontSize: 18,
                                                  ),
                                                ),
                                              ),
                                              // More 按钮（超过5个时显示）
                                              if (hasMore)
                                                GestureDetector(
                                                  onTap: () {
                                                    final recommendationId = recommendation['id'] as String?;
                                                    if (recommendationId != null) {
                                                      context.push(
                                                        '/recommendation/$recommendationId?name=${Uri.encodeComponent(recommendationName)}',
                                                      );
                                                    }
                                                  },
                                                  child: Text(
                                                    'more >',
                                                    style: AppTheme.labelSmall(context).copyWith(
                                                      fontWeight: FontWeight.w400,
                                                      color: AppTheme.textSecondary,
                                                    ),
                                                  ),
                                                ),
                                            ],
                                          ),
                                        ),
                                        const SizedBox(height: 12),
                                        // 横向滚动的合集列表
                                        SizedBox(
                                          height: 224,
                                          child: ListView.builder(
                                            scrollDirection: Axis.horizontal,
                                            clipBehavior: Clip.none,
                                            padding: const EdgeInsets.symmetric(horizontal: 16),
                                            itemCount: displayItems.length,
                                            itemBuilder: (context, itemIndex) {
                                              final item = displayItems[itemIndex];
                                              final collection = item['collection'] as Map<String, dynamic>? ?? {};
                                              final collectionId = collection['id'] as String?;
                                              
                                              // 获取合集的地点信息
                                              final collectionSpots = collection['collectionSpots'] as List<dynamic>? ?? [];
                                              final firstSpot = collectionSpots.isNotEmpty 
                                                  ? (collectionSpots.first['place'] as Map<String, dynamic>?)
                                                  : null;
                                              
                              final city = (firstSpot?['city'] as String?)?.isNotEmpty ?? false
                                  ? firstSpot!['city'] as String
                                  : 'Multi-city';
                                              
                              // 从所有地点中收集标签，优先使用 tags，如果没有则使用 aiTags
                              final List<dynamic> tagsList = [];
                              for (final spot in collectionSpots) {
                                final place = spot['place'] as Map<String, dynamic>?;
                                if (place == null) continue;
                                
                                // 尝试获取 tags
                                final dynamic tagsValue = place['tags'];
                                if (tagsValue != null) {
                                  if (tagsValue is List) {
                                    tagsList.addAll(tagsValue);
                                  } else if (tagsValue is String) {
                                    try {
                                      final decoded = jsonDecode(tagsValue) as List<dynamic>?;
                                      if (decoded != null) tagsList.addAll(decoded);
                                    } catch (e) {
                                      // 忽略解析错误
                                    }
                                  }
                                }
                                
                                // 如果还没有标签，尝试使用 aiTags
                                if (tagsList.isEmpty) {
                                  final dynamic aiTagsValue = place['aiTags'];
                                  if (aiTagsValue != null) {
                                    if (aiTagsValue is List) {
                                      tagsList.addAll(aiTagsValue);
                                    } else if (aiTagsValue is String) {
                                      try {
                                        final decoded = jsonDecode(aiTagsValue) as List<dynamic>?;
                                        if (decoded != null) tagsList.addAll(decoded);
                                      } catch (e) {
                                        // 忽略解析错误
                                      }
                                    }
                                  }
                                }
                                
                                // 如果已经收集到足够的标签，可以提前退出
                                if (tagsList.length >= 3) break;
                              }
                              
                              // 去重并取前3个
                              final uniqueTags = tagsList.toSet().toList();
                              final tags = uniqueTags
                                  .take(3)
                                  .map((e) => '#$e')
                                  .toList();
                                              
                                              final collectionName = collection['name'] as String? ?? 'Collection';
                                              final coverImage = collection['coverImage'] as String? ??
                                  (firstSpot?['coverImage'] as String? ??
                                      'https://via.placeholder.com/400x600');
                                              final count = collectionSpots.length;
                                              
                                              return Padding(
                                                padding: EdgeInsets.only(
                                                  right: itemIndex < displayItems.length - 1 ? 12 : 0,
                                                ),
                                                child: SizedBox(
                                                  width: 168,
                                                  height: 224,
                                                  child: _TripCard(
                                city: city,
                                count: count,
                                                    title: collectionName,
                                tags: tags,
                                                    imageUrl: coverImage,
                                onTap: () async {
                                  final result = await Navigator.of(context).push<dynamic>(
                                    MaterialPageRoute<dynamic>(
                                      builder: (context) => CollectionSpotsMapPage(
                                        city: city,
                                                            collectionTitle: collectionName,
                                                            collectionId: collectionId,
                                                            initialIsFavorited: false, // 推荐列表中的合集默认未收藏
                                                            description: collection['description'] as String?,
                                                            coverImage: collection['coverImage'] as String?,
                                                            people: const [], // 推荐列表暂不包含people信息
                                                            works: const [], // 推荐列表暂不包含works信息
                                      ),
                                    ),
                                  );

                                                      if (result != null && mounted) {
                                                        // 如果需要刷新，重新加载推荐列表
                                                        if ((result is Map && result['shouldRefresh'] == true) ||
                                                            (result is bool && result)) {
                                                          _loadRecommendations();
                                                        }
                                                      }
                                                    },
                                                  ),
                                                ),
                                              );
                                            },
                                          ),
                                        ),
                                      ],
                                    ),
                              );
                            },
                          ),
                        // Tab 1: Map
                        MapPage(
                          key: const ValueKey('map-page-default'),
                          resetSelectionKey: _mapResetKey,
                          onFullscreenChanged: _handleMapFullscreenChanged,
                        ),
                      ],
                    ),
              ),
              if (!_isMapFullscreen)
                TripsBottomNav(
                  selectedIndex: _selectedIndex,
                  onItemTapped: _onNavItemTapped,
                ),
            ],
          ),
        ),
        // 搜索菜单 overlay
        if (_showSearchMenu)
          SearchMenuOverlay(
            searchBoxKey: _searchBoxKey,
            onClose: () => setState(() => _showSearchMenu = false),
          ),
      ],
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
                        'Collection',
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
    const double innerRadius = cardRadius - AppTheme.borderThick;

    return RepaintBoundary(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(cardRadius),
            border: Border.all(
              color: AppTheme.black,
              width: AppTheme.borderThick,
            ),
            boxShadow: AppTheme.strongShadow,
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(innerRadius),
            clipBehavior: Clip.antiAlias,
            child: Stack(
              fit: StackFit.expand,
              children: [
                // 背景图片 - 支持 DataURL (base64) 和网络图片
                if (imageUrl.startsWith('data:image/')) Image.memory(
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
                      ) else Image.network(
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
                      // 顶部标签 - 右侧对齐
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          // 地点数量 - 64% 白色背景，黑色文字，在左侧
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              color: AppTheme.white.withOpacity(0.64),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  count.toString(),
                                  style: AppTheme.labelSmall(context).copyWith(
                                    fontSize: 10,
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
                          const SizedBox(width: 12),
                          // 城市名称 - 白色背景，黑色文字，在右侧
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              color: AppTheme.white,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(
                              city.toLowerCase(),
                              style: AppTheme.labelSmall(context).copyWith(
                                fontSize: 10,
                                color: AppTheme.black,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ],
                      ),

                      const Spacer(),

                      // 底部标题和标签
                      Text(
                        title,
                        style: AppTheme.headlineMedium(context).copyWith(
                          fontSize: 16,
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
                                  fontSize: 10,
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
