import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart' hide Spot;
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart' as map_page show Spot;
import 'package:wanderlog/features/map/presentation/widgets/mapbox_spot_map.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';
import 'package:wanderlog/features/collections/providers/collection_providers.dart';
import 'package:wanderlog/shared/utils/destination_utils.dart';
import 'package:wanderlog/shared/models/spot_model.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';
import 'package:wanderlog/features/trips/providers/spots_provider.dart';
import 'package:wanderlog/features/map/providers/public_place_providers.dart';
import 'package:wanderlog/shared/widgets/unified_spot_detail_modal.dart';

/// 合集地点地图页面 - 显示某个合集下的所有地点
class CollectionSpotsMapPage extends ConsumerStatefulWidget {
  const CollectionSpotsMapPage({
    required this.city,
    required this.collectionTitle,
    this.collectionId,
    this.initialIsFavorited,
    this.description,
    this.coverImage,
    this.people = const [],
    this.works = const [],
    super.key,
  });

  final String city; // 城市名称，如 "Copenhagen"
  final String collectionTitle; // 合集标题，如 "3 day in copenhagen"
  final String? collectionId;
  final bool? initialIsFavorited;
  final String? description;
  final String? coverImage;
  final List<LinkItem> people;
  final List<LinkItem> works;

  @override
  ConsumerState<CollectionSpotsMapPage> createState() => _CollectionSpotsMapPageState();
}

class _CollectionSpotsMapPageState extends ConsumerState<CollectionSpotsMapPage> {
  final GlobalKey<MapboxSpotMapState> _mapKey = GlobalKey<MapboxSpotMapState>();
  final PageController _cardPageController =
      PageController(viewportFraction: 0.55);
  int _currentCardIndex = 0;
  List<map_page.Spot> _citySpots = [];
  map_page.Spot? _selectedSpot;
  bool _isFavorite = false;
  bool _isFavLoading = false;
  bool _isDescExpanded = false;
  bool _shouldRefreshCollections = false;
  bool _skipNextRecenter = false;

  bool? _extractIsFavorited(dynamic collection) {
    if (collection is Map<String, dynamic>) {
      if (collection.containsKey('isFavorited')) {
        final value = collection['isFavorited'];
        if (value != null) return _asBool(value);
      }
    }
    return null;
  }

  bool _asBool(dynamic value) {
    if (value is bool) return value;
    if (value is num) return value != 0;
    if (value is String) return value == 'true' || value == '1';
    return false;
  }

  double _effectiveLatThreshold(BuildContext context) {
    final mapState = _mapKey.currentState;
    if (mapState == null || mapState.currentCenter == null) return 0.006;

    final centerLat = mapState.currentCenter!.lat;
    final zoom = mapState.currentZoom;

    // meters per pixel at current latitude & zoom
    final metersPerPixel =
        156543.03392 * (math.cos(centerLat * math.pi / 180)) / (math.pow(2, zoom));

    final screenHeight = MediaQuery.of(context).size.height;
    final halfCorePixels = screenHeight * 0.22; // 44% 高度的中间区域
    final meters = metersPerPixel * halfCorePixels;
    // 1 deg lat ≈ 111111 m
    return meters / 111111.0;
  }

  double _effectiveLngThreshold(BuildContext context) {
    final mapState = _mapKey.currentState;
    if (mapState == null || mapState.currentCenter == null) return 0.008;

    final centerLat = mapState.currentCenter!.lat;
    final zoom = mapState.currentZoom;

    final metersPerPixel =
        156543.03392 * (math.cos(centerLat * math.pi / 180)) / (math.pow(2, zoom));
    final screenWidth = MediaQuery.of(context).size.width;
    final halfCorePixels = screenWidth * 0.20; // 40% 宽度的中间区域
    final meters = metersPerPixel * halfCorePixels;
    // 1 deg lng ≈ 111111 m * cos(lat)
    final denom = 111111.0 * math.cos(centerLat * math.pi / 180);
    if (denom == 0) return 0.01;
    return meters / denom;
  }

