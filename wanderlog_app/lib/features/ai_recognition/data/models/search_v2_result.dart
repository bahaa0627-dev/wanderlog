/// SearchV2 响应模型
/// 
/// 对应后端 /places/ai/search-v2 API 的响应结构
/// Requirements: 3.5, 9.1

import 'package:flutter/foundation.dart';

/// 搜索阶段枚举
enum SearchStage {
  analyzing,    // Stage 1: 分析用户诉求 (1s)
  searching,    // Stage 2: 正在寻找合适地点
  summarizing,  // Stage 3: 总结输出中
  complete,     // 完成
}

/// 地点来源枚举
enum PlaceSource {
  google,  // 来自 Google Places API
  cache,   // 来自数据库缓存
  ai,      // 来自 AI 生成（未验证）
}

/// 意图类型枚举
enum IntentType {
  generalSearch,       // 通用搜索（返回地点列表）
  generalSearchText,   // 通用搜索但数量不足（返回文本格式）
  specificPlace,       // 特定地点查询（返回单个地点）
  travelConsultation,  // 旅行咨询（返回文本 + 相关地点）
  nonTravel,           // 非旅行问题（返回纯文本）
}

/// SearchV2 完整响应结果
class SearchV2Result {
  SearchV2Result({
    required this.success,
    required this.acknowledgment,
    this.categories,
    required this.places,
    this.mapPlaces,
    this.cityPlaces,
    required this.overallSummary,
    required this.quotaRemaining,
    required this.stage,
    this.error,
    this.intent,
    this.textContent,
    this.identifiedPlaceName,
  });

  /// 意图类型
  final IntentType? intent;

  /// 文本内容（用于 non_travel 和 travel_consultation 意图）
  final String? textContent;
  
  /// 按城市分组的地点（用于 travel_consultation 多城市场景）
  final List<CityPlacesGroup>? cityPlaces;
  
  /// AI 识别的地点名称（用于 specific_place 意图，当用户查询模糊时）
  final String? identifiedPlaceName;

