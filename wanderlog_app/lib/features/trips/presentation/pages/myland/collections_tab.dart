import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/collections/providers/collection_providers.dart';
import 'package:wanderlog/features/map/presentation/pages/album_spots_map_page.dart';
import 'package:wanderlog/shared/models/spot_model.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';

/// Collections Tab - 显示用户收藏的合集
/// 这些合集与 trip 的城市相关
class CollectionsTab extends ConsumerStatefulWidget {
  const CollectionsTab({super.key});

  @override
  ConsumerState<CollectionsTab> createState() => _CollectionsTabState();
}

class _CollectionsTabState extends ConsumerState<CollectionsTab> {
  final List<Map<String, dynamic>> _collections = [];
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _loadCollections();
  }

  Future<void> _loadCollections() async {
    setState(() => _isLoading = true);
    try {
      final repo = ref.read(collectionRepositoryProvider);
      final data = await repo.listCollections();
      setState(() {
        _collections
          ..clear()
          ..addAll(data);
      });
    } catch (_) {
      setState(() => _collections.clear());
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_collections.isEmpty) {
      return _buildEmptyState();
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _collections.length,
      itemBuilder: (context, index) {
        final collection = _collections[index];
        final spots = collection['collectionSpots'] as List<dynamic>? ?? [];
        final firstSpot = spots.isNotEmpty
            ? spots.first['spot'] as Map<String, dynamic>?
            : null;
        final city = (firstSpot?['city'] as String?)?.isNotEmpty == true
            ? firstSpot!['city'] as String
            : 'Multi-city';
        final count = spots.length;
        final tags = (firstSpot?['tags'] as List<dynamic>? ?? [])
            .take(3)
            .map((t) => t.toString())
            .toList();
        final cover = collection['coverImage'] as String? ??
            (firstSpot?['coverImage'] as String? ??
                'https://via.placeholder.com/400x600');
        return Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: _CollectionCard(
            name: collection['name'] as String? ?? 'Collection',
            city: city,
            spotsCount: count,
            image: cover,
            tags: tags,
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => AlbumSpotsMapPage(
                    city: city,
                    albumTitle: collection['name'] as String? ?? 'Collection',
                    collectionId: collection['id'] as String?,
                    description: collection['description'] as String?,
                    coverImage: collection['coverImage'] as String?,
                    people: (collection['people'] as List<dynamic>? ?? [])
                        .map((p) => LinkItem(
                              name: p['name'] as String? ?? '',
                              link: p['link'] as String?,
                              avatarUrl: p['avatarUrl'] as String?,
                            ))
                        .toList(),
                    works: (collection['works'] as List<dynamic>? ?? [])
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
          ),
        );
      },
    );
  }

  Widget _buildEmptyState() {
    return Center(
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
            'No collections yet',
            style: TextStyle(
              fontSize: 18,
              color: Colors.grey.shade600,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Create a trip to start collecting spots',
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

/// 合集卡片组件
class _CollectionCard extends StatelessWidget {
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
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 200,
        decoration: BoxDecoration(
          color: AppTheme.white,
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
          border: Border.all(
            color: AppTheme.black,
            width: AppTheme.borderMedium,
          ),
          boxShadow: AppTheme.cardShadow,
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium - 2),
          child: Stack(
            children: [
              // 背景图片
              Positioned.fill(
                child: Image.network(
                  image,
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) => Container(
                    color: AppTheme.background,
                    child: const Center(
                      child: Icon(
                        Icons.image_outlined,
                        size: 40,
                        color: Colors.grey,
                      ),
                    ),
                  ),
                ),
              ),

              // 渐变遮罩
              Positioned.fill(
                child: Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.transparent,
                        Colors.black.withOpacity(0.7),
                      ],
                    ),
                  ),
                ),
              ),

              // 内容
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // 城市标签和数量
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: AppTheme.primaryYellow.withOpacity(0.9),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: AppTheme.black,
                              width: AppTheme.borderThin,
                            ),
                          ),
                          child: Text(
                            city.toLowerCase(),
                            style: AppTheme.labelSmall(context).copyWith(
                              color: AppTheme.black,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: AppTheme.primaryYellow.withOpacity(0.9),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: AppTheme.black,
                              width: AppTheme.borderThin,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                spotsCount.toString(),
                                style: AppTheme.labelSmall(context).copyWith(
                                  color: AppTheme.black,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(width: 4),
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

                    // 标题和标签
                    Text(
                      name,
                      style: AppTheme.headlineMedium(context).copyWith(
                        color: AppTheme.white,
                        fontWeight: FontWeight.bold,
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
                      children: tags.take(3).map((tag) {
                        return Text(
                          '#$tag',
                          style: AppTheme.labelSmall(context).copyWith(
                            color: AppTheme.white.withOpacity(0.9),
                            shadows: [
                              const Shadow(
                                color: Colors.black,
                                blurRadius: 4,
                              ),
                            ],
                          ),
                        );
                      }).toList(),
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
}