  // 将 shared/models/spot_model.dart 中的 Spot 转换为 map_page_new.dart 中的 Spot
  map_page.Spot _convertSpot(
    Spot spot, {
    int? ratingCountOverride,
    double? ratingOverride,
    List<String>? tagsOverride,
    String? categoryOverride,
  }) {
    // 确保 images / tags 是 List<String>
    final List<String> imageList = spot.images;
    final String coverImg = imageList.isNotEmpty ? imageList.first : '';
    final List<String> tagList = (tagsOverride ?? spot.tags)
        .map((e) => e.toString().trim())
        .where((e) => e.isNotEmpty)
        .toList();
    final String category = (categoryOverride ?? spot.category ?? 'place').trim();
    if (category.isNotEmpty && !tagList.contains(category)) {
      tagList.add(category);
    }
    
    return map_page.Spot(
      id: spot.id,
      name: spot.name,
      city: spot.city ?? 'Unknown',
      category: category.isNotEmpty ? category : 'place',
      latitude: spot.latitude,
      longitude: spot.longitude,
      rating: ratingOverride ?? spot.rating ?? 0.0,
      ratingCount: ratingCountOverride ?? 0,
      coverImage: coverImg,
      images: imageList,
      tags: tagList,
      aiSummary: null,
    );
  }

  /// 解析 AI tags，兼容 List、JSON 字符串、逗号/顿号分隔字符串
  List<String>? _extractAiTags(dynamic rawAiTags) {
    if (rawAiTags == null) return null;

    final List<String> tags = [];

    void addTag(dynamic value) {
      final tag = value.toString().trim();
      if (tag.isNotEmpty) tags.add(tag);
    }

    if (rawAiTags is List) {
      for (final item in rawAiTags) {
        addTag(item);
      }
      return tags.isEmpty ? null : tags;
    }

    if (rawAiTags is String && rawAiTags.trim().isNotEmpty) {
      final raw = rawAiTags.trim();
      // 先尝试 JSON array
      try {
        final decoded = jsonDecode(raw);
        if (decoded is List) {
          for (final item in decoded) {
            addTag(item);
          }
          if (tags.isNotEmpty) return tags;
        }
      } catch (_) {
        // ignore and fallback to split
      }

      // 逗号/顿号/分号/斜杠分隔
      final parts = raw.split(RegExp(r'[、，,;；/]+'));
      for (final part in parts) {
        addTag(part);
      }
      return tags.isEmpty ? null : tags;
    }

    return null;
  }

  @override
  void initState() {
    super.initState();
    _isFavorite = _asBool(widget.initialIsFavorited);
    _loadCitySpots();

    // 监听卡片滑动，同步更新地图中心
    _cardPageController.addListener(_onCardPageChanged);
  }

  @override
  void dispose() {
    _cardPageController.removeListener(_onCardPageChanged);
    _cardPageController.dispose();
    super.dispose();
  }

  void _onCardPageChanged() {
    if (!_cardPageController.hasClients) return;

    final page = _cardPageController.page?.round();
    if (page != null && page != _currentCardIndex && page < _citySpots.length) {
      final spot = _citySpots[page];
      setState(() {
        _currentCardIndex = page;
        _selectedSpot = spot;
      });

      if (_skipNextRecenter) {
        _skipNextRecenter = false;
        return;
      }

      final target = Position(spot.longitude, spot.latitude);
      if (!_isTargetNearCenter(target)) {
        _mapKey.currentState?.animateCamera(target);
      }
    }
  }

