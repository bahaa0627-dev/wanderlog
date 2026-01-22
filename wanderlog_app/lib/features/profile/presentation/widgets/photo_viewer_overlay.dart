import 'dart:convert';
import 'dart:typed_data';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/profile/providers/mine_page_provider.dart';

/// Show fullscreen photo viewer overlay
void showPhotoViewerOverlay({
  required BuildContext context,
  required List<CheckInPhoto> photos,
  required int initialIndex,
}) {
  Navigator.of(context).push(
    PageRouteBuilder<void>(
      opaque: false,
      barrierDismissible: true,
      barrierColor: Colors.black87,
      pageBuilder: (context, animation, secondaryAnimation) {
        return PhotoViewerOverlay(
          photos: photos,
          initialIndex: initialIndex,
        );
      },
      transitionsBuilder: (context, animation, secondaryAnimation, child) {
        return FadeTransition(
          opacity: animation,
          child: child,
        );
      },
    ),
  );
}

/// Fullscreen photo viewer with swipe navigation
class PhotoViewerOverlay extends StatefulWidget {
  const PhotoViewerOverlay({
    required this.photos,
    required this.initialIndex,
    super.key,
  });

  final List<CheckInPhoto> photos;
  final int initialIndex;

  @override
  State<PhotoViewerOverlay> createState() => _PhotoViewerOverlayState();
}

class _PhotoViewerOverlayState extends State<PhotoViewerOverlay> {
  late PageController _pageController;
  late int _currentIndex;
  bool _isNotesExpanded = false;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
    _pageController = PageController(initialPage: _currentIndex);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Stack(
        children: [
          // Photo PageView
          PageView.builder(
            controller: _pageController,
            itemCount: widget.photos.length,
            onPageChanged: (index) {
              setState(() {
                _currentIndex = index;
                _isNotesExpanded = false;
              });
            },
            itemBuilder: (context, index) {
              final photo = widget.photos[index];
              return GestureDetector(
                onTap: () => Navigator.of(context).pop(),
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(24),
                      child: InteractiveViewer(
                        minScale: 0.5,
                        maxScale: 3.0,
                        child: _buildImage(photo),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),

          // Close button
          Positioned(
            top: MediaQuery.of(context).padding.top + 16,
            right: 16,
            child: GestureDetector(
              onTap: () => Navigator.of(context).pop(),
              child: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Icon(
                  Icons.close,
                  color: Colors.white,
                  size: 24,
                ),
              ),
            ),
          ),

          // Bottom info panel
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: _buildInfoPanel(widget.photos[_currentIndex]),
          ),

          // Page indicator
          if (widget.photos.length > 1)
            Positioned(
              top: MediaQuery.of(context).padding.top + 16,
              left: 0,
              right: 0,
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.black54,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    '${_currentIndex + 1} / ${widget.photos.length}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildImage(CheckInPhoto photo) {
    if (photo.photoUrl.startsWith('data:image/')) {
      final bytes = _decodeBase64Image(photo.photoUrl);
      if (bytes != null) {
        return Image.memory(
          bytes,
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => _placeholder(),
        );
      }
      return _placeholder();
    }

    return CachedNetworkImage(
      imageUrl: photo.photoUrl,
      fit: BoxFit.contain,
      placeholder: (context, url) => const Center(
        child: CircularProgressIndicator(
          color: Colors.white,
        ),
      ),
      errorWidget: (context, url, error) => _placeholder(),
    );
  }

  Widget _placeholder() {
    return Container(
      color: Colors.grey[900],
      child: const Center(
        child: Icon(
          Icons.image_not_supported_outlined,
          color: Colors.white54,
          size: 48,
        ),
      ),
    );
  }

  Widget _buildInfoPanel(CheckInPhoto photo) {
    return Container(
      padding: EdgeInsets.fromLTRB(
        20,
        20,
        20,
        MediaQuery.of(context).padding.bottom + 20,
      ),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.transparent,
            Colors.black.withOpacity(0.7),
            Colors.black.withOpacity(0.9),
          ],
          stops: const [0.0, 0.3, 1.0],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Date and spot name row
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Date
              Text(
                _formatDate(photo.visitDate),
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 14,
                ),
              ),
              const SizedBox(width: 8),
              // Spot name
              Expanded(
                child: Text(
                  photo.spotName,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          // Location
          Row(
            children: [
              const Icon(
                Icons.location_on,
                color: Colors.redAccent,
                size: 16,
              ),
              const SizedBox(width: 4),
              Text(
                _formatLocation(photo.city, photo.country),
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 14,
                ),
              ),
            ],
          ),
          // User notes
          if (photo.userNotes != null && photo.userNotes!.isNotEmpty) ...[
            const SizedBox(height: 12),
            GestureDetector(
              onTap: () {
                setState(() {
                  _isNotesExpanded = !_isNotesExpanded;
                });
              },
              child: Text(
                photo.userNotes!,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  height: 1.4,
                ),
                maxLines: _isNotesExpanded ? null : 3,
                overflow: _isNotesExpanded
                    ? TextOverflow.visible
                    : TextOverflow.ellipsis,
              ),
            ),
            if (!_isNotesExpanded && photo.userNotes!.length > 100)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: GestureDetector(
                  onTap: () {
                    setState(() {
                      _isNotesExpanded = true;
                    });
                  },
                  child: const Text(
                    'Read more',
                    style: TextStyle(
                      color: AppTheme.primaryYellow,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.year}/${date.month.toString().padLeft(2, '0')}/${date.day.toString().padLeft(2, '0')}';
  }

  String _formatLocation(String city, String country) {
    if (city.isEmpty && country.isEmpty) {
      return 'Unknown location';
    }
    if (city.isEmpty) return country;
    if (country.isEmpty) return city;
    return '$city, $country';
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
