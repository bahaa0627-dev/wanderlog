import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:palette_generator/palette_generator.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/core/utils/color_utils.dart';
import 'package:wanderlog/core/supabase/services/image_service.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';
import 'package:wanderlog/shared/widgets/vago_placeholder.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart';
import 'package:wanderlog/features/map/presentation/pages/collection_spots_map_page.dart';
import 'package:wanderlog/features/ai_recognition/presentation/pages/ai_assistant_page.dart';
import 'package:wanderlog/features/trips/presentation/widgets/trips_bottom_nav.dart';
// ignore: unused_import
import 'package:wanderlog/features/collections/providers/collection_providers.dart';
import 'package:wanderlog/features/collections/providers/collections_cache_provider.dart';
import 'package:wanderlog/features/collections/providers/recommendations_cache_provider.dart';
import 'package:wanderlog/features/map/providers/places_cache_provider.dart';
import 'package:wanderlog/features/search/presentation/widgets/search_menu_sheet.dart';
import 'package:wanderlog/features/search/presentation/pages/search_results_map_page.dart';
import 'package:wanderlog/features/search/providers/countries_cities_provider.dart';
import 'package:wanderlog/features/search/providers/countries_cities_stats_provider.dart';
import 'package:wanderlog/features/profile/presentation/pages/mine_page.dart';
import 'package:wanderlog/features/ai_recognition/providers/wishlist_status_provider.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';

class HomePage extends ConsumerStatefulWidget {
  const HomePage({
    this.initialTabIndex = 0,
    this.initialHomeTab = 0,
    super.key,
  });

  final int initialTabIndex;
  final int initialHomeTab;

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class _HomePageState extends ConsumerState<HomePage> {
  late int _selectedIndex; // 底部 tab: 0=Home, 1=MyLand, 2=Profile
  int _selectedTab = 0; // Home 内部 tab: 0=Collection, 1=Map
  bool _isMapFullscreen = false;
  bool _showSearchMenu = false;
  List<Map<String, dynamic>> _recommendations = [];
  bool _isLoadingRecommendations = true; // 初始为 true，首次加载时显示加载态
  String? _recommendationsError; // 添加错误信息
  int _mapResetKey = 0;

  final GlobalKey _searchBoxKey = GlobalKey();

  // 搜索相关状态
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  final bool _isSearching = false;

  // ignore: unused_element
  bool _asBool(dynamic value) {
    if (value is bool) return value;
    if (value is num) return value != 0;
    if (value is String) return value == 'true' || value == '1';
    return false;
  }

  /// 从标签对象或字符串中提取标签名称
  /// 标签可能是字符串或对象 {en: "xxx", zh: "xxx", kind: "facet", ...}
  String _extractTagName(dynamic tag) {
    if (tag == null) return '';
    if (tag is String) return tag.trim();
    if (tag is Map) {
      // 优先使用 en 字段
      final en = tag['en'];
      if (en != null && en is String && en.trim().isNotEmpty) {
        return en.trim();
      }
      // 回退到 zh 字段
      final zh = tag['zh'];
      if (zh != null && zh is String && zh.trim().isNotEmpty) {
        return zh.trim();
      }
      // 尝试 id 字段
      final id = tag['id'];
      if (id != null && id is String && id.trim().isNotEmpty) {
        return id.trim();
      }
    }
    return '';
  }

  @override
  void initState() {
    super.initState();
    _selectedIndex = widget.initialTabIndex;
    _selectedTab = widget.initialHomeTab;

    // 延迟加载推荐数据，让页面先显示，提升感知性能
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadRecommendations();
    });

    // 使用 addPostFrameCallback 延迟预加载，避免在 widget 构建期间修改 provider
    // 进一步延迟预加载，避免阻塞初始渲染
    Future.delayed(const Duration(milliseconds: 300), () {
      if (mounted) {
        ref.read(placesCacheProvider.notifier).preloadPlaces();
        ref.read(collectionsCacheProvider.notifier).preloadCollections();
        ref.read(countriesCitiesProvider.notifier).preload();
        // 预加载城市选择器数据（带统计信息），避免打开时加载慢
        ref.read(countriesCitiesStatsProvider.notifier).load();
        // 预加载用户目的地列表，确保城市选择器秒级可用
        final authState = ref.read(authProvider);
        if (authState.isAuthenticated) {
          unawaited(
            ref
                .read(tripRepositoryProvider)
                .getMyTrips()
                .timeout(const Duration(seconds: 3), onTimeout: () => []),
          );
        }
        // 预加载用户收藏和 check-in 状态，确保进入 map 页面时状态已经准备好
        _preloadWishlistStatus();
      }
    });