  Future<void> _loadCitySpots() async {
    // 如果有collectionId，从API获取真实数据
    if (widget.collectionId != null) {
      try {
        print('🔍 开始加载合集数据，collectionId: ${widget.collectionId}');
        final repo = ref.read(collectionRepositoryProvider);
        final spotRepo = ref.read(spotRepositoryProvider);
        final publicPlaceRepo = ref.read(publicPlaceRepositoryProvider);
        final collection = await repo.getCollection(widget.collectionId!);
        print('📦 获取到合集数据: ${collection.keys}');
        
        // 加载收藏状态
        final isFavorited = _extractIsFavorited(collection);
        if (mounted && isFavorited != null) {
          setState(() {
            _isFavorite = isFavorited;
          });
        }
        print('❤️ 收藏状态: $isFavorited');
        
        final collectionSpots = collection['collectionSpots'] as List<dynamic>? ?? [];
        print('📍 合集中的地点数量: ${collectionSpots.length}');

        final List<map_page.Spot?> results =
            List<map_page.Spot?>.filled(collectionSpots.length, null);
        final Map<String, map_page.Spot> cache = {};

        Future<map_page.Spot?> fetchSpot(int index) async {
          final cs = collectionSpots[index];
          print('🔎 处理第 ${index + 1} 个地点: ${cs.runtimeType}');

          final spotId = cs['spotId'] as String?;
          final spotData = cs['spot'] as Map<String, dynamic>?;
          if (spotId == null || spotId.isEmpty) {
            print('⚠️ 第 ${index + 1} 个地点缺少 spotId');
            return null;
          }

          if (cache.containsKey(spotId)) {
            return cache[spotId];
          }

          map_page.Spot? converted;

          // 优先从 Spot 服务获取最新详情，并用 public-place 补全标签/分类/评分人数
          try {
            final spot = await spotRepo.getSpotById(spotId);
            // 优先用 Spot 内的 googlePlaceId，若无则用合集内嵌的 placeId 兜底
            final placeIdCandidate = (spot.googlePlaceId != null &&
                    spot.googlePlaceId!.isNotEmpty)
                ? spot.googlePlaceId
                : (spotData?['googlePlaceId'] as String?);
            final place = (placeIdCandidate != null &&
                    placeIdCandidate.isNotEmpty)
                ? await publicPlaceRepo.getPlaceById(placeIdCandidate)
                : null;

            final tags = (place?.aiTags.isNotEmpty ?? false)
                ? place!.aiTags
                : spot.tags;
            final categoryOverride =
                (place?.category ?? spot.category ?? '').trim().isNotEmpty
                    ? (place?.category ?? spot.category)
                    : null;
            final ratingOverride = place?.rating ?? spot.rating ?? 0.0;
            final ratingCountOverride =
                place?.ratingCount ?? spot.ratingCount ?? 0;

            converted = _convertSpot(
              spot,
              tagsOverride: tags,
              categoryOverride: categoryOverride,
              ratingOverride: ratingOverride,
              ratingCountOverride: ratingCountOverride,
            );
            print('✅ Spot 服务获取成功: ${spot.name}');
          } catch (e, stackTrace) {
            print('⚠️ 拉取 spot 详情失败 ($spotId): $e');
            print('📋 Stack trace: $stackTrace');
          }

          // 兜底：使用合集返回的嵌套 spot 数据
          if (converted == null && spotData != null) {
            try {
              final spot = Spot.fromJson(spotData);
              converted = _convertSpot(spot);
              print('ℹ️ 使用合集内嵌 spot 兜底: ${spot.name}');
            } catch (e, stackTrace) {
              print('⚠️ 兜底解析 spot 失败 ($spotId): $e');
              print('📋 Stack trace: $stackTrace');
            }
          }

          if (converted != null) {
            cache[spotId] = converted;
          } else {
            print('⚠️ 无法获取地点 ($spotId)，已跳过');
          }
          return converted;
        }

        await Future.wait([
          for (int i = 0; i < collectionSpots.length; i++)
            fetchSpot(i).then((spot) => results[i] = spot),
        ]);

        final spots = results.whereType<map_page.Spot>().toList();
        
        print('✅ 成功转换了 ${spots.length} 个地点');
        
        if (mounted) {
          setState(() {
            _citySpots = spots;
            if (spots.isNotEmpty) {
              _selectedSpot = spots[0];
              print('✅ 设置选中地点: ${_selectedSpot?.name}');
            } else {
              print('⚠️ 没有地点数据，spots 为空');
            }
          });
        }
        
        print('✅ 从API加载了 ${spots.length} 个地点');
        return;
      } catch (e, stackTrace) {
        print('❌ 加载合集数据失败: $e');
        print('📋 Stack trace: $stackTrace');
        // 如果API失败，继续使用mock数据作为fallback
      }
    } else {
      print('⚠️ 没有 collectionId，使用 mock 数据');
    }
    
    // Fallback: 从 mock 数据中获取对应城市的地点（不区分大小写）
    final allSpots = _buildMockSpots();

    print('🔍 尝试加载城市: ${widget.city}');
    print('📊 可用城市列表: ${allSpots.keys.toList()}');

    // 尝试精确匹配
    _citySpots = allSpots[widget.city] ?? [];

    // 如果精确匹配失败，尝试不区分大小写匹配
    if (_citySpots.isEmpty) {
      final cityLower = widget.city.toLowerCase();
      for (final entry in allSpots.entries) {
        if (entry.key.toLowerCase() == cityLower) {
          _citySpots = entry.value;
          print('✅ 找到匹配城市: ${entry.key}，地点数量: ${_citySpots.length}');
          break;
        }
      }
    } else {
      print('✅ 精确匹配成功，地点数量: ${_citySpots.length}');
    }

    if (_citySpots.isEmpty) {
      print('❌ 未找到城市 ${widget.city} 的地点数据');
    }

    if (_citySpots.isNotEmpty) {
      _selectedSpot = _citySpots[0];
    }
  }