  /// 从 JSON 创建
  factory SearchV2Result.fromJson(Map<String, dynamic> json) {
    // 解析意图类型
    final intentStr = json['intent'] as String?;
    final intent = _parseIntent(intentStr);
    
    debugPrint('🔄 [SearchV2Result.fromJson] intent: $intentStr -> $intent');
    debugPrint('🔄 [SearchV2Result.fromJson] has categories: ${json['categories'] != null}');
    debugPrint('🔄 [SearchV2Result.fromJson] has textContent: ${json['textContent'] != null}');
    debugPrint('🔄 [SearchV2Result.fromJson] has acknowledgment: ${json['acknowledgment'] != null}');
    
    // 根据意图类型处理不同的响应格式
    switch (intent) {
      case IntentType.specificPlace:
        // specific_place 意图返回单个 place 对象
        // 兼容两种格式：place（后端返回）和 places（本地保存）
        final placeData = json['place'] as Map<String, dynamic>?;
        final placesData = json['places'] as List?;
        List<PlaceResult> places;
        if (placeData != null) {
          places = [PlaceResult.fromJson(placeData)];
        } else if (placesData != null && placesData.isNotEmpty) {
          places = placesData.map((e) => PlaceResult.fromJson(e as Map<String, dynamic>)).toList();
        } else {
          places = [];
        }
        final description = json['description'] as String? ?? json['acknowledgment'] as String? ?? '';
        final identifiedPlaceName = json['identifiedPlaceName'] as String?;
        
        return SearchV2Result(
          success: json['success'] as bool? ?? false,
          acknowledgment: description,
          categories: null,
          places: places,
          overallSummary: json['overallSummary'] as String? ?? '',
          quotaRemaining: json['quotaRemaining'] as int? ?? 0,
          stage: _parseStage(json['stage'] as String?),
          error: json['error'] as String?,
          intent: intent,
          textContent: null,
          identifiedPlaceName: identifiedPlaceName,
        );
        
      case IntentType.nonTravel:
        // non_travel 意图返回纯文本
        final textContent = json['textContent'] as String? ?? '';
        
        return SearchV2Result(
          success: json['success'] as bool? ?? false,
          acknowledgment: '',
          categories: null,
          places: [],
          overallSummary: '',
          quotaRemaining: json['quotaRemaining'] as int? ?? 0,
          stage: _parseStage(json['stage'] as String?),
          error: json['error'] as String?,
          intent: intent,
          textContent: textContent,
        );
        
      case IntentType.travelConsultation:
        // travel_consultation 意图返回文本 + 相关地点
        final textContent = json['textContent'] as String? ?? '';
        // 兼容两种格式：relatedPlaces（后端返回）和 places（本地保存）
        final relatedPlaces = (json['relatedPlaces'] as List?)
            ?.map((e) => PlaceResult.fromJson(e as Map<String, dynamic>))
            .toList() ?? 
            (json['places'] as List?)
            ?.map((e) => PlaceResult.fromJson(e as Map<String, dynamic>))
            .toList() ?? [];
        
        // 解析按城市分组的地点（多城市场景）
        final cityPlacesJson = json['cityPlaces'] as List?;
        List<CityPlacesGroup>? cityPlaces;
        if (cityPlacesJson != null && cityPlacesJson.isNotEmpty) {
          cityPlaces = cityPlacesJson
              .map((e) => CityPlacesGroup.fromJson(e as Map<String, dynamic>))
              .toList();
        }
        
        return SearchV2Result(
          success: json['success'] as bool? ?? false,
          acknowledgment: json['acknowledgment'] as String? ?? '',
          categories: null,
          places: relatedPlaces,
          cityPlaces: cityPlaces,
          overallSummary: json['overallSummary'] as String? ?? '',
          quotaRemaining: json['quotaRemaining'] as int? ?? 0,
          stage: _parseStage(json['stage'] as String?),
          error: json['error'] as String?,
          intent: intent,
          textContent: textContent,
        );
        
      case IntentType.generalSearch:
      default:
        // general_search 意图使用原有逻辑
        return SearchV2Result(
          success: json['success'] as bool? ?? false,
          acknowledgment: json['acknowledgment'] as String? ?? '',
          categories: json['categories'] != null
              ? (json['categories'] as List)
                  .map((e) => CategoryGroup.fromJson(e as Map<String, dynamic>))
                  .toList()
              : null,
          places: (json['places'] as List?)
                  ?.map((e) => PlaceResult.fromJson(e as Map<String, dynamic>))
                  .toList() ??
              [],
          mapPlaces: (json['mapPlaces'] as List?)
                  ?.map((e) => PlaceResult.fromJson(e as Map<String, dynamic>))
                  .toList(),
          overallSummary: json['overallSummary'] as String? ?? '',
          quotaRemaining: json['quotaRemaining'] as int? ?? 0,
          stage: _parseStage(json['stage'] as String?),
          error: json['error'] as String?,
          intent: intent,
          textContent: json['textContent'] as String?,
        );
    }
  }
  
  /// 解析意图类型
  static IntentType _parseIntent(String? intent) {
    switch (intent) {
      case 'specific_place':
        return IntentType.specificPlace;
      case 'non_travel':
        return IntentType.nonTravel;
      case 'travel_consultation':
        return IntentType.travelConsultation;
      case 'general_search_text':
        return IntentType.generalSearchText;
      case 'general_search':
      default:
        return IntentType.generalSearch;
    }
  }

  /// 请求是否成功
  final bool success;

  /// AI 承接文案（解释推荐思路）
  final String acknowledgment;

  /// 分类结果（可选，由 AI 决定是否分类）
  final List<CategoryGroup>? categories;

