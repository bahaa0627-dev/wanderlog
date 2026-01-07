import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:palette_generator/palette_generator.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart';
import 'package:wanderlog/features/map/presentation/pages/collection_spots_map_page.dart';
import 'package:wanderlog/features/ai_recognition/presentation/pages/ai_chat_page.dart';
import 'package:wanderlog/features/ai_recognition/presentation/pages/ai_assistant_page.dart';
import 'package:wanderlog/features/trips/presentation/widgets/trips_bottom_nav.dart';
import 'package:wanderlog/features/collections/providers/collection_providers.dart';
import 'package:wanderlog/features/collections/providers/collections_cache_provider.dart';
import 'package:wanderlog/features/map/providers/places_cache_provider.dart';
import 'package:wanderlog/features/search/presentation/widgets/search_menu_sheet.dart';
import 'package:wanderlog/features/search/providers/countries_cities_provider.dart';
import 'package:wanderlog/features/profile/presentation/pages/settings_page.dart';

class HomePage extends ConsumerStatefulWidget {
  const HomePage({
    this.initialTabIndex = 0,
    super.key,
  });

  final int initialTabIndex;

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class _HomePageState extends ConsumerState<HomePage> {
  late int _selectedIndex; // 底部 tab: 0=Home, 1=MyLand, 2=Profile
  int _selectedTab = 0; // Home 内部 tab: 0=Collection, 1=Map
  bool _isMapFullscreen = false;
  bool _showSearchMenu = false;
  List<Map<String, dynamic>> _recommendations = [];
  bool _isLoadingRecommendations = false;
  int _mapResetKey = 0;
  
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
    _selectedIndex = widget.initialTabIndex;
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
    if (_selectedIndex == index) return;
    
    if (index == 1) {
      // MyLand - 跳转到独立页面
      context.go('/myland');
    } else {
      // Home 或 Profile - 切换 tab
      setState(() => _selectedIndex = index);
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
            // 根据底部 tab 显示不同内容
            if (_selectedIndex == 2)
              // Profile/Settings 页面 - 需要给底部导航留空间
              const Positioned.fill(
                bottom: 70, // 底部导航栏高度
                child: SettingsPage(),
              )
            else
              // Home 页面内容
              SafeArea(
                top: !_isMapFullscreen,
                bottom: !_isMapFullscreen,
                child: Column(
                  children: [
                    if (!_isMapFullscreen) ...[
                      _Header(
                        ref: ref,
                        onAskAITap: () {
                          Navigator.of(context).push<void>(
                            MaterialPageRoute<void>(
                              builder: (context) => const AIAssistantPage(),
                            ),
                          );
                        },
                      ),
                      const SizedBox(height: 12), // 描述距离搜索框 12px
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: SearchBox(
                          key: _searchBoxKey,
                          hintText: 'Find city and spot here',
                          prefixIcon: const Text('🌏', style: TextStyle(fontSize: 18)),
                          borderRadius: 24, // 大圆角
                          readOnly: true,
                          onTap: _toggleSearchMenu,
                        ),
                      ),
                      const SizedBox(height: 24), // 搜索框距离下面 24px
                      _TabSwitcher(
                        selectedTab: _selectedTab,
                        onTabChanged: (index) {
                          setState(() {
                            _selectedTab = index;
                            if (index != 1) {
                              _isMapFullscreen = false;
                            }
                            if (index == 1) {
                              _mapResetKey++;
                            }
                          });
                        },
                      ),
                      const SizedBox(height: 12), // collection 切换底部距离合集推荐标题 12px
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
                                  padding: const EdgeInsets.symmetric(vertical: 0),
                                  itemCount: _recommendations.length,
                                  itemBuilder: (context, recommendationIndex) {
                                    final recommendation = _recommendations[recommendationIndex];
                                    final items = recommendation['items'] as List<dynamic>? ?? [];
                                    final recommendationName = recommendation['name'] as String? ?? '';
                                    final hasMore = items.length > 5;
                                    final displayItems = items.take(5).toList();
                                    
                                    return Padding(
                                      padding: EdgeInsets.only(
                                        bottom: recommendationIndex < _recommendations.length - 1 ? 16 : 0, // 合集推荐之间间距 16px
                                      ),
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          // 推荐标题行 - 不要黄色竖杠
                                          Padding(
                                            padding: const EdgeInsets.symmetric(horizontal: 16),
                                            child: Row(
                                              children: [
                                                // 推荐名称 - 直接展示
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
                                          const SizedBox(height: 8), // 合集标题距离合集卡片 8px
                                          // 横向滚动的合集列表 - 增加高度以容纳阴影
                                          SizedBox(
                                            height: 258, // 卡片高度 250px + 阴影偏移 4px + 边距 4px
                                            child: ListView.builder(
                                              scrollDirection: Axis.horizontal,
                                              clipBehavior: Clip.none,
                                              padding: const EdgeInsets.only(left: 16, right: 16, bottom: 8),
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
                                                
                                                // 辅助函数：检查 URL 是否是有效的图片 URL
                                                bool isValidImageUrl(String? url) {
                                                  if (url == null || url.isEmpty) return false;
                                                  if (url.contains('example.com')) return false;
                                                  if (url.contains('placeholder')) return false;
                                                  return true;
                                                }
                                                
                                                // 获取封面图：优先使用 collection 的 coverImage，否则遍历所有地点找第一个有效图片
                                                String coverImage = '';
                                                final collectionCoverImage = collection['coverImage'] as String?;
                                                if (isValidImageUrl(collectionCoverImage)) {
                                                  coverImage = collectionCoverImage!;
                                                } else {
                                                  // 遍历所有地点找第一个有效的封面图
                                                  for (final spot in collectionSpots) {
                                                    final place = spot['place'] as Map<String, dynamic>?;
                                                    if (place == null) continue;
                                                    final placeCoverImage = place['coverImage'] as String?;
                                                    if (isValidImageUrl(placeCoverImage)) {
                                                      coverImage = placeCoverImage!;
                                                      break;
                                                    }
                                                  }
                                                }
                                                // 如果还是没有图片，使用占位图
                                                if (coverImage.isEmpty) {
                                                  coverImage = 'https://via.placeholder.com/400x600';
                                                }
                                                
                                                final count = collectionSpots.length;
                                                
                                                return Padding(
                                                  padding: EdgeInsets.only(
                                                    right: itemIndex < displayItems.length - 1 ? 12 : 0,
                                                  ),
                                                  child: SizedBox(
                                                    width: 167,
                                                    height: 250,
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
                                                          initialIsFavorited: false,
                                                          description: collection['description'] as String?,
                                                          coverImage: collection['coverImage'] as String?,
                                                          people: LinkItem.parseList(collection['people'], isPeople: true),
                                                          works: LinkItem.parseList(collection['works'], isPeople: false),
                                    ),
                                  ),
                                );

                                                    if (result != null && mounted) {
                                                      if ((result is Map && result['shouldRefresh'] == true) ||
                                                          (result is bool && result)) {
                                                        // 同时刷新缓存，确保下次进入详情页时获取最新数据
                                                        ref.read(collectionsCacheProvider.notifier).refresh();
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
                          // Tab 1: Map - 添加底部 padding 为底部导航栏留空间
                          Padding(
                            padding: const EdgeInsets.only(bottom: 38),
                            child: MapPage(
                              key: const ValueKey('map-page-default'),
                              resetSelectionKey: _mapResetKey,
                              onFullscreenChanged: _handleMapFullscreenChanged,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            // 底部导航 - 始终显示（除了地图全屏时）
            if (!_isMapFullscreen || _selectedIndex == 2)
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: TripsBottomNav(
                  selectedIndex: _selectedIndex,
                  onItemTapped: _onNavItemTapped,
                ),
              ),
            // 搜索菜单 overlay
            if (_showSearchMenu && _selectedIndex == 0)
              SearchMenuOverlay(
                searchBoxKey: _searchBoxKey,
                onClose: () => setState(() => _showSearchMenu = false),
              ),
          ],
        ),
      );
}

class _Header extends ConsumerWidget {
  const _Header({required this.ref, this.onAskAITap});
  final WidgetRef ref;
  final VoidCallback? onAskAITap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center, // 垂直居中
        children: [
          // 左侧标题和描述
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.start,
              children: [
                Text(
                  'VAGO',
                  style: AppTheme.displayLarge(context).copyWith(
                    fontSize: 48,
                    height: 1.0,
                    fontWeight: FontWeight.w700, // 改细一档
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Your own personalized flaneur guide',
                  style: AppTheme.bodySmall(context).copyWith(
                    fontSize: 16,
                    color: AppTheme.mediumGray,
                  ),
                ),
              ],
            ),
          ),
          // 右上角 ask AI 按钮 - emoji 和文字分开，下划线只在文字下方
          GestureDetector(
            onTap: onAskAITap,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const Text('✨', style: TextStyle(fontSize: 14)),
                const SizedBox(width: 4),
                Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'ask AI',
                      style: AppTheme.labelSmall(context).copyWith(
                        fontWeight: FontWeight.w600,
                        color: AppTheme.black,
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(height: 2),
                    // 黄色下划线 - 只在文字下方
                    Container(
                      height: 2,
                      width: 38, // 仅文字宽度
                      decoration: BoxDecoration(
                        color: AppTheme.primaryYellow,
                        borderRadius: BorderRadius.circular(1),
                      ),
                    ),
                  ],
                ),
              ],
            ),
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
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(
          children: [
            _PillTab(
              label: 'Collection',
              active: selectedTab == 0,
              onTap: () => onTabChanged(0),
            ),
            const SizedBox(width: 8), // 选中时间距 8px
            _PillTab(
              label: 'Map',
              active: selectedTab == 1,
              onTap: () => onTabChanged(1),
            ),
          ],
        ),
      );
}

class _PillTab extends StatelessWidget {
  const _PillTab({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: active ? AppTheme.primaryYellow : Colors.transparent,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          label,
          style: AppTheme.bodyMedium(context).copyWith(
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: active ? AppTheme.black : AppTheme.mediumGray,
          ),
        ),
      ),
    );
  }
}

class _TripCard extends StatefulWidget {
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
  State<_TripCard> createState() => _TripCardState();
}

class _TripCardState extends State<_TripCard> {
  Color _dominantColor = Colors.black;
  bool _colorExtracted = false;

  @override
  void initState() {
    super.initState();
    _extractDominantColor();
  }

  @override
  void didUpdateWidget(_TripCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.imageUrl != widget.imageUrl) {
      _extractDominantColor();
    }
  }

  Future<void> _extractDominantColor() async {
    if (widget.imageUrl.isEmpty) return;
    
    try {
      final ImageProvider imageProvider;
      if (widget.imageUrl.startsWith('data:image/')) {
        imageProvider = MemoryImage(_decodeBase64Image(widget.imageUrl));
      } else {
        imageProvider = NetworkImage(widget.imageUrl);
      }
      
      final paletteGenerator = await PaletteGenerator.fromImageProvider(
        imageProvider,
        size: const Size(100, 100), // 使用小尺寸提高性能
        maximumColorCount: 5,
      );
      
      if (mounted) {
        setState(() {
          // 优先使用主色，如果没有则使用暗色调或默认黑色
          _dominantColor = paletteGenerator.dominantColor?.color ??
              paletteGenerator.darkMutedColor?.color ??
              paletteGenerator.darkVibrantColor?.color ??
              Colors.black;
          _colorExtracted = true;
        });
      }
    } catch (e) {
      // 取色失败时使用默认黑色
      if (mounted) {
        setState(() {
          _dominantColor = Colors.black;
          _colorExtracted = true;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    const double cardRadius = AppTheme.radiusLarge;
    const double innerRadius = cardRadius - AppTheme.borderThick;

    return RepaintBoundary(
      child: GestureDetector(
        onTap: widget.onTap,
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
                if (widget.imageUrl.startsWith('data:image/')) Image.memory(
                        _decodeBase64Image(widget.imageUrl),
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
                        widget.imageUrl,
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

                // 底部渐变蒙层 - 使用提取的主色
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: Container(
                    height: 125, // 卡片高度 250 的一半
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          _dominantColor.withOpacity(0.3),
                          _dominantColor.withOpacity(0.6),
                          _dominantColor.withOpacity(0.85),
                        ],
                        stops: const [0.0, 0.3, 0.6, 1.0],
                      ),
                    ),
                  ),
                ),

                // 内容层
                Positioned(
                  left: 12,
                  right: 12,
                  top: 12,
                  bottom: 16, // 增加底部 padding 防止 overflow
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // 顶部标签 - 右侧对齐，使用 LayoutBuilder 检测空间
                      LayoutBuilder(
                        builder: (context, constraints) {
                          // 计算城市名称需要的宽度
                          final cityTextPainter = TextPainter(
                            text: TextSpan(
                              text: widget.city,
                              style: AppTheme.labelSmall(context).copyWith(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            maxLines: 1,
                            textDirection: TextDirection.ltr,
                          )..layout();
                          
                          // 城市标签宽度 = 文字宽度 + padding (12 * 2)
                          final cityTagWidth = cityTextPainter.width + 24;
                          // 数量标签宽度约 42 (padding 10*2 + 数字约10 + icon 12)
                          final countTagWidth = 42.0;
                          final spacing = 8.0;
                          final totalNeeded = cityTagWidth + countTagWidth + spacing;
                          
                          // 如果空间不够，只显示城市名
                          final showCount = totalNeeded <= constraints.maxWidth;
                          
                          return Row(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              if (showCount) ...[
                                // 地点数量 - 64% 白色背景，黑色文字
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
                                        widget.count.toString(),
                                        style: AppTheme.labelSmall(context).copyWith(
                                          fontSize: 12,
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
                                const SizedBox(width: 8),
                              ],
                              // 城市名称 - 白色背景，黑色文字
                              Flexible(
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 6,
                                  ),
                                  decoration: BoxDecoration(
                                    color: AppTheme.white,
                                    borderRadius: BorderRadius.circular(20),
                                  ),
                                  child: Text(
                                    widget.city,
                                    style: AppTheme.labelSmall(context).copyWith(
                                      fontSize: 12,
                                      color: AppTheme.black,
                                      fontWeight: FontWeight.bold,
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ),
                            ],
                          );
                        },
                      ),

                      const Spacer(),

                      // 底部标题和标签 - 限制高度防止 overflow
                      Flexible(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              widget.title,
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
                            const SizedBox(height: 6),
                            Wrap(
                              spacing: 6,
                              runSpacing: 4,
                              children: widget.tags
                                  .take(2)
                                  .map(
                                    (tag) => Text(
                                      tag,
                                      style: AppTheme.labelSmall(context).copyWith(
                                        fontSize: 12,
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
