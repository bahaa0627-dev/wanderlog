/// SearchV2 响应模型
/// 
/// 对应后端 /places/ai/search-v2 API 的响应结构
/// Requirements: 3.5, 9.1

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

/// SearchV2 完整响应结果
class SearchV2Result {
  SearchV2Result({
    required this.success,
    required this.acknowledgment,
    this.categories,
    required this.places,
    required this.overallSummary,
    required this.quotaRemaining,
    required this.stage,
    this.error,
  });

  /// 从 JSON 创建
  factory SearchV2Result.fromJson(Map<String, dynamic> json) {
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
      overallSummary: json['overallSummary'] as String? ?? '',
      quotaRemaining: json['quotaRemaining'] as int? ?? 0,
      stage: _parseStage(json['stage'] as String?),
      error: json['error'] as String?,
    );
  }

  /// 请求是否成功
  final bool success;

  /// AI 承接文案（解释推荐思路）
  final String acknowledgment;

  /// 分类结果（可选，由 AI 决定是否分类）
  final List<CategoryGroup>? categories;

  /// 无分类时的平铺结果（最多 5 个）
  final List<PlaceResult> places;

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

  /// 获取所有地点（包括分类中的）
  List<PlaceResult> get allPlaces {
    if (hasCategories) {
      return categories!.expand((cat) => cat.places).toList();
    }
    return places;
  }

  /// 转换为 JSON
  Map<String, dynamic> toJson() {
    return {
      'success': success,
      'acknowledgment': acknowledgment,
      'categories': categories?.map((e) => e.toJson()).toList(),
      'places': places.map((e) => e.toJson()).toList(),
      'overallSummary': overallSummary,
      'quotaRemaining': quotaRemaining,
      'stage': stage.name,
      'error': error,
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

/// 地点结果
class PlaceResult {
  PlaceResult({
    this.id,
    this.googlePlaceId,
    required this.name,
    required this.summary,
    required this.coverImage,
    required this.latitude,
    required this.longitude,
    this.city,
    this.country,
    this.rating,
    this.ratingCount,
    this.recommendationPhrase,
    this.tags,
    required this.isVerified,
    required this.source,
  });

  /// 从 JSON 创建
  factory PlaceResult.fromJson(Map<String, dynamic> json) {
    return PlaceResult(
      id: json['id'] as String?,
      googlePlaceId: json['googlePlaceId'] as String?,
      name: json['name'] as String? ?? '',
      summary: json['summary'] as String? ?? '',
      coverImage: json['coverImage'] as String? ?? '',
      latitude: (json['latitude'] as num?)?.toDouble() ?? 0.0,
      longitude: (json['longitude'] as num?)?.toDouble() ?? 0.0,
      city: json['city'] as String?,
      country: json['country'] as String?,
      rating: (json['rating'] as num?)?.toDouble(),
      ratingCount: json['ratingCount'] as int?,
      recommendationPhrase: json['recommendationPhrase'] as String?,
      tags: (json['tags'] as List?)?.map((e) => e.toString()).toList(),
      isVerified: json['isVerified'] as bool? ?? false,
      source: _parseSource(json['source'] as String?),
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

  /// 是否有 Google 验证
  final bool isVerified;

  /// 数据来源
  final PlaceSource source;

  /// 是否是 AI-only 地点（未经 Google 验证）
  bool get isAIOnly => !isVerified && source == PlaceSource.ai;

  /// 是否有评分
  bool get hasRating => rating != null && rating! > 0;

  /// 转换为 JSON
  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'googlePlaceId': googlePlaceId,
      'name': name,
      'summary': summary,
      'coverImage': coverImage,
      'latitude': latitude,
      'longitude': longitude,
      'city': city,
      'country': country,
      'rating': rating,
      'ratingCount': ratingCount,
      'recommendationPhrase': recommendationPhrase,
      'tags': tags,
      'isVerified': isVerified,
      'source': source.name,
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

  /// 复制并修改
  PlaceResult copyWith({
    String? id,
    String? googlePlaceId,
    String? name,
    String? summary,
    String? coverImage,
    double? latitude,
    double? longitude,
    String? city,
    String? country,
    double? rating,
    int? ratingCount,
    String? recommendationPhrase,
    List<String>? tags,
    bool? isVerified,
    PlaceSource? source,
  }) {
    return PlaceResult(
      id: id ?? this.id,
      googlePlaceId: googlePlaceId ?? this.googlePlaceId,
      name: name ?? this.name,
      summary: summary ?? this.summary,
      coverImage: coverImage ?? this.coverImage,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      city: city ?? this.city,
      country: country ?? this.country,
      rating: rating ?? this.rating,
      ratingCount: ratingCount ?? this.ratingCount,
      recommendationPhrase: recommendationPhrase ?? this.recommendationPhrase,
      tags: tags ?? this.tags,
      isVerified: isVerified ?? this.isVerified,
      source: source ?? this.source,
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
