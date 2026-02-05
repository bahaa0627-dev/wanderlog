import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'dart:math' as math;
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:palette_generator/palette_generator.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:wanderlog/shared/widgets/vago_placeholder.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/core/utils/color_utils.dart';
import 'package:wanderlog/core/utils/dialog_utils.dart';
import 'package:wanderlog/core/l10n/app_localizations.dart';
import 'package:wanderlog/core/providers/locale_provider.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart'
    hide Spot;
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart'
    as map_page show Spot;
import 'package:wanderlog/features/map/presentation/widgets/mapbox_spot_map.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';
import 'package:wanderlog/features/collections/providers/collection_providers.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/shared/models/trip_model.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart';
import 'package:wanderlog/shared/utils/destination_utils.dart';
import 'package:wanderlog/shared/models/spot_model.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';
import 'package:wanderlog/features/trips/providers/spots_provider.dart';
import 'package:wanderlog/features/map/providers/public_place_providers.dart';
import 'package:wanderlog/shared/widgets/unified_spot_detail_modal.dart';
import 'package:wanderlog/shared/utils/number_format_utils.dart';
import 'package:wanderlog/features/ai_recognition/providers/wishlist_status_provider.dart';
import 'package:wanderlog/features/map/data/models/public_place_dto.dart';
import 'package:wanderlog/shared/widgets/share_bottom_sheet.dart';

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
    this.preloadedSpots,
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
  final List<Map<String, dynamic>>? preloadedSpots; // 预加载的地点数据

  @override
  ConsumerState<CollectionSpotsMapPage> createState() =>
      _CollectionSpotsMapPageState();
}

