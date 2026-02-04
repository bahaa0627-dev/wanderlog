import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/core/providers/locale_provider.dart';
import 'package:wanderlog/features/map/data/models/public_place_dto.dart';
import 'package:wanderlog/features/stills/presentation/pages/photo_compare_editor_page.dart';
import 'package:wanderlog/features/stills/presentation/widgets/fullscreen_stills_viewer.dart';
import 'package:wanderlog/shared/widgets/vago_placeholder.dart';

/// 剧照列表页面 - 展示地点关联的所有剧照
/// 布局逻辑：
/// 1. 可拼图的作品展示在前面（按电影分组，带"可拼图"小标题）
/// 2. 其他剧照展示在后面（Others stills）
/// 3. 过滤动图/视频剧照，全部剧照不符合条件时不展示该作品
class StillsListPage extends ConsumerWidget {
  const StillsListPage({
    required this.placeName,
    required this.customFields,
    super.key,
  });

  final String placeName;
  final PlaceCustomFields customFields;

  /// 检查是否是有效的静态图片（过滤动图/视频）
  bool _isValidStillImage(String url) {
    if (url.isEmpty) return false;
    final lowerUrl = url.toLowerCase();
    // 过滤 gif 动图和视频格式
    if (lowerUrl.endsWith('.gif')) return false;
    if (lowerUrl.endsWith('.mp4')) return false;
    if (lowerUrl.endsWith('.webm')) return false;
    if (lowerUrl.endsWith('.mov')) return false;
    if (lowerUrl.contains('.gif?')) return false;
    return true;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = ref.watch(localeProvider);
    final isZh = locale.languageCode == 'zh';
    
    final movies = customFields.movies;
    final allStills = customFields.stills;
    
    // 过滤有效的静态图片
    final validStills = allStills.where((s) => _isValidStillImage(s.imageUrl)).toList();
    
    // 按电影分组
    final stillsByMovie = <String, List<StillWithMovie>>{};
    for (final still in validStills) {
      stillsByMovie.putIfAbsent(still.movieId, () => []).add(still);
    }
    
    // 分类：有可拼图剧照的电影 vs 没有的
    final compareableMovieStills = <String, List<StillWithMovie>>{}; // 有可拼图剧照的电影
    final otherMovieStills = <String, List<StillWithMovie>>{}; // 没有可拼图剧照的电影
    
    for (final entry in stillsByMovie.entries) {
      final movieId = entry.key;
      final stills = entry.value;
      final hasCompareable = stills.any((s) => s.canCompare);
      
      if (hasCompareable) {
        compareableMovieStills[movieId] = stills;
      } else {
        otherMovieStills[movieId] = stills;
      }
    }
    
    // 收集所有不可拼图的剧照（来自有可拼图剧照的电影）
    final nonCompareableStillsFromCompareableMovies = <StillWithMovie>[];
    for (final stills in compareableMovieStills.values) {
      nonCompareableStillsFromCompareableMovies.addAll(
        stills.where((s) => !s.canCompare),
      );
    }
    
    // 如果没有任何有效剧照，显示空状态
    if (validStills.isEmpty) {
      return Scaffold(
        backgroundColor: AppTheme.background,
        appBar: _buildAppBar(context),
        body: _buildEmptyState(context),
      );
    }

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: _buildAppBar(context),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // 1. 可拼图的作品（按电影分组，只显示可拼图的剧照）
          if (compareableMovieStills.isNotEmpty) ...[
            ...compareableMovieStills.entries.toList().asMap().entries.map((mapEntry) {
              final index = mapEntry.key;
              final entry = mapEntry.value;
              final movieId = entry.key;
              final stills = entry.value;
              final compareableOnly = stills.where((s) => s.canCompare).toList();
              final movie = movies.firstWhere(
                (m) => m.movieId == movieId,
                orElse: () => MovieReference(movieId: movieId),
              );
              final isLast = index == compareableMovieStills.length - 1;
              return _buildCompareableMovieSection(
                context, movie, compareableOnly, validStills, isZh,
                showDivider: !isLast, // 同一剧集内不需要分隔线，不同剧集之间需要
              );
            }),
          ],
          
          // 2. Others stills（仅当有可拼图内容时才显示此区域）
          // 如果没有任何可拼图的剧照，直接显示所有电影剧照，不需要 "Others stills" 标题
          if (compareableMovieStills.isNotEmpty && 
              (nonCompareableStillsFromCompareableMovies.isNotEmpty || otherMovieStills.isNotEmpty)) ...[
            // Others stills 标题（紧凑间距）
            const SizedBox(height: 8),
            Text(
              isZh ? '其他剧照' : 'Others stills',
              style: AppTheme.labelSmall(context).copyWith(
                color: AppTheme.mediumGray,
              ),
            ),
            const SizedBox(height: 12),
            
            // 有可拼图电影中不可拼图的剧照（不按电影分组，直接显示）
            if (nonCompareableStillsFromCompareableMovies.isNotEmpty) ...[
              _buildStillsGridSimple(context, nonCompareableStillsFromCompareableMovies, movies, validStills),
              if (otherMovieStills.isNotEmpty) ...[
                const SizedBox(height: 12),
                Container(height: 1, color: AppTheme.lightGray),
                const SizedBox(height: 12),
              ],
            ],
            
            // 完全没有可拼图的电影（按电影分组显示，不同剧集之间有分隔线）
            ...otherMovieStills.entries.toList().asMap().entries.map((mapEntry) {
              final index = mapEntry.key;
              final entry = mapEntry.value;
              final movieId = entry.key;
              final stills = entry.value;
              final movie = movies.firstWhere(
                (m) => m.movieId == movieId,
                orElse: () => MovieReference(movieId: movieId),
              );
              final isLast = index == otherMovieStills.length - 1;
              return _buildOtherMovieSection(
                context, movie, stills, validStills, isZh,
                showDivider: !isLast,
              );
            }),
          ],
          
          // 3. 如果没有任何可拼图的剧照，直接显示所有电影剧照（不显示 "Others stills" 标题）
          if (compareableMovieStills.isEmpty && otherMovieStills.isNotEmpty) ...[
            ...otherMovieStills.entries.toList().asMap().entries.map((mapEntry) {
              final index = mapEntry.key;
              final entry = mapEntry.value;
              final movieId = entry.key;
              final stills = entry.value;
              final movie = movies.firstWhere(
                (m) => m.movieId == movieId,
                orElse: () => MovieReference(movieId: movieId),
              );
              final isLast = index == otherMovieStills.length - 1;
              return _buildOtherMovieSection(
                context, movie, stills, validStills, isZh,
                showDivider: !isLast,
              );
            }),
          ],
        ],
      ),
    );
  }

  PreferredSizeWidget _buildAppBar(BuildContext context) => AppBar(
      backgroundColor: AppTheme.white,
      elevation: 0,
      leading: IconButton(
        icon: const Icon(Icons.arrow_back, color: AppTheme.black),
        onPressed: () => Navigator.pop(context),
      ),
      title: Text(
        'Stills',
        style: AppTheme.headlineMedium(context).copyWith(
          fontWeight: FontWeight.bold,
        ),
      ),
      centerTitle: true,
    );

  Widget _buildEmptyState(BuildContext context) => Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            Icons.movie_outlined,
            size: 64,
            color: AppTheme.mediumGray,
          ),
          const SizedBox(height: 16),
          Text(
            'No stills available',
            style: AppTheme.bodyLarge(context).copyWith(
              color: AppTheme.mediumGray,
            ),
          ),
        ],
      ),
    );

  /// 构建可拼图电影区域（只显示可拼图的剧照）
  Widget _buildCompareableMovieSection(
    BuildContext context,
    MovieReference movie,
    List<StillWithMovie> stills,
    List<StillWithMovie> allValidStills,
    bool isZh, {
    bool showDivider = false,
  }) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 电影名称标题（emoji + 作品名）
        _buildMovieHeader(context, movie, stills.isNotEmpty ? stills.first : null, isZh),
        const SizedBox(height: 4),
        
        // 可拼图小标题
        Text(
          isZh ? '可拼图' : 'Photo Collage',
          style: AppTheme.labelSmall(context).copyWith(
            color: AppTheme.mediumGray,
          ),
        ),
        const SizedBox(height: 8),
        _buildStillsGrid(context, stills, movie, allValidStills, showCompareButton: true),
        // 不同剧集之间的分隔线
        if (showDivider) ...[
          const SizedBox(height: 12),
          Container(height: 1, color: AppTheme.lightGray),
          const SizedBox(height: 12),
        ],
      ],
    );

  /// 构建其他电影区域（没有可拼图剧照的电影）
  Widget _buildOtherMovieSection(
    BuildContext context,
    MovieReference movie,
    List<StillWithMovie> stills,
    List<StillWithMovie> allValidStills,
    bool isZh, {
    bool showDivider = false,
  }) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 电影名称标题
        _buildMovieHeader(context, movie, stills.isNotEmpty ? stills.first : null, isZh),
        const SizedBox(height: 8),
        // 剧照网格
        _buildStillsGrid(context, stills, movie, allValidStills, showCompareButton: false),
        // 不同剧集之间的分隔线
        if (showDivider) ...[
          const SizedBox(height: 12),
          Container(height: 1, color: AppTheme.lightGray),
          const SizedBox(height: 12),
        ],
      ],
    );

  /// 构建简单的剧照网格（不按电影分组，用于 Others stills 中混合显示）
  Widget _buildStillsGridSimple(
    BuildContext context,
    List<StillWithMovie> stills,
    List<MovieReference> movies,
    List<StillWithMovie> allValidStills,
  ) => GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 4 / 3,
      ),
      itemCount: stills.length,
      itemBuilder: (context, index) {
        final still = stills[index];
        final movie = movies.firstWhere(
          (m) => m.movieId == still.movieId,
          orElse: () => MovieReference(movieId: still.movieId),
        );
        return _buildStillCard(context, still, movie, allValidStills, showCompareButton: false);
      },
    );

  /// 构建电影标题（emoji + 作品名）
  /// 优先从 movie 获取名称，如果为空则从 still 获取
  Widget _buildMovieHeader(BuildContext context, MovieReference movie, StillWithMovie? still, bool isZh) {
    // 根据语言选择显示名称，优先从 movie 获取，其次从 still 获取
    String displayName;
    if (isZh) {
      displayName = movie.movieNameCn ?? movie.movieNameEn ?? 
                    still?.movieNameCn ?? still?.movieNameEn ?? 'Unknown';
    } else {
      displayName = movie.movieNameEn ?? movie.movieNameCn ?? 
                    still?.movieNameEn ?? still?.movieNameCn ?? 'Unknown';
    }
    
    return Row(
      children: [
        const Text('🎬', style: TextStyle(fontSize: 20)),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            displayName,
            style: AppTheme.bodyLarge(context).copyWith(
              fontWeight: FontWeight.bold,
              color: AppTheme.accentBlue,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }

  /// 构建剧照网格
  Widget _buildStillsGrid(
    BuildContext context,
    List<StillWithMovie> stills,
    MovieReference movie,
    List<StillWithMovie> allValidStills, {
    required bool showCompareButton,
  }) => GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 4 / 3,
      ),
      itemCount: stills.length,
      itemBuilder: (context, index) {
        final still = stills[index];
        return _buildStillCard(
          context, 
          still, 
          movie, 
          allValidStills,
          showCompareButton: showCompareButton || still.canCompare,
        );
      },
    );

  Widget _buildStillCard(
    BuildContext context,
    StillWithMovie still,
    MovieReference movie,
    List<StillWithMovie> allValidStills, {
    required bool showCompareButton,
  }) => GestureDetector(
      onTap: () => _viewStillFullScreen(context, still, allValidStills),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTheme.black, width: 2),
          boxShadow: AppTheme.cardShadow,
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: Stack(
            fit: StackFit.expand,
            children: [
              // 剧照图片
              Image.network(
                still.imageUrl,
                fit: BoxFit.cover,
                loadingBuilder: (context, child, loadingProgress) {
                  if (loadingProgress == null) return child;
                  return const VagoPlaceholderSmall();
                },
                errorBuilder: (_, __, ___) => const VagoPlaceholderSmall(),
              ),
              // 合拍按钮 - 右下角
              if (showCompareButton)
                Positioned(
                  right: 8,
                  bottom: 8,
                  child: GestureDetector(
                    onTap: () => _openPhotoCompareEditor(context, still, movie),
                    child: Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: AppTheme.primaryYellow,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppTheme.black, width: 1.5),
                      ),
                      child: const Icon(
                        Icons.camera_alt,
                        size: 18,
                        color: AppTheme.black,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );

  void _viewStillFullScreen(BuildContext context, StillWithMovie still, List<StillWithMovie> allStills) {
    final initialIndex = allStills.indexWhere((s) => s.imageUrl == still.imageUrl);
    FullscreenStillsViewer.show(
      context,
      stills: allStills,
      movies: customFields.movies,
      initialIndex: initialIndex >= 0 ? initialIndex : 0,
      placeName: placeName,
    );
  }

  void _openPhotoCompareEditor(
    BuildContext context,
    StillWithMovie still,
    MovieReference movie,
  ) {
    Navigator.push(
      context,
      MaterialPageRoute<void>(
        builder: (context) => PhotoCompareEditorPage(
          stillImageUrl: still.imageUrl,
          movieName: movie.displayName,
          placeName: placeName,
        ),
      ),
    );
  }
}