    // 监听搜索框变化
    _searchController.addListener(() {
      setState(() {});
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    _searchFocusNode.dispose();
    super.dispose();
  }

  Future<void> _loadRecommendations() async {
    if (!mounted) return;
    setState(() {
      _isLoadingRecommendations = true;
      _recommendationsError = null;
    });
    try {
      // 使用缓存 provider
      final cacheNotifier = ref.read(recommendationsCacheProvider.notifier);
      final data = await cacheNotifier.loadRecommendations();
      print('✅ Loaded ${data.length} recommendations');
      if (mounted) {
        setState(() => _recommendations = data);
      }
    } catch (e, stackTrace) {
      print('❌ Error loading recommendations: $e');
      print('📋 Stack trace: $stackTrace');
      if (mounted) {
        setState(() {
          _recommendations = [];
          _recommendationsError = e.toString();
        });
      }
    } finally {
      if (mounted) {
        setState(() => _isLoadingRecommendations = false);
      }
    }
  }

  Future<void> _refreshRecommendationsSilently() async {
    try {
      final cacheNotifier = ref.read(recommendationsCacheProvider.notifier);
      final data = await cacheNotifier.loadRecommendations(forceRefresh: true);
      if (mounted) {
        setState(() {
          _recommendations = data;
          _recommendationsError = null;
        });
      }
    } catch (e) {
      print('❌ Error refreshing recommendations: $e');
      if (mounted) {
        setState(() {
          _recommendationsError = e.toString();
        });
      }
    }
  }

  Future<void> _handlePullToRefresh() async {
    await Future.wait([
      _refreshRecommendationsSilently(),
      ref.read(placesCacheProvider.notifier).refresh(),
    ]);
  }

  /// 预加载用户收藏和 check-in 状态，填充 WishlistStatusCache
  /// 这样进入 map 页面时状态就已经准备好，避免空白状态闪烁
  Future<void> _preloadWishlistStatus() async {
    final authState = ref.read(authProvider);
    if (!authState.isAuthenticated) return;

    try {
      print('🔄 [HomePage] 预加载用户收藏和 check-in 状态...');
      // 触发 wishlistStatusProvider 加载，它会自动填充 WishlistStatusCache
      await ref.read(wishlistStatusProvider.future);
      print('✅ [HomePage] 用户状态预加载完成');
    } catch (e) {
      print('⚠️ [HomePage] 预加载用户状态失败: $e');
      // 静默失败，不影响用户体验
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
    print('📍 Filter button tapped! _showSearchMenu: $_showSearchMenu');
    // 收起键盘
    _searchFocusNode.unfocus();
    setState(() {
      _showSearchMenu = !_showSearchMenu;
    });
  }

  /// 执行搜索 - 全局搜索地点
  Future<void> _performSearch() async {
    final query = _searchController.text.trim();
    if (query.isEmpty) return;

    // 收起键盘
    _searchFocusNode.unfocus();

    print('🔍 [HomePage] 搜索: "$query"');

    // 导航到搜索结果页面，让它处理搜索逻辑
    if (mounted) {
      await Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (context) => SearchResultsMapPage(
            city: '', // 全局搜索不限制城市
            country: '',
            selectedTags: const [],
            categoryFilters: const [],
            tagFilters: const [],
            searchQuery: query, // 传递搜索关键词
          ),
        ),
      );
      // 返回后清空搜索框，让用户从头开始搜索
      if (mounted) {
        _searchController.clear();
      }
    }
  }

  /// 清除搜索
  void _clearSearch() {
    _searchController.clear();
    setState(() {});
  }