class _CollectionSpotsMapPageState
    extends ConsumerState<CollectionSpotsMapPage> {
  final GlobalKey<MapboxSpotMapState> _mapKey = GlobalKey<MapboxSpotMapState>();
  final PageController _cardPageController = PageController(viewportFraction: 0.55);
  int _currentCardIndex = 0;
  List<map_page.Spot> _citySpots = [];
  map_page.Spot? _selectedSpot;
  bool _isFavorite = false;
  bool _isFavLoading = false;
  bool _shouldRefreshCollections = false;
  bool _skipNextRecenter = false;
  bool _isExiting = false; // 标记是否正在退出页面
  Position? _initialCenter; // 从第一个地点计算的初始中心点
  bool _hasInitialCenter = false; // 是否已经确定了初始中心点（避免显示哥本哈根再跳转）

  // 防抖字段
  String? _lastClickedSpotId;
  DateTime? _lastClickTime;

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
    final metersPerPixel = 156543.03392 *
        (math.cos(centerLat * math.pi / 180)) /
        (math.pow(2, zoom));

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

    final metersPerPixel = 156543.03392 *
        (math.cos(centerLat * math.pi / 180)) /
        (math.pow(2, zoom));
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
    final String category =
        (categoryOverride ?? spot.category ?? 'place').trim();
    if (category.isNotEmpty && !tagList.contains(category)) {
      tagList.add(category);
    }

    // 构建 displayTagsEn：category + tags 合并
    final List<String> displayTags = [];
    if (category.isNotEmpty) {
      displayTags.add(category);
    }
    for (final tag in tagList) {
      if (!displayTags.contains(tag) && displayTags.length < 4) {
        displayTags.add(tag);
      }
    }

    return map_page.Spot(
      id: spot.id,
      name: spot.name,
      city: spot.city ?? 'Unknown',
      country: spot.country,
      category: category.isNotEmpty ? category : 'place',
      latitude: spot.latitude,
      longitude: spot.longitude,
      rating: ratingOverride ?? spot.rating ?? 0.0,
      ratingCount: ratingCountOverride ?? 0,
      coverImage: coverImg,
      collectionCoverImage:
          null, // spot_model.Spot doesn't have collectionCoverImage
      images: imageList,
      tags: tagList,
      displayTagsEn: displayTags,
      aiSummary: null,
      address: spot.address,
      phoneNumber: spot.phoneNumber,
      website: spot.website,
      openingHours: spot.openingHours,
      // 剧照数据
      customFields: spot.customFields,
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

    // 如果有预加载的地点，立即计算第一个地点的坐标作为初始中心
    if (widget.preloadedSpots != null && widget.preloadedSpots!.isNotEmpty) {
      final firstSpotData = widget.preloadedSpots!.first;
      final spotData = (firstSpotData['spot'] ?? firstSpotData['place'])
          as Map<String, dynamic>?;
      if (spotData != null) {
        final lat = (spotData['latitude'] as num?)?.toDouble();
        final lng = (spotData['longitude'] as num?)?.toDouble();
        if (lat != null && lng != null && lat != 0.0 && lng != 0.0) {
          _initialCenter = Position(lng, lat);
          _hasInitialCenter = true;
          print('✅ 从预加载数据设置初始中心: ($lng, $lat)');
        }
      }
    }

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
    if (!_cardPageController.hasClients || _isExiting) return;

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
    // 优先使用预加载的数据
    if (widget.preloadedSpots != null && widget.preloadedSpots!.isNotEmpty) {
      print('🚀 使用预加载的地点数据，数量: ${widget.preloadedSpots!.length}');
      final List<map_page.Spot> spots = [];

      for (final cs in widget.preloadedSpots!) {
        final spotData = (cs['spot'] ?? cs['place']) as Map<String, dynamic>?;
        if (spotData == null) continue;

        try {
          final coverImg = spotData['coverImage']?.toString() ??
              spotData['cover_image']?.toString() ??
              '';
          final imagesList =
              _parseImagesList(spotData['images'] ?? const <dynamic>[]);

          // 解析 openingHours
          Map<String, dynamic>? openingHours;
          final rawOpeningHours =
              spotData['openingHours'] ?? spotData['opening_hours'];
          if (rawOpeningHours is Map<String, dynamic>) {
            openingHours = rawOpeningHours;
          } else if (rawOpeningHours is String && rawOpeningHours.isNotEmpty) {
            try {
              final decoded = jsonDecode(rawOpeningHours);
              if (decoded is Map<String, dynamic>) {
                openingHours = decoded;
              } else if (decoded is List) {
                openingHours = {
                  'weekday_text': decoded.map((e) => e.toString()).toList(),
                };
              }
            } catch (_) {}
          }

          final spot = map_page.Spot(
            id: spotData['id']?.toString() ?? '',
            name: spotData['name']?.toString() ?? '',
            latitude: (spotData['latitude'] as num?)?.toDouble() ?? 0.0,
            longitude: (spotData['longitude'] as num?)?.toDouble() ?? 0.0,
            city: spotData['city']?.toString() ?? '',
            country: spotData['country']?.toString(),
            coverImage: coverImg,
            collectionCoverImage:
                spotData['collectionCoverImage']?.toString() ??
                    spotData['collection_cover_image']?.toString(),
            rating: (spotData['rating'] as num?)?.toDouble() ?? 0.0,
            ratingCount: (spotData['ratingCount'] as num?)?.toInt() ??
                (spotData['rating_count'] as num?)?.toInt() ??
                0,
            category: spotData['category']?.toString() ?? 'place',
            tags: _parseTagsList(
                spotData['tags'] ?? spotData['aiTags'] ?? spotData['ai_tags'],),
            displayTagsEn: _computeDisplayTags(spotData),
            images: imagesList.isNotEmpty
                ? imagesList
                : (coverImg.isNotEmpty ? [coverImg] : []),
            aiSummary: spotData['aiSummary']?.toString() ??
                spotData['ai_summary']?.toString(),
            // 详情页需要的额外字段
            address: spotData['address']?.toString(),
            phoneNumber: spotData['phoneNumber']?.toString() ??
                spotData['phone_number']?.toString(),
            website: spotData['website']?.toString(),
            openingHours: openingHours,
            // 剧照数据
            customFields: PlaceCustomFields.fromJson(
              (spotData['customFields'] ?? spotData['custom_fields'])
                  as Map<String, dynamic>?,
            ),
          );
          print(
              '✅ 创建 Spot: ${spot.name}, customFields: ${spot.customFields}, hasStills: ${spot.customFields?.hasStills}',);
          spots.add(spot);
        } catch (e) {
          print('⚠️ 解析预加载地点失败: $e');
        }
      }

      if (spots.isNotEmpty && mounted) {
        // 如果还没有初始中心，使用第一个地点的坐标
        if (_initialCenter == null) {
          final firstSpot = spots[0];
          _initialCenter = Position(firstSpot.longitude, firstSpot.latitude);
          _hasInitialCenter = true;
          print(
              '✅ 从预加载地点设置初始中心: (${firstSpot.longitude}, ${firstSpot.latitude})',);
        }

        setState(() {
          _citySpots = spots;
          _selectedSpot = spots[0];
        });
        print('✅ 预加载数据设置完成，共 ${spots.length} 个地点');
        return;
      }
    }

    // 如果有collectionId，从 API 获取数据
    if (widget.collectionId != null) {
      try {
        print('🔍 开始加载合集数据，collectionId: ${widget.collectionId}');

        // 从 API 获取最新数据
        final repo = ref.read(collectionRepositoryProvider);
        final collection = await repo.getCollection(widget.collectionId!);

        print('📦 获取到合集数据: ${collection.keys}');
        print('📦 合集数据详情: $collection');

        // 加载收藏状态
        final isFavorited = _extractIsFavorited(collection);
        if (mounted && isFavorited != null) {
          setState(() {
            _isFavorite = isFavorited;
          });
        }
        print('❤️ 收藏状态: $isFavorited');

        final collectionSpots =
            collection['collectionSpots'] as List<dynamic>? ?? [];
        print('📍 合集中的地点数量: ${collectionSpots.length}');
        if (collectionSpots.isNotEmpty) {
          print('📍 第一个地点数据: ${collectionSpots.first}');
        }

        final List<map_page.Spot> spots = [];

        for (int index = 0; index < collectionSpots.length; index++) {
          final cs = collectionSpots[index];
          print('🔎 处理第 ${index + 1} 个地点: ${cs.runtimeType}');

          final spotData = (cs['spot'] ?? cs['place']) as Map<String, dynamic>?;
          if (spotData == null) {
            print('⚠️ 第 ${index + 1} 个地点缺少 spot/place 数据');
            continue;
          }

          // 打印完整的 spotData 用于调试
          print(
              '🔍 spotData for ${spotData['name']}: displayTagsEn=${spotData['displayTagsEn']}, tags=${spotData['tags']}, aiTags=${spotData['aiTags']}',);

          try {
            // 直接从合集返回的数据创建 Spot
            final coverImg = spotData['coverImage']?.toString() ??
                spotData['cover_image']?.toString() ??
                '';
            final imagesList =
                _parseImagesList(spotData['images'] ?? const <dynamic>[]);

            // 解析 openingHours
            Map<String, dynamic>? openingHours;
            final rawOpeningHours =
                spotData['openingHours'] ?? spotData['opening_hours'];
            if (rawOpeningHours is Map<String, dynamic>) {
              openingHours = rawOpeningHours;
            } else if (rawOpeningHours is String &&
                rawOpeningHours.isNotEmpty) {
              try {
                final decoded = jsonDecode(rawOpeningHours);
                if (decoded is Map<String, dynamic>) {
                  openingHours = decoded;
                } else if (decoded is List) {
                  openingHours = {
                    'weekday_text': decoded.map((e) => e.toString()).toList(),
                  };
                }
              } catch (_) {}
            }

            final spot = map_page.Spot(
              id: spotData['id']?.toString() ?? '',
              name: spotData['name']?.toString() ?? '',
              latitude: (spotData['latitude'] as num?)?.toDouble() ?? 0.0,
              longitude: (spotData['longitude'] as num?)?.toDouble() ?? 0.0,
              city: spotData['city']?.toString() ?? '',
              country: spotData['country']?.toString(),
              coverImage: coverImg,
              collectionCoverImage:
                  spotData['collectionCoverImage']?.toString() ??
                      spotData['collection_cover_image']?.toString(),
              rating: (spotData['rating'] as num?)?.toDouble() ?? 0.0,
              ratingCount: (spotData['ratingCount'] as num?)?.toInt() ??
                  (spotData['rating_count'] as num?)?.toInt() ??
                  0,
              category: spotData['category']?.toString() ?? 'place',
              tags: _parseTagsList(spotData['tags'] ??
                  spotData['aiTags'] ??
                  spotData['ai_tags'],),
              displayTagsEn: _computeDisplayTags(spotData),
              images: imagesList.isNotEmpty
                  ? imagesList
                  : (coverImg.isNotEmpty ? [coverImg] : []),
              aiSummary: spotData['aiSummary']?.toString() ??
                  spotData['ai_summary']?.toString(),
              // 详情页需要的额外字段
              address: spotData['address']?.toString(),
              phoneNumber: spotData['phoneNumber']?.toString() ??
                  spotData['phone_number']?.toString(),
              website: spotData['website']?.toString(),
              openingHours: openingHours,
              // 剧照数据
              customFields: PlaceCustomFields.fromJson(
                (spotData['customFields'] ?? spotData['custom_fields'])
                    as Map<String, dynamic>?,
              ),
            );
            print(
                '✅ 成功解析地点: ${spot.name}, customFields: ${spot.customFields}, hasStills: ${spot.customFields?.hasStills}',);
            spots.add(spot);
          } catch (e, stackTrace) {
            print('⚠️ 解析地点失败: $e');
            print('📋 Stack trace: $stackTrace');
          }
        }

        print('✅ 成功转换了 ${spots.length} 个地点');

        if (mounted) {
          // 如果还没有初始中心，使用第一个地点的坐标
          if (spots.isNotEmpty && _initialCenter == null) {
            final firstSpot = spots[0];
            _initialCenter = Position(firstSpot.longitude, firstSpot.latitude);
            _hasInitialCenter = true;
            print(
                '✅ 从API加载的第一个地点设置初始中心: (${firstSpot.longitude}, ${firstSpot.latitude})',);
          }

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
      // 如果还没有初始中心，使用第一个地点的坐标
      if (_initialCenter == null) {
        _initialCenter =
            Position(_citySpots[0].longitude, _citySpots[0].latitude);
        _hasInitialCenter = true;
        print(
            '✅ 从mock数据设置初始中心: (${_citySpots[0].longitude}, ${_citySpots[0].latitude})',);
      }
    }
  }

  /// 解析标签列表 - 支持对象数组格式 [{en, zh, kind, id, priority}]
  List<String> _parseTagsList(dynamic value) {
    if (value == null) return [];
    if (value is List) {
      final List<String> result = [];
      for (final item in value) {
        if (item is Map<String, dynamic>) {
          // 新格式：对象数组，提取 en 字段
          final en = item['en'] as String?;
          if (en != null && en.isNotEmpty) {
            result.add(en);
          }
        } else if (item != null) {
          // 旧格式：字符串数组，直接使用
          final str = item.toString();
          if (str.isNotEmpty) {
            result.add(str);
          }
        }
      }
      return result;
    }
    if (value is String) {
      try {
        final decoded = jsonDecode(value);
        if (decoded is List) {
          return _parseTagsList(decoded);
        }
      } catch (_) {}
    }
    return [];
  }

  // 需要过滤的旧标签（不再使用的通用标签）
  static const _filteredTags = {'place', 'landmark'};

  /// 计算展示标签：优先使用后端返回的 displayTagsEn，否则从 category + tags + aiTags 计算
  /// 与 PublicPlaceDto._computeDisplayTags 逻辑一致
  /// 过滤掉旧的通用标签（如 "place", "landmark"）
  List<String> _computeDisplayTags(Map<String, dynamic> spotData) {
    print('🏷️ [_computeDisplayTags] spotData keys: ${spotData.keys}');
    print(
        '🏷️ [_computeDisplayTags] displayTagsEn from backend: ${spotData['displayTagsEn']}',);

    // 优先使用后端已经计算好的 displayTagsEn（后端已经过滤了旧标签）
    final backendDisplayTags = spotData['displayTagsEn'];
    if (backendDisplayTags is List && backendDisplayTags.isNotEmpty) {
      final result = backendDisplayTags
          .map((e) => e?.toString() ?? '')
          .where(
              (s) => s.isNotEmpty && !_filteredTags.contains(s.toLowerCase()),)
          .take(4)
          .toList();
      if (result.isNotEmpty) {
        print('🏷️ [_computeDisplayTags] using backend displayTagsEn: $result');
        return result;
      }
    }

    // 回退：从 category + tags + aiTags 计算
    final result = <String>[];
    final seen = <String>{};

    print('🏷️ [_computeDisplayTags] category: ${spotData['category']}');
    print('🏷️ [_computeDisplayTags] categoryEn: ${spotData['categoryEn']}');
    print(
        '🏷️ [_computeDisplayTags] tags: ${spotData['tags']} (${spotData['tags']?.runtimeType})',);
    print('🏷️ [_computeDisplayTags] aiTags: ${spotData['aiTags']}');
    print('🏷️ [_computeDisplayTags] ai_tags: ${spotData['ai_tags']}');

    // 1. 添加 category
    final category = spotData['categoryEn']?.toString() ??
        spotData['category_en']?.toString() ??
        spotData['category']?.toString();
    if (category != null && category.isNotEmpty) {
      result.add(category);
      seen.add(category.toLowerCase());
    }

    // 2. 添加结构化标签（tags 字段可能是 Map 或 List 格式，过滤掉旧的通用标签）
    final rawTags = spotData['tags'];
    if (rawTags is Map) {
      for (final entry in rawTags.entries) {
        if (result.length >= 4) break;
        final value = entry.value;
        if (value is List) {
          for (final v in value) {
            if (result.length >= 4) break;
            final tag = v?.toString() ?? '';
            final tagLower = tag.toLowerCase();
            if (tag.isNotEmpty &&
                !seen.contains(tagLower) &&
                !_filteredTags.contains(tagLower)) {
              result.add(tag);
              seen.add(tagLower);
            }
          }
        } else if (value is String && value.isNotEmpty) {
          final valueLower = value.toLowerCase();
          if (!seen.contains(valueLower) &&
              !_filteredTags.contains(valueLower)) {
            result.add(value);
            seen.add(valueLower);
          }
        }
      }
    } else if (rawTags is List) {
      // tags 已经是 List 格式
      for (final tag in rawTags) {
        if (result.length >= 4) break;
        String tagStr = '';
        if (tag is Map) {
          tagStr = tag['en']?.toString() ?? '';
        } else if (tag is String) {
          tagStr = tag;
        }
        final tagLower = tagStr.toLowerCase();
        if (tagStr.isNotEmpty &&
            !seen.contains(tagLower) &&
            !_filteredTags.contains(tagLower)) {
          result.add(tagStr);
          seen.add(tagLower);
        }
      }
    }

    // 3. 添加 aiTags（过滤掉旧的通用标签）
    final aiTags = _parseTagsList(spotData['aiTags'] ?? spotData['ai_tags']);
    for (final tag in aiTags) {
      if (result.length >= 4) break;
      final tagLower = tag.toLowerCase();
      if (!seen.contains(tagLower) && !_filteredTags.contains(tagLower)) {
        result.add(tag);
        seen.add(tagLower);
      }
    }

    print('🏷️ [_computeDisplayTags] computed result: $result');
    return result;
  }

  /// 解析图片列表 - 支持字符串数组和 JSON 字符串
  List<String> _parseImagesList(dynamic value) {
    if (value == null) return [];
    if (value is List) {
      final List<String> result = [];
      for (final item in value) {
        if (item != null) {
          final str = item.toString();
          if (str.isNotEmpty) {
            result.add(str);
          }
        }
      }
      return result;
    }
    if (value is String) {
      try {
        final decoded = jsonDecode(value);
        if (decoded is List) {
          return _parseImagesList(decoded);
        }
      } catch (_) {}
    }
    return [];
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
    // 优先使用已计算的初始中心（从第一个地点）
    if (_initialCenter != null) {
      return _initialCenter!;
    }

    // 如果有 spots，计算 bounding box 中心点（确保 markers 居中显示）
    if (_citySpots.isNotEmpty) {
      if (_citySpots.length == 1) {
        final center =
            Position(_citySpots.first.longitude, _citySpots.first.latitude);
        // 缓存初始中心，避免后续重新计算
        _initialCenter = center;
        _hasInitialCenter = true;
        return center;
      }

      double minLat = _citySpots.first.latitude;
      double maxLat = _citySpots.first.latitude;
      double minLng = _citySpots.first.longitude;
      double maxLng = _citySpots.first.longitude;

      for (final spot in _citySpots) {
        if (spot.latitude < minLat) minLat = spot.latitude;
        if (spot.latitude > maxLat) maxLat = spot.latitude;
        if (spot.longitude < minLng) minLng = spot.longitude;
        if (spot.longitude > maxLng) maxLng = spot.longitude;
      }

      final center = Position(
        (minLng + maxLng) / 2,
        (minLat + maxLat) / 2,
      );
      // 缓存初始中心
      _initialCenter = center;
      _hasInitialCenter = true;
      return center;
    }

    // 否则使用城市坐标
    final cityKey = _cityCoordinates.keys.firstWhere(
      (key) => key.toLowerCase() == widget.city.toLowerCase(),
      orElse: () => '',
    );

    if (cityKey.isNotEmpty) {
      final center = _cityCoordinates[cityKey]!;
      _initialCenter = center;
      _hasInitialCenter = true;
      return center;
    }

    // 最后才默认返回 Copenhagen（不应该到达这里，因为 build() 中已经检查了 _hasInitialCenter）
    final fallback = _cityCoordinates['Copenhagen']!;
    _initialCenter = fallback;
    _hasInitialCenter = true;
    return fallback;
  }

  @override
  Widget build(BuildContext context) {
    // 如果还没有确定初始中心点，显示加载状态，避免先显示哥本哈根再跳转
    if (!_hasInitialCenter && _initialCenter == null) {
      return WillPopScope(
        onWillPop: () async {
          _handleBack();
          return false;
        },
        child: Scaffold(
          resizeToAvoidBottomInset: false,
          body: Stack(
            children: [
              // 显示加载状态
              ColoredBox(
                color: Colors.white,
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const SizedBox(
                        width: 48,
                        height: 48,
                        child: CircularProgressIndicator(
                          strokeWidth: 3,
                          valueColor:
                              AlwaysStoppedAnimation<Color>(AppTheme.black),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Loading collection…',
                        style: AppTheme.bodyLarge(context),
                      ),
                    ],
                  ),
                ),
              ),
              // 顶部导航栏
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: _buildAppBar(),
              ),
            ],
          ),
        ),
      );
    }

    final cityCenter = _getCityCenter();

    return WillPopScope(
      onWillPop: () async {
        _handleBack();
        return false;
      },
      child: Scaffold(
        resizeToAvoidBottomInset: false,
        body: Stack(
          children: [
            // 全屏地图 - 只有在确定了初始中心后才显示
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
                  if (_hasMeta)
                    _CollectionMetaCard(
                      description: widget.description,
                      people: widget.people,
                      works: widget.works,
                    ),
                ],
              ),
            ),

            // 底部地点卡片滑动列表
            if (_citySpots.isNotEmpty && !_isExiting)
              Positioned(
                key: const ValueKey('bottom-cards'),
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

  void _showSpotDetail(map_page.Spot spot) async {
    final now = DateTime.now();

    // 防抖：如果是同一个地点且点击间隔小于1秒，则忽略
    if (_lastClickedSpotId == spot.id &&
        _lastClickTime != null &&
        now.difference(_lastClickTime!).inMilliseconds < 1000) {
      print(
          '🔧 [collection_spots_map_page.dart] Debouncing rapid clicks for ${spot.name}',);
      return;
    }

    _lastClickedSpotId = spot.id;
    _lastClickTime = now;

    // 添加调试日志
    print(
        '🔧 [collection_spots_map_page.dart] _showSpotDetail for spot: ${spot.name}',);

    // 加载地点的状态信息（包括 check-in 数据）
    bool? isSaved;
    bool? isMustGo;
    bool? isTodaysPlan;
    bool? isVisited;
    DateTime? visitDate;
    int? userRating;
    String? userNotes;
    List<String>? userPhotos;
    String? destinationId;

    try {
      final authState = ref.read(authProvider);
      if (authState.isAuthenticated) {
        // 先显示loading indicator
        if (mounted) {
          showDialog<void>(
            context: context,
            barrierDismissible: false,
            builder: (context) => const Center(
              child: CircularProgressIndicator(color: AppTheme.primaryYellow),
            ),
          );
        }

        // 等待可能正在进行的收藏/取消收藏操作完成
        await WishlistStatusCache.awaitPendingOperation(spot.id);
        if (spot.name.isNotEmpty) {
          await WishlistStatusCache.awaitPendingOperation(spot.name);
        }

        final tripRepo = ref.read(tripRepositoryProvider);
        final trips = await tripRepo.getMyTrips().timeout(
              const Duration(seconds: 2),
              onTimeout: () => <Trip>[],
            );

        // 查找包含这个 spot 的 trip
        for (final trip in trips) {
          // 优先使用 getMyTrips 已包含的 tripSpots，避免额外请求
          List<TripSpot> tripSpots = trip.tripSpots ?? [];
          if (tripSpots.isEmpty) {
            final tripDetail = await tripRepo.getTripById(trip.id);
            tripSpots = tripDetail.tripSpots ?? [];
          }

          for (final ts in tripSpots) {
            // 匹配逻辑：优先匹配 spotId / googlePlaceId，其次 name+city
            final tsSpot = ts.spot;
            bool isMatch = false;
            if (ts.spotId == spot.id) {
              isMatch = true;
            } else if (tsSpot?.id == spot.id) {
              isMatch = true;
            } else if (tsSpot?.googlePlaceId != null &&
                tsSpot?.googlePlaceId == spot.id) {
              isMatch = true;
            } else if (tsSpot?.name != null && spot.name.isNotEmpty) {
              final sameName = tsSpot!.name.trim().toLowerCase() ==
                  spot.name.trim().toLowerCase();
              final sameCity = (tsSpot.city ?? '').trim().toLowerCase() ==
                  spot.city.trim().toLowerCase();
              if (sameName && (spot.city.isEmpty || sameCity)) {
                isMatch = true;
              }
            }

            if (isMatch) {
              isSaved = ts.isSaved == true;
              isMustGo = ts.isMustGo == true;
              isTodaysPlan = ts.isTodaysPlan == true;
              isVisited = ts.isVisited == true;
              visitDate = ts.visitDate;
              userRating = ts.userRating;
              userNotes = ts.userNotes;
              userPhotos = ts.userPhotos?.cast<String>();
              destinationId = trip.id;
              break;
            }
          }
          if (isSaved != null) break;
        }

        // 💾 保存到缓存供后续使用
        WishlistStatusCache.updateFullStatus(
          spot.id,
          destinationId: destinationId,
          isSaved: isSaved ?? false,
          isMustGo: isMustGo,
          isTodaysPlan: isTodaysPlan,
          isVisited: isVisited,
          visitDate: visitDate,
          userRating: userRating,
          userNotes: userNotes,
          userPhotos: userPhotos,
        );
        if (spot.name.isNotEmpty) {
          WishlistStatusCache.updateFullStatus(
            spot.name,
            destinationId: destinationId,
            isSaved: isSaved ?? false,
            isMustGo: isMustGo,
            isTodaysPlan: isTodaysPlan,
            isVisited: isVisited,
            visitDate: visitDate,
            userRating: userRating,
            userNotes: userNotes,
            userPhotos: userPhotos,
          );
        }

        // 关闭loading dialog
        if (mounted && Navigator.canPop(context)) {
          Navigator.pop(context);
        }
      }
    } catch (e) {
      print('❌ [collection_spots_map_page.dart] Error loading status: $e');
      // 关闭loading dialog
      if (mounted && Navigator.canPop(context)) {
        Navigator.pop(context);
      }
      // 失败时使用缓存
      SpotStatusData? fullStatus = WishlistStatusCache.getFullStatus(spot.id);
      if (fullStatus == null && spot.name.isNotEmpty) {
        fullStatus = WishlistStatusCache.getFullStatus(spot.name);
      }
      isSaved = fullStatus?.isSaved ?? fullStatus?.destinationId != null;
      isMustGo = fullStatus?.isMustGo;
      isTodaysPlan = fullStatus?.isTodaysPlan;
      isVisited = fullStatus?.isVisited;
      visitDate = fullStatus?.visitDate;
      userRating = fullStatus?.userRating;
      userNotes = fullStatus?.userNotes;
      userPhotos = fullStatus?.userPhotos;
      destinationId = fullStatus?.destinationId;
    }

    // 添加调试日志
    print('🔧 [collection_spots_map_page.dart] Data loaded for ${spot.name}:');
    print('🔧 [collection_spots_map_page.dart] isSaved: $isSaved');
    print('🔧 [collection_spots_map_page.dart] isMustGo: $isMustGo');
    print('🔧 [collection_spots_map_page.dart] isTodaysPlan: $isTodaysPlan');
    print('🔧 [collection_spots_map_page.dart] isVisited: $isVisited');
    print('🔧 [collection_spots_map_page.dart] visitDate: $visitDate');
    print('🔧 [collection_spots_map_page.dart] userRating: $userRating');
    print('🔧 [collection_spots_map_page.dart] userNotes: $userNotes');
    print(
        '🔧 [collection_spots_map_page.dart] userPhotos: ${userPhotos?.length ?? 0} photos',);
    print('🔧 [collection_spots_map_page.dart] destinationId: $destinationId');

    if (!mounted) return;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => UnifiedSpotDetailModal(
        spot: spot,
        hideCollectionEntry: true,
        useCollectionCover: true,
        initialIsSaved: isSaved,
        initialIsMustGo: isMustGo,
        initialIsTodaysPlan: isTodaysPlan,
        initialIsVisited: isVisited,
        initialVisitDate: visitDate,
        initialUserRating: userRating,
        initialUserNotes: userNotes,
        initialUserPhotos: userPhotos,
        initialDestinationId: destinationId,
        onStatusChanged: (spotId,
            {isMustGo,
            isTodaysPlan,
            isVisited,
            isRemoved,
            needsReload,
            visitDate,
            userRating,
            userNotes,
            userPhotos,
            destinationId,}) {
          // 标记需要刷新合集数据
          _shouldRefreshCollections = true;
        },
      ),
    );
  }

  void _handleBack() {
    // 标记正在退出，防止卡片滑动
    setState(() => _isExiting = true);
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
            onPressed: _showShareSheet,
            backgroundColor: Colors.white,
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
    const double cardWidth = 210;
    const double cardHeight = 280; // 宽:高 = 3:4

    return SizedBox(
      height: cardHeight + 8, // 固定高度 + 阴影空间
      child: PageView.builder(
        controller: _cardPageController,
        padEnds: true,
        clipBehavior: Clip.none,
        itemCount: _citySpots.length,
        itemBuilder: (context, index) {
          final spot = _citySpots[index];
          final isCenter = index == _currentCardIndex;

          return AnimatedScale(
            key: ValueKey('card-${spot.id}'),
            scale: isCenter ? 1.0 : 0.9,
            duration: const Duration(milliseconds: 220),
            child: Center(
              child: SizedBox(
                height: cardHeight,
                width: cardWidth,
                child: _BottomSpotCard(
                  key: ValueKey('spot-card-${spot.id}'),
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

  void _showShareSheet() {
    final collectionId = widget.collectionId;
    if (collectionId == null) return;

    // 构建分享链接
    final shareUrl = 'https://vago.to/collection/$collectionId';

    ShareBottomSheet.show(
      context,
      shareData: ShareData(
        title: widget.collectionTitle,
        url: shareUrl,
        description: widget.description,
        imageUrl: widget.coverImage,
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

    final l10n = AppLocalizations(ref.read(localeProvider).languageCode);
    setState(() => _isFavLoading = true);
    final repo = ref.read(collectionRepositoryProvider);
    try {
      if (_isFavorite) {
        await repo.unfavoriteCollection(collectionId);
        if (mounted) {
          _shouldRefreshCollections = true;
          setState(() => _isFavorite = false);
          CustomToast.showInfo(context, l10n.collectionRemoved);
        }
      } else {
        await repo.favoriteCollection(collectionId);
        if (mounted) {
          _shouldRefreshCollections = true;
          setState(() => _isFavorite = true);
          CustomToast.showSuccess(context, l10n.collectionSaved);
        }
      }
    } catch (e, stackTrace) {
      debugPrint('❌ Favorite collection error: $e');
      debugPrint('❌ Stack trace: $stackTrace');
      if (mounted) {
        CustomToast.showError(context, l10n.operationFailed);
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
class _BottomSpotCard extends StatefulWidget {
  const _BottomSpotCard({
    required this.spot,
    required this.onTap,
    super.key,
  });

  final map_page.Spot spot;
  final VoidCallback onTap;

  @override
  State<_BottomSpotCard> createState() => _BottomSpotCardState();
}

class _BottomSpotCardState extends State<_BottomSpotCard> {
  Color _dominantColor = Colors.black;

  /// 获取有效的封面图：优先使用合集封面图，fallback 到普通封面图
  String get _effectiveCoverImage {
    final collectionCover = widget.spot.collectionCoverImage;
    if (collectionCover != null && collectionCover.isNotEmpty) {
      return collectionCover;
    }
    return widget.spot.coverImage;
  }

  @override
  void initState() {
    super.initState();
    _extractDominantColor();
  }

  @override
  void didUpdateWidget(_BottomSpotCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    final oldCover =
        oldWidget.spot.collectionCoverImage ?? oldWidget.spot.coverImage;
    final newCover = widget.spot.collectionCoverImage ?? widget.spot.coverImage;
    if (oldCover != newCover) {
      _extractDominantColor();
    }
  }

  Future<void> _extractDominantColor() async {
    final coverImage = _effectiveCoverImage;
    if (coverImage.isEmpty) return;

    try {
      final ImageProvider imageProvider;
      if (coverImage.startsWith('data:image/')) {
        imageProvider = MemoryImage(_decodeBase64Image(coverImage));
      } else {
        imageProvider = NetworkImage(coverImage);
      }

      final paletteGenerator = await PaletteGenerator.fromImageProvider(
        imageProvider,
        size: const ui.Size(100, 100),
        maximumColorCount: 5,
      );

      if (mounted) {
        setState(() {
          // 使用 ColorUtils 获取较深的主色，排除白色和浅色
          _dominantColor = ColorUtils.getDarkDominantColor(
            paletteGenerator,
            fallback: Colors.black,
          );
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _dominantColor = Colors.black);
      }
    }
  }

  List<String> _effectiveTags() {
    if (widget.spot.tags.isNotEmpty) return widget.spot.tags;
    if (widget.spot.category.trim().isNotEmpty) return [widget.spot.category];
    return const [];
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
        onTap: widget.onTap,
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
                // 底部渐变蒙层 - 使用提取的主色，高度约为卡片一半
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: Container(
                    height: 140, // 卡片高度 280 的一半
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
                Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Spacer(),
                      Text(
                        widget.spot.name,
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
                        rating: widget.spot.rating,
                        ratingCount: widget.spot.ratingCount,
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
    const placeholder = VagoPlaceholderSmall();
    final coverImage = _effectiveCoverImage;

    if (coverImage.isEmpty) {
      return placeholder;
    }

    if (coverImage.startsWith('data:image/')) {
      final data = _decodeBase64Image(coverImage);
      if (data.isEmpty) return placeholder;
      return Image.memory(
        data,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => placeholder,
      );
    }

    return CachedNetworkImage(
      imageUrl: coverImage,
      fit: BoxFit.cover,
      placeholder: (_, __) => const Center(
        child: SizedBox(
          width: 24,
          height: 24,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
      errorWidget: (_, url, error) => placeholder,
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
    // 没有评分时不显示任何内容
    final hasRating = rating > 0;
    if (!hasRating && ratingCount <= 0) {
      return const SizedBox.shrink();
    }

    return Row(
      children: [
        const Icon(
          Icons.star,
          color: AppTheme.primaryYellow,
          size: 18,
        ),
        const SizedBox(width: 6),
        Text(
          rating.toStringAsFixed(1),
          style: AppTheme.bodyMedium(context).copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
        if (ratingCount > 0) ...[
          const SizedBox(width: 8),
          Text(
            formatRatingCount(ratingCount),
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

  /// 安全解析 people 或 works 字段（可能是 List、JSON 字符串或 null）
  static List<LinkItem> parseList(dynamic value, {bool isPeople = true}) {
    if (value == null) return [];

    List<dynamic> list;

    if (value is List) {
      list = value;
    } else if (value is String) {
      if (value.isEmpty) return [];
      try {
        final decoded = jsonDecode(value);
        if (decoded is List) {
          list = decoded;
        } else {
          return [];
        }
      } catch (e) {
        return [];
      }
    } else {
      return [];
    }

    return list
        .map((item) {
          if (item is! Map) return null;
          final map = item as Map<String, dynamic>;
          // 处理 link 字段：空字符串视为 null
          final link = map['link'] as String?;
          final effectiveLink = (link != null && link.isNotEmpty) ? link : null;
          // 处理 avatarUrl 字段：支持 avatarUrl 和 avatar_url 两种格式，也支持 base64
          final String? avatarUrl =
              (map['avatarUrl'] as String?) ?? (map['avatar_url'] as String?);
          // Debug log
          if (isPeople && avatarUrl != null) {
            print(
                '🖼️ [LinkItem] avatarUrl found: ${avatarUrl.substring(0, avatarUrl.length > 50 ? 50 : avatarUrl.length)}...',);
          }
          return LinkItem(
            name: map['name'] as String? ?? '',
            link: effectiveLink,
            avatarUrl: isPeople ? avatarUrl : null,
            coverImage: isPeople ? null : map['coverImage'] as String?,
          );
        })
        .whereType<LinkItem>()
        .where((item) => item.name.isNotEmpty)
        .toList();
  }
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
    final languageCode = Localizations.localeOf(context).languageCode;
    final l10n = AppLocalizations(languageCode);

    return GestureDetector(
      onTap: url == null
          ? null
          : () async {
              DialogUtils.showInfoSnackBar(context, l10n.opening(url!));
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

/// 合集元信息卡片 - 独立组件，状态变化不影响父组件
class _CollectionMetaCard extends StatefulWidget {
  const _CollectionMetaCard({
    this.description,
    this.people = const [],
    this.works = const [],
  });

  final String? description;
  final List<LinkItem> people;
  final List<LinkItem> works;

  @override
  State<_CollectionMetaCard> createState() => _CollectionMetaCardState();
}

class _CollectionMetaCardState extends State<_CollectionMetaCard> {
  bool _isExpanded = false;
  // 缓存头像 widget，避免滑动卡片时重建导致闪动
  final Map<String, Widget> _avatarCache = {};

  bool get _hasMeta =>
      (widget.description?.isNotEmpty ?? false) ||
      widget.people.isNotEmpty ||
      widget.works.isNotEmpty;

  int get _metaLineCount {
    int count = 0;
    if (widget.description?.isNotEmpty ?? false) count++;
    if (widget.people.isNotEmpty) count++;
    if (widget.works.isNotEmpty) count++;
    return count;
  }

  @override
  void didUpdateWidget(_CollectionMetaCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    // 如果 people 列表变化了，清除头像缓存
    if (oldWidget.people.length != widget.people.length ||
        oldWidget.people.any((p) => !widget.people
            .any((wp) => wp.name == p.name && wp.avatarUrl == p.avatarUrl),)) {
      _avatarCache.clear();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_hasMeta) return const SizedBox.shrink();

    final hasDesc = widget.description?.isNotEmpty ?? false;
    final hasPeople = widget.people.isNotEmpty;
    final hasWorks = widget.works.isNotEmpty;
    final needsExpand = _metaLineCount > 1 ||
        widget.people.length > 1 ||
        widget.works.length > 1;

    // 构建内容列表 - 优先级：描述 > 作品 > 人物
    final List<Widget> contentItems = [];

    if (hasDesc) {
      contentItems.add(_buildDescriptionRow(widget.description!));
    }
    if (hasWorks) {
      contentItems.add(_buildWorkRow(widget.works.first));
    }
    if (hasPeople) {
      contentItems.add(_buildPersonRow(widget.people.first));
    }

    // 展开状态下显示所有作品和人物
    final List<Widget> expandedItems = [];
    if (_isExpanded) {
      for (int i = 1; i < widget.works.length; i++) {
        expandedItems.add(_buildWorkRow(widget.works[i]));
      }
      for (int i = 1; i < widget.people.length; i++) {
        expandedItems.add(_buildPersonRow(widget.people[i]));
      }
    }

    return AnimatedSize(
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeInOut,
      alignment: Alignment.topCenter,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
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
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: contentItems.isNotEmpty
                      ? contentItems.first
                      : const SizedBox.shrink(),
                ),
                if (needsExpand)
                  GestureDetector(
                    onTap: () => setState(() => _isExpanded = !_isExpanded),
                    child: Padding(
                      padding: const EdgeInsets.only(left: 8),
                      child: AnimatedRotation(
                        turns: _isExpanded ? 0.5 : 0,
                        duration: const Duration(milliseconds: 200),
                        child: const Icon(
                          Icons.keyboard_arrow_down,
                          size: 22,
                          color: AppTheme.darkGray,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            if (_isExpanded) ...[
              if (contentItems.length > 1) ...[
                const SizedBox(height: 12),
                ...contentItems
                    .skip(1)
                    .expand((w) => [w, const SizedBox(height: 12)])
                    .take(contentItems.length * 2 - 3),
              ],
              if (expandedItems.isNotEmpty) ...[
                const SizedBox(height: 12),
                ...expandedItems
                    .expand((w) => [w, const SizedBox(height: 12)])
                    .take(expandedItems.length * 2 - 1),
              ],
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildPersonRow(LinkItem person) {
    final hasLink = person.link != null && person.link!.isNotEmpty;
    final hasAvatar = person.avatarUrl?.isNotEmpty ?? false;

    // 使用缓存键：person.name + avatarUrl（如果有）
    final cacheKey = hasAvatar
        ? '${person.name}_${person.avatarUrl}'
        : '${person.name}_default';

    // 从缓存获取或创建头像 widget
    final Widget avatarWidget = _avatarCache.putIfAbsent(cacheKey, () {
      if (hasAvatar) {
        final url = person.avatarUrl!;
        if (url.startsWith('data:image')) {
          // Base64 图片
          try {
            final base64Data = url.split(',').last;
            final bytes = base64Decode(base64Data);
            return Image.memory(
              bytes,
              fit: BoxFit.cover,
              width: 20,
              height: 20,
              errorBuilder: (_, __, ___) => _buildDefaultAvatar(),
            );
          } catch (e) {
            return _buildDefaultAvatar();
          }
        } else {
          // 普通 URL
          String compressedUrl = url;
          if (url.contains('supabase') || url.contains('storage')) {
            compressedUrl = url.contains('?')
                ? '$url&width=48&height=48'
                : '$url?width=48&height=48';
          }
          return CachedNetworkImage(
            imageUrl: compressedUrl,
            fit: BoxFit.cover,
            memCacheWidth: 48,
            memCacheHeight: 48,
            placeholder: (_, __) => _buildDefaultAvatar(),
            errorWidget: (_, __, ___) => _buildDefaultAvatar(),
          );
        }
      } else {
        return _buildDefaultAvatar();
      }
    });

    return GestureDetector(
      onTap: hasLink ? () => _openLink(person.link!) : null,
      child: Row(
        children: [
          // 使用 RepaintBoundary 包裹头像，避免不必要的重绘
          RepaintBoundary(
            child: SizedBox(
              width: 20,
              height: 20,
              child: ClipOval(child: avatarWidget),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              person.name,
              style: AppTheme.bodyMedium(context).copyWith(
                fontSize: 14,
                fontWeight: FontWeight.w400,
                color: AppTheme.black,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (hasLink)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Profile',
                  style: AppTheme.bodyMedium(context).copyWith(
                    fontSize: 14,
                    fontWeight: FontWeight.w400,
                    color: AppTheme.darkGray,
                  ),
                ),
                const SizedBox(width: 2),
                const Icon(
                  Icons.arrow_forward_ios,
                  size: 10,
                  color: AppTheme.darkGray,
                ),
              ],
            ),
        ],
      ),
    );
  }

  Widget _buildDefaultAvatar() => ColoredBox(
        color: AppTheme.lightGray,
        child: const Icon(
          Icons.person,
          size: 12,
          color: AppTheme.mediumGray,
        ),
      );

  Widget _buildWorkRow(LinkItem work) => GestureDetector(
        onTap: work.link != null ? () => _openLink(work.link!) : null,
        child: Row(
          children: [
            const SizedBox(
              width: 20,
              child: Text('🎬', style: TextStyle(fontSize: 14)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                work.name,
                style: AppTheme.bodyMedium(context).copyWith(
                  fontSize: 14,
                  fontWeight: FontWeight.w400,
                  color: AppTheme.black,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (work.link != null)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Details',
                    style: AppTheme.bodyMedium(context).copyWith(
                      fontSize: 14,
                      fontWeight: FontWeight.w400,
                      color: AppTheme.darkGray,
                    ),
                  ),
                  const SizedBox(width: 2),
                  const Icon(
                    Icons.arrow_forward_ios,
                    size: 10,
                    color: AppTheme.darkGray,
                  ),
                ],
              ),
          ],
        ),
      );

  Widget _buildDescriptionRow(String description) => Text(
        description,
        style: AppTheme.bodyMedium(context).copyWith(
          fontSize: 14,
          fontWeight: FontWeight.w400,
          color: AppTheme.black.withOpacity(0.75),
        ),
        maxLines: _isExpanded ? null : 1,
        overflow: _isExpanded ? TextOverflow.visible : TextOverflow.ellipsis,
      );

  Future<void> _openLink(String url) async {
    final languageCode = Localizations.localeOf(context).languageCode;
    final l10n = AppLocalizations(languageCode);

    try {
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        if (mounted) {
          CustomToast.showError(context, l10n.cannotOpenLink);
        }
      }
    } catch (e) {
      if (mounted) {
        CustomToast.showError(context, l10n.invalidLinkFormat);
      }
    }
  }
}
