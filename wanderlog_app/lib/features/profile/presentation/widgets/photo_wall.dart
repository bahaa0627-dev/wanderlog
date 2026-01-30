import 'dart:convert';
import 'dart:typed_data';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/profile/providers/mine_page_provider.dart';
import 'package:wanderlog/features/profile/presentation/widgets/photo_viewer_overlay.dart';

/// Photo wall widget displaying check-in photos in a grid
class PhotoWall extends StatelessWidget {
  const PhotoWall({
    required this.photos,
    required this.topCategories,
    super.key,
  });

  final List<CheckInPhoto> photos;
  final List<CategoryCount> topCategories;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Category chips
        if (topCategories.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Wrap(
              spacing: 8,
              runSpacing: 6,
              children: topCategories.map((category) {
                return _CategoryChip(
                  emoji: category.emoji,
                  count: category.count,
                  label: _pluralize(category.category, category.count),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 16),
        ],

        // Photo grid
        if (photos.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 32),
            child: Center(
              child: Column(
                children: [
                  Image.asset(
                    'assets/images/photo_wall.png',
                    fit: BoxFit.contain,
                    width: 280,
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'No photos yet',
                    style: AppTheme.bodyMedium(context).copyWith(
                      color: AppTheme.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  SizedBox(
                    width: double.infinity,
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.center,
                      child: Text(
                        'check in places and upload your flâneur memories',
                        style: AppTheme.bodySmall(context).copyWith(
                          color: AppTheme.mediumGray,
                        ),
                        maxLines: 1,
                        softWrap: false,
                        overflow: TextOverflow.visible,
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          )
        else
          _PhotoGrid(photos: photos),
      ],
    );
  }

  String _pluralize(String word, int count) {
    final lower = word.toLowerCase();
    if (count == 1) return lower;
    // Simple pluralization
    if (lower.endsWith('y')) {
      return '${lower.substring(0, lower.length - 1)}ies';
    }
    if (lower.endsWith('s') || lower.endsWith('x') || lower.endsWith('ch')) {
      return '${lower}es';
    }
    return '${lower}s';
  }
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({
    required this.emoji,
    required this.count,
    required this.label,
  });

  final String emoji;
  final int count;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.only(bottom: 2),
          decoration: const BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: AppTheme.black,
                width: AppTheme.borderThin,
              ),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(emoji, style: const TextStyle(fontSize: 14)),
              const SizedBox(width: 3),
              Text(
                '$count $label',
                style: AppTheme.bodySmall(context).copyWith(
                  fontWeight: FontWeight.w500,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _PhotoGrid extends StatelessWidget {
  const _PhotoGrid({required this.photos});

  final List<CheckInPhoto> photos;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 12),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        mainAxisSpacing: 4,
        crossAxisSpacing: 4,
        childAspectRatio: 1.0,
      ),
      itemCount: photos.length,
      itemBuilder: (context, index) {
        final photo = photos[index];
        return _PhotoGridItem(
          photo: photo,
          onTap: () => _showPhotoViewer(context, index),
        );
      },
    );
  }

  void _showPhotoViewer(BuildContext context, int initialIndex) {
    showPhotoViewerOverlay(
      context: context,
      photos: photos,
      initialIndex: initialIndex,
    );
  }
}

class _PhotoGridItem extends StatelessWidget {
  const _PhotoGridItem({
    required this.photo,
    required this.onTap,
  });

  final CheckInPhoto photo;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: _buildImage(),
      ),
    );
  }

  Widget _buildImage() {
    if (photo.photoUrl.startsWith('data:image/')) {
      final bytes = _decodeBase64Image(photo.photoUrl);
      if (bytes != null) {
        return Image.memory(
          bytes,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => _placeholder(),
        );
      }
      return _placeholder();
    }

    return CachedNetworkImage(
      imageUrl: photo.photoUrl,
      fit: BoxFit.cover,
      placeholder: (context, url) => Container(
        color: AppTheme.lightGray,
        child: const Center(
          child: SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      ),
      errorWidget: (context, url, error) => _placeholder(),
    );
  }

  Widget _placeholder() {
    return Container(
      color: AppTheme.lightGray,
      child: const Center(
        child: Icon(
          Icons.image_outlined,
          color: AppTheme.mediumGray,
        ),
      ),
    );
  }

  Uint8List? _decodeBase64Image(String dataUrl) {
    try {
      final base64String = dataUrl.split(',').last;
      return base64Decode(base64String);
    } catch (e) {
      return null;
    }
  }
}
