import 'package:wanderlog/features/ai_recognition/data/models/ai_recognition_result.dart';

/// AI识别历史记录模型
class AIRecognitionHistory {
  AIRecognitionHistory({
    required this.id,
    required this.timestamp,
    required this.imageUrls,
    required this.result,
  });

  /// 从JSON创建
  factory AIRecognitionHistory.fromJson(Map<String, dynamic> json) {
    final resultData = json['result'] as Map<String, dynamic>;
    final spotsData = (resultData['spots'] as List<dynamic>?) ?? [];
    
    return AIRecognitionHistory(
      id: json['id'] as String,
      timestamp: DateTime.parse(json['timestamp'] as String),
      imageUrls: (json['imageUrls'] as List<dynamic>).cast<String>(),
      result: AIRecognitionResult(
        message: resultData['message'] as String? ?? '',
        spots: spotsData.map((spotJson) => 
          AIRecognitionResult.spotFromJson(spotJson as Map<String, dynamic>),
        ).toList(),
        imageUrls: (json['imageUrls'] as List<dynamic>).cast<String>(),
      ),
    );
  }

  /// 唯一标识
  final String id;
  
  /// 识别时间戳
  final DateTime timestamp;
  
  /// 上传的图片路径列表
  final List<String> imageUrls;
  
  /// 识别结果
  final AIRecognitionResult result;

  /// 转换为JSON
  Map<String, dynamic> toJson() => {
      'id': id,
      'timestamp': timestamp.toIso8601String(),
      'imageUrls': imageUrls,
      'result': {
        'message': result.message,
        'spots': result.spots.map((spot) => {
          'id': spot.id,
          'name': spot.name,
          'city': spot.city,
          'category': spot.category,
          'latitude': spot.latitude,
          'longitude': spot.longitude,
          'rating': spot.rating,
          'ratingCount': spot.ratingCount,
          'coverImage': spot.coverImage,
          'images': spot.images,
          'tags': spot.tags,
          'aiSummary': spot.aiSummary,
        },).toList(),
      },
    };

  /// 获取格式化的日期时间
  String get formattedTime {
    final now = DateTime.now();
    final diff = now.difference(timestamp);
    
    if (diff.inMinutes < 1) {
      return '刚刚';
    } else if (diff.inHours < 1) {
      return '${diff.inMinutes}分钟前';
    } else if (diff.inDays < 1) {
      return '${diff.inHours}小时前';
    } else if (diff.inDays < 7) {
      return '${diff.inDays}天前';
    } else {
      return '${timestamp.year}年${timestamp.month}月${timestamp.day}日';
    }
  }

  /// 获取简短描述
  String get summary {
    if (result.spots.isEmpty) {
      return '未识别到地点';
    }
    final count = result.spots.length;
    final firstName = result.spots.first.name;
    if (count == 1) {
      return firstName;
    }
    return '$firstName 等$count个地点';
  }
}
