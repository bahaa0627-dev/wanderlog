import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/core/theme/app_theme.dart';

/// Collections Tab - 显示用户收藏的合集
/// 这些合集与 trip 的城市相关
class CollectionsTab extends ConsumerStatefulWidget {
  const CollectionsTab({super.key});

  @override
  ConsumerState<CollectionsTab> createState() => _CollectionsTabState();
}

class _CollectionsTabState extends ConsumerState<CollectionsTab> {
  // Mock 数据 - 后续替换为真实数据
  final List<Map<String, dynamic>> _mockCollections = [
    {
      'id': '1',
      'name': '3 day in Copenhagen',
      'city': 'Copenhagen',
      'spotsCount': 15,
      'image':
          'https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?w=800',
      'tags': ['Landmark', 'Park', 'Architecture'],
    },
    {
      'id': '2',
      'name': 'Amazing Architectures in Porto',
      'city': 'Porto',
      'spotsCount': 10,
      'image':
          'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800',
      'tags': ['Architecture', 'Siza', 'Museum'],
    },
    {
      'id': '3',
      'name': 'Romance & Art in Paris',
      'city': 'Paris',
      'spotsCount': 85,
      'image':
          'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800',
      'tags': ['Museum', 'Cafe', 'Fashion'],
    },
  ];

  @override
  Widget build(BuildContext context) {
    if (_mockCollections.isEmpty) {
      return _buildEmptyState();
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _mockCollections.length,
      itemBuilder: (context, index) {
        final collection = _mockCollections[index];
        return Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: _CollectionCard(
            name: collection['name'] as String,
            city: collection['city'] as String,
            spotsCount: collection['spotsCount'] as int,
            image: collection['image'] as String,
            tags: (collection['tags'] as List<dynamic>).cast<String>(),
            onTap: () {
              // TODO: 导航到合集详情页
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
