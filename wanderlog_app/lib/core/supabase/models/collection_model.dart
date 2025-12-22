/// 合集数据模型 (对应 Supabase collections 表)
class CollectionModel {
  final String id;
  final String name;
  final String coverImage;
  final String? description;
  final String? people;
  final String? works;
  final String? source;
  final bool isPublished;
  final DateTime? publishedAt;
  final int sortOrder;
  final DateTime createdAt;
  final DateTime updatedAt;

  CollectionModel({
    required this.id,
    required this.name,
    required this.coverImage,
    this.description,
    this.people,
    this.works,
    this.source,
    this.isPublished = false,
    this.publishedAt,
    this.sortOrder = 0,
    required this.createdAt,
    required this.updatedAt,
  });

  factory CollectionModel.fromJson(Map<String, dynamic> json) {
    return CollectionModel(
      id: json['id'] as String,
      name: json['name'] as String,
      coverImage: json['cover_image'] as String,
      description: json['description'] as String?,
      people: json['people'] as String?,
      works: json['works'] as String?,
      source: json['source'] as String?,
      isPublished: json['is_published'] as bool? ?? false,
      publishedAt: json['published_at'] != null
          ? DateTime.parse(json['published_at'] as String)
          : null,
      sortOrder: json['sort_order'] as int? ?? 0,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'cover_image': coverImage,
      'description': description,
      'people': people,
      'works': works,
      'source': source,
      'is_published': isPublished,
      'published_at': publishedAt?.toIso8601String(),
      'sort_order': sortOrder,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }
}