  bool get _hasMeta =>
      (widget.description?.isNotEmpty ?? false) ||
      widget.people.isNotEmpty ||
      widget.works.isNotEmpty;

  // 城市坐标映射
  static final Map<String, Position> _cityCoordinates = {
    'Tokyo': Position(139.6503, 35.6762),
    'Sapporo': Position(141.3545, 43.0621),
    'Hakodate': Position(140.7288, 41.7687),
    'Asahikawa': Position(142.3650, 43.7706),
    'Otaru': Position(140.9930, 43.1907),
    'Yamanashi': Position(138.5683, 35.6641),
    'Paris': Position(2.3522, 48.8566),
    'Copenhagen': Position(12.5683, 55.6761),
    'Chiang Mai': Position(98.9853, 18.7883),
  };

  Position _getCityCenter() {
    // 如果有 spots，计算中心点
    if (_citySpots.isNotEmpty) {
      double totalLat = 0;
      double totalLng = 0;
      for (final spot in _citySpots) {
        totalLat += spot.latitude;
        totalLng += spot.longitude;
      }
      return Position(
        totalLng / _citySpots.length,
        totalLat / _citySpots.length,
      );
    }
    
    // 否则使用城市坐标
    final cityKey = _cityCoordinates.keys.firstWhere(
      (key) => key.toLowerCase() == widget.city.toLowerCase(),
      orElse: () => '',
    );
    
    if (cityKey.isNotEmpty) {
      return _cityCoordinates[cityKey]!;
    }
    
    // 默认返回 Copenhagen
    return _cityCoordinates['Copenhagen']!;
  }

