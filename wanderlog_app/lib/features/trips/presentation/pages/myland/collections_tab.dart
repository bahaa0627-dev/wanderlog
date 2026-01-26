import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:palette_generator/palette_generator.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:go_router/go_router.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/collections/providers/collection_providers.dart';
import 'package:wanderlog/features/collections/providers/collections_cache_provider.dart';
import 'package:wanderlog/features/map/presentation/pages/collection_spots_map_page.dart';
import 'package:wanderlog/shared/widgets/vago_placeholder.dart';

/// Collections Tab - 显示用户收藏的合集
/// 这些合集与 trip 的城市相关
class CollectionsTab extends ConsumerStatefulWidget {
  const CollectionsTab({
    super.key,
    this.selectedCity,
  });

  /// 当前选中的城市，用于筛选合集
  final String? selectedCity;

  @override
  ConsumerState<CollectionsTab> createState() => _CollectionsTabState();
}

class _CollectionsTabState extends ConsumerState<CollectionsTab> {
  final List<Map<String, dynamic>> _allCollections = [];
  List<Map<String, dynamic>> _filteredCollections = [];
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    // 延迟加载，让页面先显示
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadCollections();
    });
  }

  @override
  void didUpdateWidget(covariant CollectionsTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.selectedCity != widget.selectedCity) {
      _filterCollections();
    }
  }

  Future<void> _loadCollections() async {
    if (!mounted) return;

    // Step 1: 立即从缓存加载并显示（即使缓存过期）
    final cacheState = ref.read(collectionsCacheProvider);
    if (cacheState.hasData) {
      final cachedCollections = cacheState.collectionsById.values.toList();
      print(
          '💾 [CollectionsTab] Showing ${cachedCollections.length} cached collections instantly');
      if (mounted) {
        setState(() {
          _allCollections
            ..clear()
            ..addAll(cachedCollections);
          _filterCollections();
          _isLoading = false; // 立即显示缓存数据，不显示 loading
        });
      }

      // 如果缓存还新鲜（1小时内），就不需要刷新了
      if (!cacheState.isStale) {
        print('✅ [CollectionsTab] Cache is fresh, no need to refresh');
        return;
      }
    } else {
      // 没有缓存，显示 loading
      setState(() => _isLoading = true);
    }

    // Step 2: 后台静默刷新数据
    try {
      final repo = ref.read(collectionRepositoryProvider);
      print('📡 [CollectionsTab] Background refresh collections...');
      final loadStart = DateTime.now();

      // 减少超时时间到 15 秒，提高响应速度
      final data = await repo.listCollections().timeout(
        const Duration(seconds: 15),
        onTimeout: () {
          print('⏱️ [CollectionsTab] Request timed out after 15 seconds');
          throw TimeoutException(
              'Request timed out. Please check your connection.');
        },
      );

      final loadTime = DateTime.now().difference(loadStart).inMilliseconds;
      print(
          '📦 [CollectionsTab] Background loaded ${data.length} collections in ${loadTime}ms');

      if (mounted) {
        setState(() {
          _allCollections
            ..clear()
            ..addAll(data);
          _filterCollections();
          _isLoading = false;
        });
        print(
            '✅ [CollectionsTab] Updated to ${_filteredCollections.length} collections');
      }

      // 更新缓存
      ref.read(collectionsCacheProvider.notifier).updateCollectionsList(data);
    } catch (e, stackTrace) {
      print('❌ [CollectionsTab] Error loading collections: $e');
      print('📋 [CollectionsTab] Stack trace: $stackTrace');

      // 如果有缓存数据，就继续使用缓存，不显示错误
      if (_allCollections.isNotEmpty) {
        print('ℹ️ [CollectionsTab] Using cached data despite error');
        if (mounted) setState(() => _isLoading = false);
        return;
      }

      // 没有缓存数据时才显示错误
      if (mounted) {
        setState(() {
          _allCollections.clear();
          _filteredCollections = [];
          _isLoading = false;
        });
        // 显示错误toast
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to load collections: ${e.toString()}'),
            action: SnackBarAction(
              label: 'Retry',
              onPressed: _loadCollections,
            ),
          ),
        );
      }
    }
  }

  /// 根据选中的城市筛选合集
  void _filterCollections() {
    final city = widget.selectedCity?.toLowerCase().trim();
    final isAll =
        city == null || city.isEmpty || city == 'all' || city == '__all__';
    if (isAll) {
      // 没有选择城市时显示所有收藏的合集
      _filteredCollections = List.from(_allCollections);
    } else {
      // 筛选包含当前城市地点的合集
      _filteredCollections = _allCollections.where((collection) {
        final spots = collection['collectionSpots'] as List<dynamic>? ?? [];
        // 检查合集中是否有任何地点属于当前城市
        return spots.any((cs) {
          // 兼容 place 和 spot 两种字段名
          final spot = cs['spot'] as Map<String, dynamic>? ??
              cs['place'] as Map<String, dynamic>?;
          final spotCity = (spot?['city'] as String?)?.toLowerCase().trim();
          return spotCity == city;
        });
      }).toList();
    }
    print(
        '🔍 Filtered collections: ${_filteredCollections.length} out of ${_allCollections.length}');
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    // Check authentication status
    final authState = ref.watch(authProvider);

    // If not authenticated, show login prompt
    if (!authState.isAuthenticated) {
      return _buildUnauthenticatedState(context);
    }

    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_filteredCollections.isEmpty) {
      return _buildEmptyState();
    }

    return GridView.builder(
      padding: const EdgeInsets.all(16),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 16,
        mainAxisSpacing: 16,
        childAspectRatio: 0.8, // 4:5 aspect ratio
      ),
      itemCount: _filteredCollections.length,
      itemBuilder: (context, index) {
        final collection = _filteredCollections[index];
        final spots = collection['collectionSpots'] as List<dynamic>? ?? [];
        // 使用 API 返回的 spotCount，如果没有则使用 collectionSpots 数组长度
        final count = collection['spotCount'] as int? ?? spots.length;

        // 智能计算城市名称：统计所有地点的城市，找出出现最多的城市
        String city = 'Multi-city';
        if (spots.isNotEmpty) {
          final Map<String, List<Map<String, dynamic>>> cityToPlaces = {};

          for (final spot in spots) {
            // 兼容 place 和 spot 两种字段名
            final place = spot['spot'] as Map<String, dynamic>? ??
                spot['place'] as Map<String, dynamic>?;
            final placeCity = place?['city'] as String?;

            if (placeCity != null && placeCity.isNotEmpty) {
              if (!cityToPlaces.containsKey(placeCity)) {
                cityToPlaces[placeCity] = [];
              }
              cityToPlaces[placeCity]!.add(place!);
            }
          }

          if (cityToPlaces.isNotEmpty) {
            // 找出出现次数最多的城市数量
            final maxCount = cityToPlaces.values
                .map((list) => list.length)
                .reduce((a, b) => a > b ? a : b);

            // 找出所有出现最多次数的城市
            final topCities = cityToPlaces.entries
                .where((entry) => entry.value.length == maxCount)
                .toList();

            if (topCities.length == 1) {
              // 只有一个城市出现最多次，直接使用
              city = topCities.first.key;
            } else {
              // 多个城市出现次数相同，选择评分人数最多的城市
              String selectedCity = topCities.first.key;
              int maxUserRatingsTotal = 0;

              for (final entry in topCities) {
                final places = entry.value;
                final totalUserRatingsTotal = places
                    .map((p) => (p['userRatingsTotal'] as int?) ?? 0)
                    .reduce((a, b) => a + b);

                if (totalUserRatingsTotal > maxUserRatingsTotal) {
                  maxUserRatingsTotal = totalUserRatingsTotal;
                  selectedCity = entry.key;
                }
              }

              city = selectedCity;
            }
          }
        }
        // 从所有地点中收集标签，优先使用 tags，如果没有则使用 aiTags
        final List<dynamic> tagsList = [];
        for (final spot in spots) {
          // 兼容 place 和 spot 两种字段名
          final spotData = spot['spot'] as Map<String, dynamic>? ??
              spot['place'] as Map<String, dynamic>?;
          if (spotData == null) continue;

          // 尝试获取 tags
          final dynamic tagsValue = spotData['tags'];
          final List<dynamic> currentSpotTags = [];
          if (tagsValue != null) {
            if (tagsValue is List) {
              currentSpotTags.addAll(tagsValue);
            } else if (tagsValue is String) {
              try {
                final decoded = jsonDecode(tagsValue) as List<dynamic>?;
                if (decoded != null) currentSpotTags.addAll(decoded);
              } catch (e) {
                // 忽略解析错误
              }
            }
          }

          // 如果这个 spot 没有 tags，尝试使用 aiTags
          if (currentSpotTags.isEmpty) {
            final dynamic aiTagsValue = spotData['aiTags'];
            if (aiTagsValue != null) {
              if (aiTagsValue is List) {
                currentSpotTags.addAll(aiTagsValue);
              } else if (aiTagsValue is String) {
                try {
                  final decoded = jsonDecode(aiTagsValue) as List<dynamic>?;
                  if (decoded != null) currentSpotTags.addAll(decoded);
                } catch (e) {
                  // 忽略解析错误
                }
              }
            }
          }

          // 添加到总列表
          tagsList.addAll(currentSpotTags);

          // 如果已经收集到足够的标签，可以提前退出
          if (tagsList.length >= 3) break;
        }

        // 去重并取前3个
        final uniqueTags = tagsList.toSet().toList();
        final tags = uniqueTags.take(3).map((e) => '#$e').toList();

        // 获取第一个地点用于封面图（如果合集没有设置封面图的话）
        final firstSpot = spots.isNotEmpty
            ? (spots.first['spot'] as Map<String, dynamic>? ??
                spots.first['place'] as Map<String, dynamic>?)
            : null;
        final cover = collection['coverImage'] as String? ??
            (firstSpot?['coverImage'] as String? ??
                'https://via.placeholder.com/400x600');

        return _CollectionCard(
          name: collection['name'] as String? ?? 'Collection',
          city: city,
          spotsCount: count,
          image: cover,
          tags: tags,
          onTap: () async {
            final result = await Navigator.of(context).push<dynamic>(
              MaterialPageRoute<dynamic>(
                builder: (_) => CollectionSpotsMapPage(
                  city: city,
                  collectionTitle:
                      collection['name'] as String? ?? 'Collection',
                  collectionId: collection['id'] as String?,
                  initialIsFavorited: collection['isFavorited'] as bool?,
                  description: collection['description'] as String?,
                  coverImage: collection['coverImage'] as String?,
                  people:
                      LinkItem.parseList(collection['people'], isPeople: true),
                  works:
                      LinkItem.parseList(collection['works'], isPeople: false),
                ),
              ),
            );
            bool needRefresh = false;
            bool? latestFav;
            if (result is Map) {
              needRefresh = result['shouldRefresh'] == true;
              latestFav = result['isFavorited'] as bool?;
            } else if (result is bool) {
              needRefresh = result;
            }

            if (latestFav != null && mounted) {
              setState(() {
                _filteredCollections[index]['isFavorited'] = latestFav;
                // 同步更新 _allCollections 中对应的记录
                final collectionId = _filteredCollections[index]['id'];
                final allIndex =
                    _allCollections.indexWhere((c) => c['id'] == collectionId);
                if (allIndex != -1) {
                  _allCollections[allIndex]['isFavorited'] = latestFav;
                }
              });
            }

            // 如果返回 true，表示需要刷新列表（取消或重新收藏了）
            if (needRefresh && mounted) {
              // 同时刷新缓存，确保下次进入详情页时获取最新数据
              ref.read(collectionsCacheProvider.notifier).refresh();
              _loadCollections();
            }
          },
        );
      },
    );
  }

  Widget _buildUnauthenticatedState(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 40),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Image.asset(
                'assets/images/no_data.png',
                fit: BoxFit.contain,
              ),
              const SizedBox(height: 24),
              Text(
                'To find more collections',
                style: AppTheme.bodyMedium(context).copyWith(
                  color: AppTheme.textSecondary,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              GestureDetector(
                onTap: () => context.go('/home'),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryYellow,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppTheme.black, width: 2.5),
                    boxShadow: const [
                      BoxShadow(
                        color: AppTheme.black,
                        offset: Offset(4, 4),
                        blurRadius: 0,
                      ),
                    ],
                  ),
                  child: Text(
                    'To explore',
                    style: AppTheme.labelLarge(context).copyWith(
                      fontWeight: FontWeight.bold,
                      color: AppTheme.black,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      );

  Widget _buildEmptyState() => Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 40),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Image.asset(
                'assets/images/no_data.png',
                fit: BoxFit.contain,
              ),
              const SizedBox(height: 24),
              Text(
                'To find more collections',
                style: AppTheme.bodyMedium(context).copyWith(
                  color: AppTheme.textSecondary,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              GestureDetector(
                onTap: () => context.go('/home'),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryYellow,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppTheme.black, width: 2.5),
                    boxShadow: const [
                      BoxShadow(
                        color: AppTheme.black,
                        offset: Offset(4, 4),
                        blurRadius: 0,
                      ),
                    ],
                  ),
                  child: Text(
                    'To explore',
                    style: AppTheme.labelLarge(context).copyWith(
                      fontWeight: FontWeight.bold,
                      color: AppTheme.black,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
}

/// 合集卡片组件
class _CollectionCard extends StatefulWidget {
  const _CollectionCard({
    required this.name,
    required this.city,
    required this.spotsCount,
    required this.image,
    required this.tags,
    required this.onTap,
  });

  final String name;
  final String city;
  final int spotsCount;
  final String image;
  final List<String> tags;
  final VoidCallback onTap;

  @override
  State<_CollectionCard> createState() => _CollectionCardState();
}

class _CollectionCardState extends State<_CollectionCard> {
  Color _dominantColor = Colors.black;
  bool _imageLoaded = false; // 图片是否成功加载

  // 解码 base64 图片
  static Uint8List _decodeBase64Image(String dataUrl) {
    try {
      final base64String = dataUrl.split(',').last;
      return base64Decode(base64String);
    } catch (e) {
      return Uint8List(0);
    }
  }

  @override
  void initState() {
    super.initState();
    _extractDominantColor();
  }

  @override
  void didUpdateWidget(_CollectionCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.image != widget.image) {
      setState(() {
        _imageLoaded = false;
      });
      _extractDominantColor();
    }
  }

  Future<void> _extractDominantColor() async {
    if (widget.image.isEmpty) return;

    try {
      final ImageProvider imageProvider;
      if (widget.image.startsWith('data:image/')) {
        imageProvider = MemoryImage(_decodeBase64Image(widget.image));
      } else {
        imageProvider = NetworkImage(widget.image);
      }

      final paletteGenerator = await PaletteGenerator.fromImageProvider(
        imageProvider,
        size: const Size(100, 100),
        maximumColorCount: 5,
      );

      if (mounted) {
        setState(() {
          _dominantColor = paletteGenerator.dominantColor?.color ??
              paletteGenerator.darkMutedColor?.color ??
              paletteGenerator.darkVibrantColor?.color ??
              Colors.grey;
          _imageLoaded = true; // 只有成功提取颜色才标记为加载成功
        });
      }
    } catch (e) {
      // 图片加载失败，保持 _imageLoaded = false，不显示渐变蒙层
      if (mounted) {
        setState(() {
          _imageLoaded = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    const double cardRadius = AppTheme.radiusLarge;
    // 使用稍小的内圆角确保完全覆盖边框内侧，避免缺口
    const double innerRadius = cardRadius - AppTheme.borderThick - 0.5;

    // 占位图组件 - 使用 VAGO 品牌占位符
    const placeholder = VagoPlaceholderSmall();

    return RepaintBoundary(
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          decoration: BoxDecoration(
            color: AppTheme.lightGray, // 使用浅灰色作为底色
            borderRadius: BorderRadius.circular(cardRadius),
            border: Border.all(
              color: AppTheme.black,
              width: AppTheme.borderThick,
            ),
            boxShadow: AppTheme.strongShadow,
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(innerRadius),
            clipBehavior: Clip.hardEdge,
            child: Stack(
              fit: StackFit.expand,
              children: [
                // 占位图层 - 始终显示在底层
                placeholder,
                // 背景图片 - 支持 DataURL (base64) 和网络图片
                if (widget.image.isNotEmpty)
                  if (widget.image.startsWith('data:image/'))
                    Image.memory(
                      _decodeBase64Image(widget.image),
                      fit: BoxFit.cover,
                      gaplessPlayback: true,
                      filterQuality: FilterQuality.low,
                      errorBuilder: (context, error, stackTrace) =>
                          const SizedBox.shrink(),
                    )
                  else
                    Image.network(
                      widget.image,
                      fit: BoxFit.cover,
                      gaplessPlayback: true,
                      filterQuality: FilterQuality.low,
                      loadingBuilder: (context, child, loadingProgress) {
                        if (loadingProgress == null) return child;
                        return const SizedBox.shrink(); // 加载中显示占位图
                      },
                      errorBuilder: (context, error, stackTrace) =>
                          const SizedBox.shrink(),
                    ),

                // 底部渐变蒙层 - 只在图片加载成功后显示
                if (_imageLoaded)
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
                            _dominantColor.withOpacity(0.3),
                            _dominantColor.withOpacity(0.6),
                            _dominantColor.withOpacity(0.85),
                          ],
                          stops: const [0.0, 0.3, 0.6, 1.0],
                        ),
                      ),
                    ),
                  ),

                // 顶部标签层 - 固定在顶部
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
                            text: widget.spotsCount.toString(),
                            style: textStyle),
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

                      // 如果空间不够，隐藏地点数量
                      final showSpots = totalNeeded <= constraints.maxWidth;

                      return Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          if (showSpots) ...[
                            // 地点数量
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
                                    widget.spotsCount.toString(),
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
                            const SizedBox(width: spacing),
                          ],
                          // 城市名称
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
                              widget.city,
                              style: AppTheme.labelSmall(context).copyWith(
                                fontSize: 10,
                                color: AppTheme.black,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                ),
                // 底部标题和标签层 - 只在图片加载成功后显示
                if (_imageLoaded)
                  Positioned(
                    left: 12,
                    right: 12,
                    bottom: 12,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          widget.name,
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
                        if (widget.tags.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: widget.tags
                                .take(2)
                                .map(
                                  (tag) => Text(
                                    tag,
                                    style:
                                        AppTheme.labelSmall(context).copyWith(
                                      fontSize: 12,
                                      color: AppTheme.white.withOpacity(0.9),
                                    ),
                                  ),
                                )
                                .toList(),
                          ),
                        ],
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
}
