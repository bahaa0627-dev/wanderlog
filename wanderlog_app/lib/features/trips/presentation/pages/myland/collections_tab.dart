import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:palette_generator/palette_generator.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:go_router/go_router.dart';
import 'package:wanderlog/features/collections/providers/collection_providers.dart';
import 'package:wanderlog/features/collections/providers/collections_cache_provider.dart';
import 'package:wanderlog/features/map/presentation/pages/collection_spots_map_page.dart';
import 'package:wanderlog/shared/models/spot_model.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';

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
    _loadCollections();
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
    setState(() => _isLoading = true);
    try {
      final repo = ref.read(collectionRepositoryProvider);
      // Myland 只显示当前用户收藏的合集（默认 includeAll=false）
      print('📡 Loading collections for myland...');
      final data = await repo.listCollections();
      print('📦 Loaded ${data.length} collections');
      if (mounted) {
        setState(() {
          _allCollections
            ..clear()
            ..addAll(data);
          _filterCollections();
        });
        print('✅ Filtered to ${_filteredCollections.length} collections');
      }
    } catch (e, stackTrace) {
      print('❌ Error loading collections: $e');
      print('📋 Stack trace: $stackTrace');
      if (mounted) {
        setState(() {
          _allCollections.clear();
          _filteredCollections = [];
        });
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
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
    print('🔍 Filtered collections: ${_filteredCollections.length} out of ${_allCollections.length}');
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
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
        // 兼容 place 和 spot 两种字段名
        final firstSpot = spots.isNotEmpty
            ? (spots.first['spot'] as Map<String, dynamic>? ?? 
               spots.first['place'] as Map<String, dynamic>?)
            : null;
        final city = (firstSpot?['city'] as String?)?.isNotEmpty ?? false
            ? firstSpot!['city'] as String
            : 'Multi-city';
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
        final tags = uniqueTags
            .take(3)
            .map((e) => '#$e')
            .toList();
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
                  collectionTitle: collection['name'] as String? ?? 'Collection',
                  collectionId: collection['id'] as String?,
                  initialIsFavorited: collection['isFavorited'] as bool?,
                  description: collection['description'] as String?,
                  coverImage: collection['coverImage'] as String?,
                  people: LinkItem.parseList(collection['people'], isPeople: true),
                  works: LinkItem.parseList(collection['works'], isPeople: false),
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
                final allIndex = _allCollections.indexWhere((c) => c['id'] == collectionId);
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

  Widget _buildEmptyState() => Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.collections_bookmark_outlined,
            size: 80,
            color: Colors.grey.shade400,
          ),
          const SizedBox(height: 16),
          Text(
            'To find more collections',
            style: AppTheme.headlineMedium(context).copyWith(
              color: AppTheme.darkGray,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 12),
          PrimaryButton(
            text: 'To explore',
            onPressed: () => context.go('/home'),
          ),
        ],
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
  bool _colorExtracted = false;

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
              Colors.black;
          _colorExtracted = true;
        });
      }
    } catch (e) {
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
                if (widget.image.startsWith('data:image/')) Image.memory(
                        _decodeBase64Image(widget.image),
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
                        widget.image,
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
                  child: Row(
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
                              widget.spotsCount.toString(),
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
                          widget.city,
                          style: AppTheme.labelSmall(context).copyWith(
                            fontSize: 12,
                            color: AppTheme.black,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                // 底部标题和标签层 - 固定在底部
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
                                  style: AppTheme.labelSmall(context).copyWith(
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