  /// 无分类时的平铺结果（最多 5 个）
  final List<PlaceResult> places;

  /// 地图页可额外展示的地点（可选，通常比 places 更多）
  final List<PlaceResult>? mapPlaces;

  /// 总结 summary（包含友好的结束语）
  final String overallSummary;

  /// 剩余搜索次数
  final int quotaRemaining;

  /// 当前搜索阶段
  final SearchStage stage;

  /// 错误信息（如果有）
  final String? error;

  /// 是否有分类
  bool get hasCategories => categories != null && categories!.isNotEmpty;
  
  /// 是否是文本响应（non_travel、travel_consultation 或 general_search_text）
  bool get isTextResponse => intent == IntentType.nonTravel || 
                             intent == IntentType.travelConsultation ||
                             intent == IntentType.generalSearchText;
  
  /// 是否是特定地点查询
  bool get isSpecificPlace => intent == IntentType.specificPlace;

  /// 获取所有地点（包括分类中的）
  List<PlaceResult> get allPlaces {
    // 如果后端提供了 mapPlaces，优先用于地图展示
    if (mapPlaces != null && mapPlaces!.isNotEmpty) {
      return mapPlaces!;
    }
    if (hasCategories) {
      return categories!.expand((cat) => cat.places).toList();
    }
    return places;
  }

  /// 转换为 JSON
  Map<String, dynamic> toJson() {
    // 将 IntentType 枚举转换为后端格式的字符串
    String? intentStr;
    if (intent != null) {
      switch (intent!) {
        case IntentType.generalSearch:
          intentStr = 'general_search';
          break;
        case IntentType.generalSearchText:
          intentStr = 'general_search_text';
          break;
        case IntentType.specificPlace:
          intentStr = 'specific_place';
          break;
        case IntentType.travelConsultation:
          intentStr = 'travel_consultation';
          break;
        case IntentType.nonTravel:
          intentStr = 'non_travel';
          break;
      }
    }
    
    debugPrint('💾 [SearchV2Result.toJson] intent: $intentStr');
    debugPrint('💾 [SearchV2Result.toJson] categories: ${categories?.length ?? 0}');
    debugPrint('💾 [SearchV2Result.toJson] places: ${places.length}');
    debugPrint('💾 [SearchV2Result.toJson] textContent: ${textContent?.isNotEmpty ?? false}');
    debugPrint('💾 [SearchV2Result.toJson] acknowledgment: ${acknowledgment.isNotEmpty}');
    
    return {
      'success': success,
      'acknowledgment': acknowledgment,
      'categories': categories?.map((e) => e.toJson()).toList(),
      'places': places.map((e) => e.toJson()).toList(),
      'mapPlaces': mapPlaces?.map((e) => e.toJson()).toList(),
      'cityPlaces': cityPlaces?.map((e) => e.toJson()).toList(),
      'overallSummary': overallSummary,
      'quotaRemaining': quotaRemaining,
      'stage': stage.name,
      'error': error,
      'intent': intentStr,
      'textContent': textContent,
      'identifiedPlaceName': identifiedPlaceName,
    };
  }

  /// 解析搜索阶段
  static SearchStage _parseStage(String? stage) {
    switch (stage) {
      case 'analyzing':
        return SearchStage.analyzing;
      case 'searching':
        return SearchStage.searching;
      case 'summarizing':
        return SearchStage.summarizing;
      case 'complete':
        return SearchStage.complete;
      default:
        return SearchStage.complete;
    }
  }

  /// 创建空结果
  factory SearchV2Result.empty() {
    return SearchV2Result(
      success: false,
      acknowledgment: '',
      places: [],
      overallSummary: '',
      quotaRemaining: 0,
      stage: SearchStage.complete,
      intent: null,
      textContent: null,
    );
  }

