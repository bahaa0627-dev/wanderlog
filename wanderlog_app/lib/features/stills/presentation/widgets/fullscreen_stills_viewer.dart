import 'package:flutter/material.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/map/data/models/public_place_dto.dart';
import 'package:wanderlog/features/stills/presentation/pages/photo_compare_editor_page.dart';
import 'package:wanderlog/shared/widgets/vago_placeholder.dart';

/// 全屏剧照浏览器 - 支持左右横滑查看所有剧照（跨剧）
/// 可拼图的照片右下角显示相机按钮
class FullscreenStillsViewer extends StatefulWidget {
  const FullscreenStillsViewer({
    required this.stills,
    required this.movies,
    required this.initialIndex,
    required this.placeName,
    super.key,
  });

  final List<StillWithMovie> stills;
  final List<MovieReference> movies;
  final int initialIndex;
  final String placeName;

  /// 显示全屏剧照浏览器
  static void show(
    BuildContext context, {
    required List<StillWithMovie> stills,
    required List<MovieReference> movies,
    required int initialIndex,
    required String placeName,
  }) {
    Navigator.of(context).push(
      PageRouteBuilder<void>(
        opaque: false,
        barrierColor: Colors.black87,
        pageBuilder: (context, animation, secondaryAnimation) {
          return FullscreenStillsViewer(
            stills: stills,
            movies: movies,
            initialIndex: initialIndex,
            placeName: placeName,
          );
        },
        transitionsBuilder: (context, animation, secondaryAnimation, child) {
          return FadeTransition(opacity: animation, child: child);
        },
      ),
    );
  }

  @override
  State<FullscreenStillsViewer> createState() => _FullscreenStillsViewerState();
}

class _FullscreenStillsViewerState extends State<FullscreenStillsViewer> {
  late PageController _pageController;
  late int _currentIndex;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
    _pageController = PageController(initialPage: widget.initialIndex);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  StillWithMovie get _currentStill => widget.stills[_currentIndex];
  bool get _canGoLeft => _currentIndex > 0;
  bool get _canGoRight => _currentIndex < widget.stills.length - 1;

  MovieReference _getMovieForStill(StillWithMovie still) {
    return widget.movies.firstWhere(
      (m) => m.movieId == still.movieId,
      orElse: () => MovieReference(
        movieId: still.movieId,
        movieNameCn: still.movieNameCn,
        movieNameEn: still.movieNameEn,
      ),
    );
  }

  void _goToPage(int index) {
    _pageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeInOut,
    );
  }

  void _openPhotoCompareEditor() {
    final still = _currentStill;
    final movie = _getMovieForStill(still);
    
    Navigator.push(
      context,
      MaterialPageRoute<void>(
        builder: (context) => PhotoCompareEditorPage(
          stillImageUrl: still.imageUrl,
          movieName: movie.displayName,
          placeName: widget.placeName,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bottomPadding = MediaQuery.of(context).padding.bottom;
    final topPadding = MediaQuery.of(context).padding.top;
    
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Stack(
        children: [
          // 背景点击关闭
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(color: Colors.black87),
          ),
          
          // 剧照 PageView
          PageView.builder(
            controller: _pageController,
            itemCount: widget.stills.length,
            onPageChanged: (index) => setState(() => _currentIndex = index),
            itemBuilder: (context, index) => _buildStillPage(widget.stills[index]),
          ),
          
          // 左箭头
          if (_canGoLeft)
            Positioned(
              left: 8,
              top: 0,
              bottom: 0,
              child: Center(
                child: GestureDetector(
                  onTap: () => _goToPage(_currentIndex - 1),
                  child: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.black38,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Icon(
                      Icons.chevron_left,
                      color: Colors.white70,
                      size: 32,
                    ),
                  ),
                ),
              ),
            ),
          
          // 右箭头
          if (_canGoRight)
            Positioned(
              right: 8,
              top: 0,
              bottom: 0,
              child: Center(
                child: GestureDetector(
                  onTap: () => _goToPage(_currentIndex + 1),
                  child: Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.black38,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Icon(
                      Icons.chevron_right,
                      color: Colors.white70,
                      size: 32,
                    ),
                  ),
                ),
              ),
            ),
          
          // 关闭按钮
          Positioned(
            top: topPadding + 8,
            right: 16,
            child: IconButton(
              icon: const Icon(Icons.close, color: Colors.white, size: 28),
              onPressed: () => Navigator.pop(context),
            ),
          ),
          
          // 页码指示器
          Positioned(
            top: topPadding + 16,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(
                  '${_currentIndex + 1} / ${widget.stills.length}',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ),
          ),
          
          // 电影名称
          Positioned(
            bottom: bottomPadding + 80,
            left: 20,
            right: 20,
            child: Center(
              child: Text(
                _currentStill.movieDisplayName,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          ),
          
          // 相机拼图按钮（仅可拼图的照片显示）- 使用与列表页一致的图标
          if (_currentStill.canCompare)
            Positioned(
              right: 24,
              bottom: bottomPadding + 120,
              child: GestureDetector(
                onTap: _openPhotoCompareEditor,
                child: Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: AppTheme.primaryYellow,
                    shape: BoxShape.circle,
                    border: Border.all(color: AppTheme.black, width: 2),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.3),
                        blurRadius: 8,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.camera_alt,
                    size: 24,
                    color: AppTheme.black,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildStillPage(StillWithMovie still) {
    return Center(
      child: InteractiveViewer(
        minScale: 0.5,
        maxScale: 3.0,
        child: Image.network(
          still.imageUrl,
          fit: BoxFit.contain,
          loadingBuilder: (context, child, loadingProgress) {
            if (loadingProgress == null) return child;
            return Center(
              child: CircularProgressIndicator(
                value: loadingProgress.expectedTotalBytes != null
                    ? loadingProgress.cumulativeBytesLoaded /
                        loadingProgress.expectedTotalBytes!
                    : null,
                color: AppTheme.primaryYellow,
              ),
            );
          },
          errorBuilder: (_, __, ___) => const VagoPlaceholderLarge(),
        ),
      ),
    );
  }
}