  /// 构建搜索框
  Widget _buildSearchBox() {
    const double height = 48.0;
    const double radius = 24.0;

    return Container(
      key: _searchBoxKey,
      height: height,
      decoration: BoxDecoration(
        color: AppTheme.white,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(
          color: AppTheme.black,
          width: AppTheme.borderMedium,
        ),
        boxShadow: AppTheme.searchBoxShadow,
      ),
      child: Row(
        children: [
          // 左侧图标
          const Padding(
            padding: EdgeInsets.only(left: 16),
            child: Text('🌏', style: TextStyle(fontSize: 18)),
          ),
          const SizedBox(width: 8),
          // 搜索输入框
          Expanded(
            child: TextField(
              controller: _searchController,
              focusNode: _searchFocusNode,
              style: AppTheme.bodyMedium(context),
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _performSearch(),
              decoration: InputDecoration(
                hintText: 'Find city and spot here',
                hintStyle: AppTheme.bodySmall(context).copyWith(
                  color: AppTheme.mediumGray,
                ),
                border: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(vertical: 14),
                isDense: true,
              ),
            ),
          ),
          // 清除按钮（当有输入内容时显示）
          if (_searchController.text.isNotEmpty)
            GestureDetector(
              onTap: _clearSearch,
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 8),
                child: Icon(
                  Icons.close,
                  size: 18,
                  color: AppTheme.mediumGray,
                ),
              ),
            ),
          // 搜索加载指示器
          if (_isSearching)
            const Padding(
              padding: EdgeInsets.only(right: 8),
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation<Color>(AppTheme.black),
                ),
              ),
            ),
          // 筛选按钮
          GestureDetector(
            onTap: _toggleSearchMenu,
            child: Container(
              margin: const EdgeInsets.only(right: 4),
              padding: const EdgeInsets.all(10),
              decoration: const BoxDecoration(
                color: AppTheme.primaryYellow,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.tune,
                color: AppTheme.black,
                size: 18,
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: AppTheme.background,
        resizeToAvoidBottomInset: false,
        body: Stack(
          children: [
            // 根据底部 tab 显示不同内容
            if (_selectedIndex == 2)
              // Mine 页面 - 需要给底部导航留空间
              const Positioned.fill(
                bottom: 70, // 底部导航栏高度
                child: MinePage(),
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
                        child: _buildSearchBox(),
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
                      const SizedBox(
                        height: 12,
                      ), // collection 切换底部距离合集推荐标题 12px
                    ],
                    Expanded(
                      child: IndexedStack(
                        index: _selectedTab,
                        children: [
                          // Tab 0: Collection
                          LayoutBuilder(
                            builder: (context, constraints) {
                              Widget collectionChild;

                              if (_isLoadingRecommendations) {
                                collectionChild = SingleChildScrollView(
                                  physics:
                                      const AlwaysScrollableScrollPhysics(),
                                  child: SizedBox(
                                    height: constraints.maxHeight,
                                    child: const Center(
                                      child: CircularProgressIndicator(),
                                    ),
                                  ),
                                );
                              } else if (_recommendationsError != null) {
                                collectionChild = SingleChildScrollView(
                                  physics:
                                      const AlwaysScrollableScrollPhysics(),
                                  child: SizedBox(
                                    height: constraints.maxHeight,
                                    child: Center(
                                      child: Padding(
                                        padding: const EdgeInsets.all(32.0),
                                        child: Column(
                                          mainAxisAlignment:
                                              MainAxisAlignment.center,
                                          children: [
                                            const Icon(
                                              Icons.cloud_off_outlined,
                                              size: 64,
                                              color: AppTheme.mediumGray,
                                            ),
                                            const SizedBox(height: 16),
                                            Text(
                                              'Failed to load recommendations',
                                              style:
                                                  AppTheme.bodyLarge(context),
                                              textAlign: TextAlign.center,
                                            ),
                                            const SizedBox(height: 8),
                                            Text(
                                              'Please check your connection and try again',
                                              style: AppTheme.bodySmall(context)
                                                  .copyWith(
                                                color: AppTheme.textSecondary,
                                              ),
                                              textAlign: TextAlign.center,
                                            ),
                                            const SizedBox(height: 24),
                                            PrimaryButton(
                                              text: 'Retry',
                                              onPressed: _loadRecommendations,
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ),
                                );
                              } else if (_recommendations.isEmpty) {
                                collectionChild = SingleChildScrollView(
                                  physics:
                                      const AlwaysScrollableScrollPhysics(),
                                  child: SizedBox(
                                    height: constraints.maxHeight,
                                    child: const Center(
                                      child:
                                          Text('No recommendations available'),
                                    ),
                                  ),
                                );
                              } else {
                                collectionChild = ListView.builder(
                                  padding: const EdgeInsets.only(
                                    bottom: 80,
                                  ), // 底部 padding（底部导航栏高度约82px + 安全区域）
                                  cacheExtent: 500, // 优化性能：减少预加载范围
                                  physics:
                                      const AlwaysScrollableScrollPhysics(),
                                  itemCount: _recommendations.length,
                                  itemBuilder: (context, recommendationIndex) {
                                    final recommendation =
                                        _recommendations[recommendationIndex];
                                    final items = recommendation['items']
                                            as List<dynamic>? ??
                                        [];
                                    final recommendationName =
                                        recommendation['name'] as String? ?? '';
                                    final hasMore = items.length > 5;
                                    final displayItems = items.take(5).toList();

                                    return Padding(
                                      padding: EdgeInsets.only(
                                        bottom: recommendationIndex <
                                                _recommendations.length - 1
                                            ? 20
                                            : 20, // 合集推荐之间间距 20px，最后一个合集底部也留 20px
                                      ),
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          // 推荐标题行 - 不要黄色竖杠
                                          Padding(
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 16,
                                            ),
                                            child: Row(
                                              children: [
                                                // 推荐名称 - 直接展示
                                                Expanded(
                                                  child: Text(
                                                    recommendationName,
                                                    style:
                                                        AppTheme.headlineLarge(
                                                      context,
                                                    ).copyWith(
                                                      fontSize: 18,
                                                    ),
                                                  ),
                                                ),
                                                // More 按钮（超过5个时显示）
                                                if (hasMore)
                                                  GestureDetector(
                                                    onTap: () {
                                                      final recommendationId =
                                                          recommendation['id']
                                                              as String?;
                                                      if (recommendationId !=
                                                          null) {
                                                        context.push(
                                                          '/recommendation/$recommendationId?name=${Uri.encodeComponent(recommendationName)}',
                                                        );
                                                      }
                                                    },
                                                    child: Text(
                                                      'more >',
                                                      style:
                                                          AppTheme.labelMedium(
                                                        context,
                                                      ).copyWith(
                                                        fontWeight:
                                                            FontWeight.w400,
                                                        color: AppTheme
                                                            .textSecondary,
                                                      ),
                                                    ),
                                                  ),
                                              ],
                                            ),
                                          ),
                                          const SizedBox(
                                            height: 8,
                                          ), // 合集标题距离合集卡片 8px
                                          // 横向滚动的合集列表 - 高度 = 卡片高度 224 + 底部间距 8
                                          SizedBox(
                                            height:
                                                232, // 卡片高度 224px + 底部间距 8px
                                            child: ListView.builder(
                                              scrollDirection: Axis.horizontal,
                                              clipBehavior: Clip.none,
                                              cacheExtent:
                                                  200, // 优化性能：减少横向预加载范围
                                              padding: const EdgeInsets.only(
                                                left: 16,
                                                right: 16,
                                              ),
                                              itemCount: displayItems.length,
                                              itemBuilder:
                                                  (context, itemIndex) {
                                                final item =
                                                    displayItems[itemIndex];
                                                final collection =
                                                    item['collection'] as Map<
                                                            String, dynamic>? ??
                                                        {};
                                                final collectionId =
                                                    collection['id'] as String?;
                                                final collectionName =
                                                    collection['name']
                                                            as String? ??
                                                        'Collection';

                                                // 调试：查看数据结构
                                                print('🔍 合集: $collectionName');
                                                print(
                                                  '🔍 item结构: ${item.keys}',
                                                );
                                                print(
                                                  '🔍 collection.spotCount: ${collection['spotCount']}',
                                                );

                                                // 获取合集的地点信息
                                                final collectionSpots =
                                                    collection['collectionSpots']
                                                            as List<dynamic>? ??
                                                        [];

                                                // 使用 API 返回的 spotCount，如果没有则使用 collectionSpots 数组长度
                                                final count =
                                                    collection['spotCount']
                                                            as int? ??
                                                        collectionSpots.length;
                                                print('🔍 最终count: $count');

                                                // 优先使用 API 返回的主要城市
                                                String city =
                                                    collection['mainCity']
                                                            as String? ??
                                                        'Multi-city';

                                                // 如果 API 没有返回主要城市，尝试从合集名称中提取
                                                if (city == 'Multi-city' ||
                                                    city.isEmpty) {
                                                  // 尝试从合集名称中提取城市
                                                  final namePatterns = {
                                                    'Copenhagen': [
                                                      'Copenhagen',
                                                    ],
                                                    'Tokyo': [
                                                      'Tokyo',
                                                      'Japan',
                                                      '🇯🇵',
                                                    ],
                                                    'Paris': ['Paris', '🇫🇷'],
                                                    'London': [
                                                      'London',
                                                      '🇬🇧',
                                                    ],
                                                    'New York': [
                                                      'New York',
                                                      'NYC',
                                                    ],
                                                    'Seoul': [
                                                      'Seoul',
                                                      '🇰🇷',
                                                      'Korea',
                                                    ],
                                                  };

                                                  for (final entry
                                                      in namePatterns.entries) {
                                                    for (final pattern
                                                        in entry.value) {
                                                      if (collectionName
                                                          .contains(pattern)) {
                                                        city = entry.key;
                                                        break;
                                                      }
                                                    }
                                                    if (city != 'Multi-city') {
                                                      break;
                                                    }
                                                  }
                                                }

                                                // 从所有地点中收集标签，优先使用 tags，如果没有则使用 aiTags
                                                final List<dynamic> tagsList =
                                                    [];
                                                for (final spot
                                                    in collectionSpots) {
                                                  final place = spot['place']
                                                      as Map<String, dynamic>?;
                                                  if (place == null) continue;

                                                  // 尝试获取 tags
                                                  final dynamic tagsValue =
                                                      place['tags'];
                                                  if (tagsValue != null) {
                                                    if (tagsValue is List) {
                                                      tagsList
                                                          .addAll(tagsValue);
                                                    } else if (tagsValue
                                                        is String) {
                                                      try {
                                                        final decoded =
                                                            jsonDecode(
                                                          tagsValue,
                                                        ) as List<dynamic>?;
                                                        if (decoded != null) {
                                                          tagsList
                                                              .addAll(decoded);
                                                        }
                                                      } catch (e) {
                                                        // 忽略解析错误
                                                      }
                                                    }
                                                  }

                                                  // 如果还没有标签，尝试使用 aiTags
                                                  if (tagsList.isEmpty) {
                                                    final dynamic aiTagsValue =
                                                        place['aiTags'];
                                                    if (aiTagsValue != null) {
                                                      if (aiTagsValue is List) {
                                                        tagsList.addAll(
                                                          aiTagsValue,
                                                        );
                                                      } else if (aiTagsValue
                                                          is String) {
                                                        try {
                                                          final decoded =
                                                              jsonDecode(
                                                            aiTagsValue,
                                                          ) as List<dynamic>?;
                                                          if (decoded != null) {
                                                            tagsList.addAll(
                                                              decoded,
                                                            );
                                                          }
                                                        } catch (e) {
                                                          // 忽略解析错误
                                                        }
                                                      }
                                                    }
                                                  }

                                                  // 如果已经收集到足够的标签，可以提前退出
                                                  if (tagsList.length >= 3) {
                                                    break;
                                                  }
                                                }

                                                // 去重并取前3个
                                                final uniqueTags =
                                                    tagsList.toSet().toList();
                                                final tags = uniqueTags
                                                    .take(3)
                                                    .map((e) {
                                                      // 从标签对象或字符串中提取名称
                                                      final tagName =
                                                          _extractTagName(e);
                                                      return tagName.isNotEmpty
                                                          ? '#$tagName'
                                                          : '';
                                                    })
                                                    .where((t) => t.isNotEmpty)
                                                    .toList();

                                                // 辅助函数：检查 URL 是否是有效的图片 URL
                                                bool isValidImageUrl(
                                                  String? url,
                                                ) {
                                                  if (url == null ||
                                                      url.isEmpty) {
                                                    return false;
                                                  }
                                                  if (url.contains(
                                                      'example.com')) {
                                                    return false;
                                                  }
                                                  if (url.contains(
                                                      'placeholder')) {
                                                    return false;
                                                  }
                                                  return true;
                                                }

                                                // 获取封面图：优先使用 collection 的 coverImage，否则遍历所有地点找第一个有效图片
                                                String coverImage = '';
                                                final collectionCoverImage =
                                                    collection['coverImage']
                                                        as String?;
                                                if (isValidImageUrl(
                                                  collectionCoverImage,
                                                )) {
                                                  coverImage =
                                                      collectionCoverImage!;
                                                } else {
                                                  // 遍历所有地点找第一个有效的封面图
                                                  for (final spot
                                                      in collectionSpots) {
                                                    final place = spot['place']
                                                        as Map<String,
                                                            dynamic>?;
                                                    if (place == null) continue;
                                                    final placeCoverImage =
                                                        place['coverImage']
                                                            as String?;
                                                    if (isValidImageUrl(
                                                      placeCoverImage,
                                                    )) {
                                                      coverImage =
                                                          placeCoverImage!;
                                                      break;
                                                    }
                                                  }
                                                }
                                                // 如果还是没有图片，使用占位图
                                                if (coverImage.isEmpty) {
                                                  coverImage =
                                                      'https://via.placeholder.com/400x600';
                                                }

                                                return Padding(
                                                  padding: EdgeInsets.only(
                                                    right: itemIndex <
                                                            displayItems
                                                                    .length -
                                                                1
                                                        ? 12
                                                        : 0,
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
                                                        final result =
                                                            await Navigator.of(
                                                          context,
                                                        ).push<dynamic>(
                                                          MaterialPageRoute<
                                                              dynamic>(
                                                            builder: (context) =>
                                                                CollectionSpotsMapPage(
                                                              city: city,
                                                              collectionTitle:
                                                                  collectionName,
                                                              collectionId:
                                                                  collectionId,
                                                              initialIsFavorited:
                                                                  false,
                                                              description:
                                                                  collection[
                                                                          'description']
                                                                      as String?,
                                                              coverImage: collection[
                                                                      'coverImage']
                                                                  as String?,
                                                              people: LinkItem
                                                                  .parseList(
                                                                collection[
                                                                    'people'],
                                                                isPeople: true,
                                                              ),
                                                              works: LinkItem
                                                                  .parseList(
                                                                collection[
                                                                    'works'],
                                                                isPeople: false,
                                                              ),
                                                            ),
                                                          ),
                                                        );

                                                        if (result != null &&
                                                            mounted) {
                                                          if ((result is Map &&
                                                                  result['shouldRefresh'] ==
                                                                      true) ||
                                                              (result is bool &&
                                                                  result)) {
                                                            // 后台静默刷新缓存，不影响当前页面显示
                                                            // 使用 unawaited 让刷新在后台进行
                                                            ref
                                                                .read(
                                                                  collectionsCacheProvider
                                                                      .notifier,
                                                                )
                                                                .refresh();
                                                            // recommendations 使用现有缓存显示，不重新加载
                                                            // 缓存会在下次打开页面时自动刷新（如果过期）
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
                                );
                              }

                              return RefreshIndicator(
                                onRefresh: _handlePullToRefresh,
                                child: collectionChild,
                              );
                            },
                          ),
                          // Tab 1: Map - 添加底部 padding 为底部导航栏留空间
                          LayoutBuilder(
                            builder: (context, constraints) => RefreshIndicator(
                              onRefresh: _handlePullToRefresh,
                              child: SingleChildScrollView(
                                physics: const AlwaysScrollableScrollPhysics(),
                                child: SizedBox(
                                  height: constraints.maxHeight,
                                  child: Padding(
                                    padding: const EdgeInsets.only(bottom: 38),
                                    child: MapPage(
                                      key: const ValueKey('map-page-default'),
                                      resetSelectionKey: _mapResetKey,
                                      onFullscreenChanged:
                                          _handleMapFullscreenChanged,
                                    ),
                                  ),
                                ),
                              ),
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
  Widget build(BuildContext context, WidgetRef ref) => Container(
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
                    'Your own personalized flâneur story',
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
  Widget build(BuildContext context) => GestureDetector(
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
  Color _dominantColor = AppTheme.lightGray; // 默认使用浅灰色而不是黑色

  // ignore: unused_field
  bool _colorExtracted = false;
  bool _imageLoaded = false; // 图片是否成功加载

  @override
  void initState() {
    super.initState();
    // 延迟提取主色调，避免阻塞初始渲染
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _extractDominantColor();
    });
  }

  @override
  void didUpdateWidget(_TripCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.imageUrl != widget.imageUrl) {
      setState(() {
        _imageLoaded = false;
        _colorExtracted = false;
      });
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
          // 使用 ColorUtils 获取较深的主色，排除白色和浅色
          _dominantColor = ColorUtils.getDarkDominantColor(
            paletteGenerator,
            fallback: AppTheme.mediumGray,
          );
          _colorExtracted = true;
          _imageLoaded = true;
        });
      }
    } catch (e) {
      // 取色失败时使用默认灰色
      if (mounted) {
        setState(() {
          _dominantColor = AppTheme.mediumGray;
          _colorExtracted = true;
          _imageLoaded = false;
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
                // 底层占位符 - 始终显示
                const VagoPlaceholderSmall(),
                // 背景图片 - 支持 DataURL (base64) 和网络图片
                if (widget.imageUrl.isNotEmpty &&
                    !widget.imageUrl.contains('placeholder'))
                  _buildCoverImage(),

                // 底部渐变蒙层 - 只在图片加载成功后显示
                // 渐变覆盖卡片约60%高度（从底部文字区域延伸到封面图一半）
                if (_imageLoaded)
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 0,
                    child: Container(
                      height: 140, // 卡片高度 224 的约 60%
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Colors.transparent,
                            _dominantColor.withOpacity(0.15),
                            _dominantColor.withOpacity(0.4),
                            _dominantColor.withOpacity(0.7),
                            _dominantColor.withOpacity(0.9),
                          ],
                          stops: const [0.0, 0.2, 0.45, 0.7, 1.0],
                        ),
                      ),
                    ),
                  ),

                // 内容层 - 顶部标签（只在图片加载成功后显示）
                if (_imageLoaded)
                  Positioned(
                    left: 12,
                    right: 12,
                    top: 12,
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        final textStyle = AppTheme.labelSmall(context).copyWith(
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                        );

                        // 计算城市名称需要的宽度
                        final cityTextPainter = TextPainter(
                          text: TextSpan(text: widget.city, style: textStyle),
                          maxLines: 1,
                          textDirection: TextDirection.ltr,
                        )..layout();

                        // 计算地点数量需要的宽度
                        final countTextPainter = TextPainter(
                          text: TextSpan(
                            text: widget.count.toString(),
                            style: textStyle,
                          ),
                          maxLines: 1,
                          textDirection: TextDirection.ltr,
                        )..layout();

                        final cityTagWidth =
                            cityTextPainter.width + 24; // padding 12*2
                        final countTagWidth = countTextPainter.width +
                            20 +
                            12; // padding 10*2 + icon 10 + spacing 2
                        const spacing = 8.0;
                        final totalNeeded =
                            cityTagWidth + countTagWidth + spacing;

                        // 如果空间不够，隐藏地点数量；如果还不够，城市名用省略号
                        final showCount = totalNeeded <= constraints.maxWidth;

                        return Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            if (showCount) ...[
                              // 地点数量 - Neo Brutalism 风格，64%白色背景
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 6,
                                ),
                                decoration: BoxDecoration(
                                  color: AppTheme.white.withOpacity(0.64),
                                  borderRadius: BorderRadius.circular(20),
                                  border: Border.all(
                                    color: AppTheme.black,
                                    width: 1,
                                  ),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      widget.count.toString(),
                                      style:
                                          AppTheme.labelSmall(context).copyWith(
                                        fontSize: 10,
                                        color: AppTheme.black,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    const SizedBox(width: 2),
                                    const Icon(
                                      Icons.location_on,
                                      size: 10,
                                      color: AppTheme.black,
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 8),
                            ],
                            // 城市名称 - Neo Brutalism 风格
                            Flexible(
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 6,
                                ),
                                decoration: BoxDecoration(
                                  color: AppTheme.white,
                                  borderRadius: BorderRadius.circular(20),
                                  border: Border.all(
                                    color: AppTheme.black,
                                    width: 1,
                                  ),
                                  boxShadow: const [
                                    BoxShadow(
                                      color: AppTheme.black,
                                      offset: Offset(1, 1),
                                    ),
                                  ],
                                ),
                                child: Text(
                                  widget.city,
                                  style: AppTheme.labelSmall(context).copyWith(
                                    fontSize: 10,
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
                  ),

                // 底部标题和标签层 - 固定在底部（只在图片加载成功后显示）
                if (_imageLoaded)
                  Positioned(
                    left: 12,
                    right: 12,
                    bottom: 12,
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
                        // 不再显示标签 - 用户要求合集卡片不显示任何标签
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

  /// 构建封面图片，处理加载状态
  /// 图片完全填充卡片区域
  Widget _buildCoverImage() => _buildImageContent();

  /// 构建图片内容（支持 base64 和网络图片）
  Widget _buildImageContent() {
    if (widget.imageUrl.startsWith('data:image/')) {
      final bytes = _decodeBase64Image(widget.imageUrl);
      if (bytes.isEmpty) return const SizedBox.shrink();
      // base64 图片是同步加载的，立即设置加载状态
      if (!_imageLoaded && mounted) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            setState(() => _imageLoaded = true);
          }
        });
      }
      return Image.memory(
        bytes,
        fit: BoxFit.cover, // 自动裁剪中间部分以适应 4:3 比例
        gaplessPlayback: true,
        filterQuality: FilterQuality.low,
        errorBuilder: (_, __, ___) {
          if (mounted) {
            setState(() => _imageLoaded = false);
          }
          return const SizedBox.shrink();
        },
      );
    }

    return _NetworkImageWithPlaceholder(
      imageUrl: widget.imageUrl,
      onLoaded: () {
        if (mounted && !_imageLoaded) {
          setState(() => _imageLoaded = true);
        }
      },
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

/// 网络图片组件，使用缓存避免重复加载
class _NetworkImageWithPlaceholder extends StatelessWidget {
  const _NetworkImageWithPlaceholder({
    required this.imageUrl,
    this.onLoaded,
  });

  final String imageUrl;
  final VoidCallback? onLoaded;

  @override
  Widget build(BuildContext context) {
    // 使用优化后的图片 URL（400x300，质量80）
    final optimizedUrl = ImageService.getListImageUrl(imageUrl);

    return CachedNetworkImage(
      imageUrl: optimizedUrl,
      fit: BoxFit.cover,
      fadeInDuration: const Duration(milliseconds: 200),
      placeholder: (context, url) => const VagoPlaceholderSmall(),
      errorWidget: (context, url, error) {
        // 优化 URL 失败时尝试原始 URL
        if (url == optimizedUrl && url != imageUrl) {
          return CachedNetworkImage(
            imageUrl: imageUrl,
            fit: BoxFit.cover,
            fadeInDuration: const Duration(milliseconds: 200),
            placeholder: (context, url) => const VagoPlaceholderSmall(),
            errorWidget: (context, url, error) => const VagoPlaceholderSmall(),
          );
        }
        return const VagoPlaceholderSmall();
      },
      imageBuilder: (context, imageProvider) {
        // 图片加载成功后调用回调
        WidgetsBinding.instance.addPostFrameCallback((_) {
          onLoaded?.call();
        });
        return Image(
          image: imageProvider,
          fit: BoxFit.cover,
          gaplessPlayback: true,
        );
      },
    );
  }
}