  /// 创建错误结果
  factory SearchV2Result.error(String errorMessage) {
    return SearchV2Result(
      success: false,
      acknowledgment: '',
      places: [],
      overallSummary: '',
      quotaRemaining: 0,
      stage: SearchStage.complete,
      error: errorMessage,
      intent: null,
      textContent: null,
    );
  }
}

/// 分类组
class CategoryGroup {
  CategoryGroup({
    required this.title,
    required this.places,
  });

  /// 从 JSON 创建
  factory CategoryGroup.fromJson(Map<String, dynamic> json) {
    return CategoryGroup(
      title: json['title'] as String? ?? '',
      places: (json['places'] as List?)
              ?.map((e) => PlaceResult.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }

  /// 分类标题（如 "精品咖啡"、"小众博物馆"）
  final String title;

  /// 该分类下的地点（2-5 个）
  final List<PlaceResult> places;

  /// 转换为 JSON
  Map<String, dynamic> toJson() {
    return {
      'title': title,
      'places': places.map((e) => e.toJson()).toList(),
    };
  }
}

/// 城市地点分组（用于 travel_consultation 多城市场景）
class CityPlacesGroup {
  CityPlacesGroup({
    required this.city,
    required this.places,
  });

  /// 从 JSON 创建
  factory CityPlacesGroup.fromJson(Map<String, dynamic> json) {
    return CityPlacesGroup(
      city: json['city'] as String? ?? '',
      places: (json['places'] as List?)
              ?.map((e) => PlaceResult.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }

  /// 城市名称
  final String city;

  /// 该城市下的地点
  final List<PlaceResult> places;

  /// 转换为 JSON
  Map<String, dynamic> toJson() {
    return {
      'city': city,
      'places': places.map((e) => e.toJson()).toList(),
    };
  }
}

/// 地点结果
class PlaceResult {
  PlaceResult({
    this.id,
    this.googlePlaceId,
    required this.name,
    required this.summary,
    required this.coverImage,
    this.images = const [],
    required this.latitude,
    required this.longitude,
    this.city,
    this.country,
    this.rating,
    this.ratingCount,
    this.recommendationPhrase,
    this.tags,
    this.displayTagsEn,
    this.displayTagsZh,
    required this.isVerified,
    required this.source,
    // 详情页需要的额外字段
    this.address,
    this.phoneNumber,
    this.website,
    this.openingHours,
  });

  /// 从 JSON 创建
  factory PlaceResult.fromJson(Map<String, dynamic> json) {
    final parsedTags = _parseAiTags(json['tags']);
    
    // Parse images array - use images if available, otherwise fallback to coverImage
    final coverImage = json['coverImage'] as String? ?? '';
    List<String> images = [];
    if (json['images'] != null && json['images'] is List) {
      images = (json['images'] as List)
          .map((e) => e?.toString() ?? '')
          .where((e) => e.isNotEmpty)
          .toList();
    }
    // If no images array, use coverImage as single image
    if (images.isEmpty && coverImage.isNotEmpty) {
      images = [coverImage];
    }
    
    return PlaceResult(
      id: json['id'] as String?,
      googlePlaceId: json['googlePlaceId'] as String?,
      name: json['name'] as String? ?? '',
      summary: json['summary'] as String? ?? '',
      coverImage: coverImage,
      images: images,
      latitude: (json['latitude'] as num?)?.toDouble() ?? 0.0,
      longitude: (json['longitude'] as num?)?.toDouble() ?? 0.0,
      city: json['city'] as String?,
      country: json['country'] as String?,
      rating: (json['rating'] as num?)?.toDouble(),
      ratingCount: json['ratingCount'] as int?,
      recommendationPhrase: json['recommendationPhrase'] as String?,
      tags: parsedTags,
      displayTagsEn: _parseStringList(json['display_tags_en']),
      displayTagsZh: _parseStringList(json['display_tags_zh']),
      isVerified: json['isVerified'] as bool? ?? false,
      source: _parseSource(json['source'] as String?),
      // 详情页需要的额外字段
      address: json['address'] as String?,
      phoneNumber: json['phoneNumber'] as String?,
      website: json['website'] as String?,
      openingHours: json['openingHours'] as String?,
    );
  }

  /// Supabase ID (如果已存在)
  final String? id;

  /// Google Place ID (如果匹配到)
  final String? googlePlaceId;

  /// 地点名称
  final String name;

  /// AI 生成的 summary（1-2 句话）
  final String summary;

  /// 封面图 URL（R2 URL 或 AI 提供的 URL）
  final String coverImage;

  /// 所有图片 URL 列表（用于详情页横滑展示）
  final List<String> images;

  /// 纬度
  final double latitude;

  /// 经度
  final double longitude;

  /// 城市
  final String? city;

  /// 国家
  final String? country;

  /// Google 评分（AI-only 时为空）
  final double? rating;

  /// Google 评分人数（AI-only 时为空）
  final int? ratingCount;

  /// AI 推荐短语（如 "highly rated", "local favorite"）
  /// AI-only 地点时显示此字段替代评分
  final String? recommendationPhrase;

  /// AI 标签（如 "cozy", "instagram-worthy"）
  final List<String>? tags;

  /// 展示标签（英文）- 后端计算好的 category + ai_tags
  final List<String>? displayTagsEn;

  /// 展示标签（中文）- 后端计算好的 category + ai_tags
  final List<String>? displayTagsZh;

  /// 是否有 Google 验证
  final bool isVerified;

  /// 数据来源
  final PlaceSource source;

  /// 详情页需要的额外字段
  final String? address;
  final String? phoneNumber;
  final String? website;
  final String? openingHours;

  /// 是否是 AI-only 地点（未经 Google 验证）
  bool get isAIOnly => !isVerified && source == PlaceSource.ai;

  /// 是否有评分
  bool get hasRating => rating != null && rating! > 0;

  /// 是否有有效的封面图片（排除占位符 URL）
  bool get hasValidCoverImage {
    if (coverImage.isEmpty) return false;
    if (coverImage.contains('example.com')) return false;
    if (coverImage.contains('placeholder')) return false;
    return coverImage.startsWith('http');
  }

  /// 转换为 JSON
  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'googlePlaceId': googlePlaceId,
      'name': name,
      'summary': summary,
      'coverImage': coverImage,
      'images': images,
      'latitude': latitude,
      'longitude': longitude,
      'city': city,
      'country': country,
      'rating': rating,
      'ratingCount': ratingCount,
      'recommendationPhrase': recommendationPhrase,
      'tags': tags,
      'display_tags_en': displayTagsEn,
      'display_tags_zh': displayTagsZh,
      'isVerified': isVerified,
      'source': source.name,
      'address': address,
      'phoneNumber': phoneNumber,
      'website': website,
      'openingHours': openingHours,
    };
  }

  /// 解析数据来源
  static PlaceSource _parseSource(String? source) {
    switch (source) {
      case 'google':
        return PlaceSource.google;
      case 'cache':
        return PlaceSource.cache;
      case 'ai':
        return PlaceSource.ai;
      default:
        return PlaceSource.ai;
    }
  }

  /// 解析字符串列表
  static List<String>? _parseStringList(dynamic value) {
    if (value == null) return null;
    if (value is List) {
      return value.map((e) => e.toString()).toList();
    }
    return null;
  }

  /// 解析 aiTags - 支持对象数组格式 [{en, zh, kind, id, priority}]
  static List<String>? _parseAiTags(dynamic value) {
    if (value == null) return null;
    if (value is! List) return null;
    
    final List<String> result = [];
    for (final item in value) {
      if (item is Map<String, dynamic>) {
        // 新格式：对象数组，提取 en 字段
        final en = item['en'] as String?;
        if (en != null && en.isNotEmpty) {
          result.add(en);
        }
      } else if (item is String) {
        // 旧格式：字符串数组，直接使用
        if (item.isNotEmpty) {
          result.add(item);
        }
      }
    }
    
    return result.isEmpty ? null : result;
  }

  /// 复制并修改
  PlaceResult copyWith({
    String? id,
    String? googlePlaceId,
    String? name,
    String? summary,
    String? coverImage,
    List<String>? images,
    double? latitude,
    double? longitude,
    String? city,
    String? country,
    double? rating,
    int? ratingCount,
    String? recommendationPhrase,
    List<String>? tags,
    List<String>? displayTagsEn,
    List<String>? displayTagsZh,
    bool? isVerified,
    PlaceSource? source,
    String? address,
    String? phoneNumber,
    String? website,
    String? openingHours,
  }) {
    return PlaceResult(
      id: id ?? this.id,
      googlePlaceId: googlePlaceId ?? this.googlePlaceId,
      name: name ?? this.name,
      summary: summary ?? this.summary,
      coverImage: coverImage ?? this.coverImage,
      images: images ?? this.images,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      city: city ?? this.city,
      country: country ?? this.country,
      rating: rating ?? this.rating,
      ratingCount: ratingCount ?? this.ratingCount,
      recommendationPhrase: recommendationPhrase ?? this.recommendationPhrase,
      tags: tags ?? this.tags,
      displayTagsEn: displayTagsEn ?? this.displayTagsEn,
      displayTagsZh: displayTagsZh ?? this.displayTagsZh,
      isVerified: isVerified ?? this.isVerified,
      source: source ?? this.source,
      address: address ?? this.address,
      phoneNumber: phoneNumber ?? this.phoneNumber,
      website: website ?? this.website,
      openingHours: openingHours ?? this.openingHours,
    );
  }
}

/// 搜索加载状态
/// 
/// Requirements: 7.1, 7.2, 7.3, 7.4
class SearchLoadingState {
  /// Stage 1: 分析用户诉求 (1s)
  const SearchLoadingState.analyzing()
      : stage = SearchStage.analyzing,
        message = '分析用户诉求...',
        messageEn = 'Analyzing your request...';

  /// Stage 2: 正在寻找合适地点
  const SearchLoadingState.searching()
      : stage = SearchStage.searching,
        message = '正在寻找合适地点...',
        messageEn = 'Finding the perfect places...';

  /// Stage 3: 总结输出中
  const SearchLoadingState.summarizing()
      : stage = SearchStage.summarizing,
        message = '总结输出中...',
        messageEn = 'Generating summary...';

  /// 完成
  const SearchLoadingState.complete()
      : stage = SearchStage.complete,
        message = '',
        messageEn = '';

  /// 当前阶段
  final SearchStage stage;

  /// 显示消息（中文）
  final String message;

  /// 显示消息（英文）
  final String messageEn;

  /// 是否正在加载
  bool get isLoading => stage != SearchStage.complete;

  /// 获取本地化消息
  /// [locale] 语言代码，如 'zh' 或 'en'
  String getLocalizedMessage(String locale) {
    if (locale.startsWith('zh')) {
      return message;
    }
    return messageEn;
  }

  /// 获取阶段进度（0.0 - 1.0）
  double get progress {
    switch (stage) {
      case SearchStage.analyzing:
        return 0.2;
      case SearchStage.searching:
        return 0.5;
      case SearchStage.summarizing:
        return 0.8;
      case SearchStage.complete:
        return 1.0;
    }
  }

  /// 获取阶段序号（1-4）
  int get stageNumber {
    switch (stage) {
      case SearchStage.analyzing:
        return 1;
      case SearchStage.searching:
        return 2;
      case SearchStage.summarizing:
        return 3;
      case SearchStage.complete:
        return 4;
    }
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is SearchLoadingState && other.stage == stage;
  }

  @override
  int get hashCode => stage.hashCode;
}