  @override
  Widget build(BuildContext context) {
    final cityCenter = _getCityCenter();

    return WillPopScope(
      onWillPop: () async {
        _handleBack();
        return false;
      },
      child: Scaffold(
        body: Stack(
          children: [
            // 全屏地图 - 使用共享组件（即使没有 spots 也显示地图）
            MapboxSpotMap(
              key: _mapKey,
              spots: _citySpots,
              initialCenter: cityCenter,
              initialZoom: _citySpots.isNotEmpty ? 13.0 : 10.0,
              selectedSpot: _selectedSpot,
              onSpotTap: _handleSpotTap,
              cameraPadding: MbxEdgeInsets(
                top: 300,
                bottom: 220,
                left: 24,
                right: 24,
              ),
            ),

            // 顶部导航栏 + 描述
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _buildAppBar(),
                  if (_hasMeta) _buildDescription(),
                ],
              ),
            ),

            // 底部地点卡片滑动列表
            if (_citySpots.isNotEmpty)
              Positioned(
                bottom: 40,
                left: 0,
                right: 0,
                child: _buildBottomCards(),
              ),
          ],
        ),
      ),
    );
  }

  void _handleSpotTap(map_page.Spot spot) {
    final spotIndex = _citySpots.indexOf(spot);
    if (spotIndex == -1) return;

    setState(() => _selectedSpot = spot);
    _skipNextRecenter = true; // marker点选后，联动卡片但不移动相机

    if (spotIndex != _currentCardIndex) {
      _cardPageController.animateToPage(
        spotIndex,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
    }
  }

  void _showSpotDetail(map_page.Spot spot) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => UnifiedSpotDetailModal(spot: spot),
    );
  }

  void _handleBack() {
    Navigator.of(context).pop({
      'shouldRefresh': _shouldRefreshCollections,
      'isFavorited': _isFavorite,
    });
  }

  Widget _buildAppBar() {
    final paddingTop = MediaQuery.of(context).padding.top;
    return Container(
      padding: EdgeInsets.only(
        top: paddingTop + 10,
        left: 16,
        right: 16,
        bottom: 10,
      ),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.95),
        boxShadow: const [
          BoxShadow(
            color: Colors.black12,
            blurRadius: 8,
            offset: Offset(0, 3),
          ),
        ],
      ),
      child: Row(
        children: [
          IconButtonCustom(
            icon: Icons.arrow_back,
            onPressed: _handleBack,
            backgroundColor: Colors.white,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              widget.collectionTitle,
              style: AppTheme.headlineMedium(context),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (widget.collectionId != null)
            IconButtonCustom(
              icon: _isFavorite ? Icons.favorite : Icons.favorite_border,
              onPressed: () {
                if (_isFavLoading) return;
                _toggleFavorite();
              },
              backgroundColor:
                  _isFavorite ? AppTheme.primaryYellow : Colors.white,
            ),
          const SizedBox(width: 8),
          IconButtonCustom(
            icon: Icons.share,
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Share coming soon')),
              );
            },
            backgroundColor: Colors.white,
          ),
        ],
      ),
    );
  }

  Widget _buildDescription() {
    final desc = widget.description ?? '';
    final hasExtra = desc.length > 0;
    if (!hasExtra) return const SizedBox.shrink();

    final text = Text(
      desc,
      maxLines: _isDescExpanded ? null : 2,
      overflow: _isDescExpanded ? TextOverflow.visible : TextOverflow.ellipsis,
      style: AppTheme.bodyMedium(context).copyWith(
        color: AppTheme.black.withOpacity(0.75),
      ),
    );

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 14),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.94),
        boxShadow: const [
          BoxShadow(
            color: Colors.black12,
            blurRadius: 8,
            offset: Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AnimatedSize(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeInOut,
            child: text,
          ),
          if (desc.length > 80)
            TextButton(
              style: TextButton.styleFrom(
                padding: EdgeInsets.zero,
                minimumSize: const ui.Size(0, 32),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              onPressed: () =>
                  setState(() => _isDescExpanded = !_isDescExpanded),
              child: Text(
                _isDescExpanded ? '收起' : '展开',
                style: AppTheme.labelMedium(context).copyWith(
                  color: AppTheme.primaryYellow,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
        ],
      ),
    );
  }

  bool _isTargetNearCenter(Position target) {
    final currentCenter = _mapKey.currentState?.currentCenter;
    if (currentCenter == null || !mounted) return false;

    final latThreshold = _effectiveLatThreshold(context);
    final lngThreshold = _effectiveLngThreshold(context);
    final latDiff = (target.lat - currentCenter.lat).abs();
    final lngDiff = (target.lng - currentCenter.lng).abs();
    return latDiff <= latThreshold && lngDiff <= lngThreshold;
  }

  Widget _buildBottomCards() {
    const double cardHeight = 270; // 更矮的高度
    const double cardWidth = cardHeight * 3 / 4; // 竖向 4:3 封面比例

    return SizedBox(
      height: cardHeight + 20,
      child: PageView.builder(
        controller: _cardPageController,
        padEnds: true,
        itemCount: _citySpots.length,
        itemBuilder: (context, index) {
          final spot = _citySpots[index];
          final isCenter = index == _currentCardIndex;

          return AnimatedScale(
            scale: isCenter ? 1.0 : 0.9,
            duration: const Duration(milliseconds: 220),
            child: Center(
              child: SizedBox(
                height: cardHeight,
                width: cardWidth,
                child: _BottomSpotCard(
                  spot: spot,
                  onTap: () {
                    if (index == _currentCardIndex) {
                      _showSpotDetail(spot);
                    } else {
                      _cardPageController.animateToPage(
                        index,
                        duration: const Duration(milliseconds: 300),
                        curve: Curves.easeInOut,
                      );
                    }
                  },
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _toggleFavorite() async {
    final collectionId = widget.collectionId;
    if (collectionId == null) return;

    final isLoggedIn = ref.read(authProvider).isAuthenticated;
    // 未登录先跳转登录，返回详情页后再点一次收藏
    if (!isLoggedIn) {
      final loggedIn = await requireAuth(context, ref);
      if (!loggedIn) return;
      return;
    }

    setState(() => _isFavLoading = true);
    final repo = ref.read(collectionRepositoryProvider);
    try {
      if (_isFavorite) {
        await repo.unfavoriteCollection(collectionId);
        if (mounted) {
          _shouldRefreshCollections = true;
          setState(() => _isFavorite = false);
          CustomToast.showInfo(context, '取消收藏');
        }
      } else {
        await repo.favoriteCollection(collectionId);
        if (mounted) {
          _shouldRefreshCollections = true;
          setState(() => _isFavorite = true);
          CustomToast.showSuccess(context, '收藏成功');
        }
      }
    } catch (e) {
      if (mounted) {
        CustomToast.showError(context, '操作失败，请重试');
      }
    } finally {
      if (mounted) {
        setState(() => _isFavLoading = false);
      }
    }
  }

  // Mock 数据 - 实际项目中应从 API 或 provider 获取
  Map<String, List<map_page.Spot>> _buildMockSpots() => {
        'Copenhagen': [
          map_page.Spot(
            id: 'cph-nyhavn',
            name: 'Nyhavn Harbour',
            city: 'Copenhagen',
            category: 'Waterfront',
            latitude: 55.6804,
            longitude: 12.5870,
            rating: 4.8,
            ratingCount: 3287,
            coverImage:
                'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Architecture', 'Food', 'History'],
            aiSummary:
                'Colorful 17th-century waterfront lined with ships, cafes, and lively outdoor terraces.',
          ),
          map_page.Spot(
            id: 'cph-rosenborg',
            name: 'Rosenborg Castle',
            city: 'Copenhagen',
            category: 'Museum',
            latitude: 55.6857,
            longitude: 12.5763,
            rating: 4.7,
            ratingCount: 1822,
            coverImage:
                'https://images.unsplash.com/photo-1511840636560-acee95b47a37?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1511840636560-acee95b47a37?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Museum', 'History', 'Architecture'],
            aiSummary:
                'Renaissance castle housing royal collections, crown jewels, and manicured palace gardens.',
          ),
          map_page.Spot(
            id: 'cph-roundtower',
            name: 'The Round Tower',
            city: 'Copenhagen',
            category: 'Landmark',
            latitude: 55.6816,
            longitude: 12.5732,
            rating: 4.6,
            ratingCount: 1395,
            coverImage:
                'https://images.unsplash.com/photo-1528909514045-2fa4ac7a08ba?auto=format&fit=crop&w=1200&q=80',
            images: [
              'https://images.unsplash.com/photo-1528909514045-2fa4ac7a08ba?auto=format&fit=crop&w=1200&q=80',
            ],
            tags: const ['Architecture', 'History'],
            aiSummary:
                '17th-century astronomical observatory with a spiraling ramp and sweeping city views.',
          ),
        ],
      };
}

/// 底部地点卡片组件
class _BottomSpotCard extends StatelessWidget {
  const _BottomSpotCard({
    required this.spot,
    required this.onTap,
  });

  final map_page.Spot spot;
  final VoidCallback onTap;

  List<String> _effectiveTags() {
    if (spot.tags.isNotEmpty) return spot.tags;
    if (spot.category.trim().isNotEmpty) return [spot.category];
    return const [];
  }

  IconData _getCategoryIconForSpot(String category) {
    switch (category.toLowerCase()) {
      case 'restaurant':
        return Icons.restaurant;
      case 'museum':
        return Icons.museum;
      case 'park':
        return Icons.park;
      case 'landmark':
        return Icons.location_city;
      case 'cafe':
        return Icons.local_cafe;
      case 'bakery':
        return Icons.bakery_dining;
      case 'shopping':
        return Icons.shopping_bag;
      case 'church':
        return Icons.church;
      case 'theater':
        return Icons.theater_comedy;
      case 'waterfront':
        return Icons.water;
      case 'library':
        return Icons.local_library;
      case 'architecture':
        return Icons.apartment;
      case 'neighborhood':
        return Icons.location_on;
      case 'bar':
        return Icons.local_bar;
      case 'zoo':
        return Icons.pets;
      case 'aquarium':
        return Icons.water;
      default:
        return Icons.place;
    }
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

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 6),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
            border:
                Border.all(color: AppTheme.black, width: AppTheme.borderMedium),
            boxShadow: AppTheme.cardShadow,
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppTheme.radiusMedium - 1),
            child: Stack(
              fit: StackFit.expand,
              children: [
                _buildCover(),
                Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.black54,
                        Colors.black38,
                        Colors.black87,
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Spacer(),
                      Text(
                        spot.name,
                        style: AppTheme.bodyLarge(context).copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          height: 1.2,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 8),
                      _RatingRow(
                        rating: spot.rating,
                        ratingCount: spot.ratingCount,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      );

  Widget _buildCover() {
    final placeholder = Container(
      color: AppTheme.lightGray,
      child: const Icon(
        Icons.place,
        size: 52,
        color: AppTheme.mediumGray,
      ),
    );

    if (spot.coverImage.isEmpty) return placeholder;
    if (spot.coverImage.startsWith('data:image/')) {
      final data = _decodeBase64Image(spot.coverImage);
      if (data.isEmpty) return placeholder;
      return Image.memory(
        data,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => placeholder,
      );
    }

    return Image.network(
      spot.coverImage,
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => placeholder,
    );
  }
}

class _RatingRow extends StatelessWidget {
  const _RatingRow({
    required this.rating,
    required this.ratingCount,
  });

  final double rating;
  final int ratingCount;

  @override
  Widget build(BuildContext context) {
    final hasRating = rating > 0;
    return Row(
      children: [
        Icon(
          Icons.star,
          color: hasRating ? AppTheme.primaryYellow : Colors.white70,
          size: 18,
        ),
        const SizedBox(width: 6),
        Text(
          hasRating ? rating.toStringAsFixed(1) : '暂无评分',
          style: AppTheme.bodyMedium(context).copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
        if (ratingCount > 0) ...[
          const SizedBox(width: 8),
          Text(
            '($ratingCount)',
            style: AppTheme.labelMedium(context).copyWith(
              color: Colors.white70,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ],
    );
  }
}

class LinkItem {
  const LinkItem({
    required this.name,
    this.link,
    this.avatarUrl,
    this.coverImage,
  });
  final String name;
  final String? link;
  final String? avatarUrl;
  final String? coverImage;
}

class _LinkChip extends StatelessWidget {
  const _LinkChip({
    required this.label,
    this.url,
    this.leading,
  });

  final String label;
  final String? url;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: url == null
          ? null
          : () async {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Open: $url')),
              );
            },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: AppTheme.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppTheme.black, width: AppTheme.borderThin),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (leading != null) ...[
              leading!,
              const SizedBox(width: 6),
            ],
            Text(
              label,
              style: AppTheme.labelSmall(context).copyWith(
                color: AppTheme.black,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

