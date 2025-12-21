import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/collections/providers/collection_providers.dart';
import 'package:wanderlog/features/map/presentation/pages/collection_spots_map_page.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';

class RecommendationDetailPage extends ConsumerStatefulWidget {
  const RecommendationDetailPage({
    super.key,
    required this.recommendationId,
    required this.recommendationName,
  });

  final String recommendationId;
  final String recommendationName;

  @override
  ConsumerState<RecommendationDetailPage> createState() => _RecommendationDetailPageState();
}

class _RecommendationDetailPageState extends ConsumerState<RecommendationDetailPage> {
  Map<String, dynamic>? _recommendation;
  bool _isLoading = false;

  bool _asBool(dynamic value) {
    if (value is bool) return value;
    if (value is num) return value != 0;
    if (value is String) return value == 'true' || value == '1';
    return false;
  }

  @override
  void initState() {
    super.initState();
    _loadRecommendation();
  }

  Future<void> _loadRecommendation() async {
    setState(() => _isLoading = true);
    try {
      final repo = ref.read(collectionRepositoryProvider);
      final recommendation = await repo.getRecommendation(widget.recommendationId);
      setState(() => _recommendation = recommendation);
    } catch (_) {
      setState(() => _recommendation = null);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        backgroundColor: AppTheme.background,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppTheme.black),
          onPressed: () => context.pop(),
        ),
        title: Text(
          widget.recommendationName,
          style: AppTheme.headlineLarge(context),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _recommendation == null
              ? const Center(child: Text('Recommendation not found'))
              : _buildContent(),
    );
  }

  Widget _buildContent() {
    final items = _recommendation!['items'] as List<dynamic>? ?? [];
    
    if (items.isEmpty) {
      return const Center(child: Text('No collections in this recommendation'));
    }

    return GridView.builder(
      padding: const EdgeInsets.all(16),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        childAspectRatio: 3 / 4,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
      ),
      itemCount: items.length,
      itemBuilder: (context, index) {
        final item = items[index];
        final collection = item['collection'] as Map<String, dynamic>? ?? {};
        final collectionSpots = collection['collectionSpots'] as List<dynamic>? ?? [];
        final firstSpot = collectionSpots.isNotEmpty
            ? (collectionSpots.first['place'] as Map<String, dynamic>?)
            : null;
        
        final city = (firstSpot?['city'] as String?)?.isNotEmpty == true
            ? firstSpot!['city'] as String
            : 'Multi-city';
        
        // 从所有地点中收集标签，优先使用 tags，如果没有则使用 aiTags
        List<dynamic> tagsList = [];
        for (final spot in collectionSpots) {
          final place = spot['place'] as Map<String, dynamic>?;
          if (place == null) continue;
          
          // 尝试获取 tags
          dynamic tagsValue = place['tags'];
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
            dynamic aiTagsValue = place['aiTags'];
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
        
        return _TripCard(
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
                  collectionId: collection['id'] as String?,
                  initialIsFavorited: false,
                  description: collection['description'] as String?,
                  coverImage: collection['coverImage'] as String?,
                  people: [],
                  works: [],
                ),
              ),
            );

            if (result != null && mounted) {
              if ((result is Map && result['shouldRefresh'] == true) ||
                  (result is bool && result)) {
                _loadRecommendation();
              }
            }
          },
        );
      },
    );
  }
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
                // 背景图片
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

