import 'dart:io';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';
import '../supabase_config.dart';

/// 图片上传服务 (Cloudflare R2)
class ImageService {
  static String get _baseUrl => SupabaseConfig.imagesBaseUrl;
  static const _uuid = Uuid();

  /// 上传用户头像
  static Future<String> uploadAvatar(File imageFile) async {
    final userId = SupabaseConfig.currentUser?.id;
    if (userId == null) throw Exception('用户未登录');

    final path = 'users/avatars/$userId.jpg';
    return await _uploadImage(imageFile, path);
  }

  /// 上传打卡照片
  static Future<List<String>> uploadCheckinPhotos(
    String checkinId,
    List<File> images,
  ) async {
    final userId = SupabaseConfig.currentUser?.id;
    if (userId == null) throw Exception('用户未登录');

    final urls = <String>[];
    for (int i = 0; i < images.length; i++) {
      final path = 'users/checkins/$userId/$checkinId/${i + 1}.jpg';
      final url = await _uploadImage(images[i], path);
      urls.add(url);
    }
    return urls;
  }

  /// 上传图片到 R2
  static Future<String> _uploadImage(File file, String path) async {
    final bytes = await file.readAsBytes();
    final token = await _getUploadToken();

    final response = await http.put(
      Uri.parse('$_baseUrl/$path'),
      headers: {
        'Content-Type': 'image/jpeg',
        'Authorization': 'Bearer $token',
      },
      body: bytes,
    );

    if (response.statusCode != 200) {
      throw Exception('图片上传失败: ${response.body}');
    }

    return '$_baseUrl/$path';
  }

  /// 获取上传 token
  /// 对于地点图片上传，使用固定的 R2 上传密钥
  /// 对于用户图片上传，需要通过 Supabase Edge Function 获取
  static Future<String> _getUploadToken({bool forPlaceImages = false}) async {
    if (forPlaceImages) {
      // 地点图片使用固定密钥（与后端一致）
      return '920627';
    }
    
    // 用户图片需要验证身份
    final response = await SupabaseConfig.client.functions.invoke(
      'get-upload-token',
    );

    if (response.data == null || response.data['token'] == null) {
      throw Exception('获取上传 token 失败');
    }

    return response.data['token'] as String;
  }

  /// 获取优化后的图片 URL
  /// 
  /// [originalUrl] 原始图片 URL
  /// [width] 目标宽度
  /// [height] 目标高度
  /// [fit] 裁剪方式: cover, contain, fill
  /// [quality] 图片质量 (1-100)
  /// [format] 图片格式: webp, avif, jpeg
  static String getOptimizedUrl(
    String originalUrl, {
    int? width,
    int? height,
    String fit = 'cover',
    int quality = 80,
    String format = 'webp',
  }) {
    if (originalUrl.isEmpty) return originalUrl;

    final params = <String>[];
    if (width != null) params.add('w=$width');
    if (height != null) params.add('h=$height');
    params.add('fit=$fit');
    params.add('q=$quality');
    params.add('f=$format');

    final separator = originalUrl.contains('?') ? '&' : '?';
    return '$originalUrl$separator${params.join('&')}';
  }

  /// 获取缩略图 URL
  static String getThumbnailUrl(String originalUrl, {int size = 200}) {
    return getOptimizedUrl(
      originalUrl,
      width: size,
      height: size,
      fit: 'cover',
      quality: 70,
    );
  }

  /// 获取列表图 URL
  static String getListImageUrl(String originalUrl) {
    return getOptimizedUrl(
      originalUrl,
      width: 400,
      height: 300,
      fit: 'cover',
      quality: 80,
    );
  }

  /// 获取详情页大图 URL
  static String getDetailImageUrl(String originalUrl) {
    return getOptimizedUrl(
      originalUrl,
      width: 800,
      quality: 85,
    );
  }

  /// 从 URL 下载图片并上传到 R2（用于 Google 图片迁移）
  /// 
  /// [imageUrl] Google 图片 URL
  /// [placeId] 地点 ID
  /// [index] 图片索引 (0=cover, 1-4=其他图片)
  /// 返回 R2 图片 URL
  static Future<String?> uploadImageFromUrl(
    String imageUrl,
    String placeId, {
    int index = 0,
  }) async {
    try {
      // 下载图片
      final response = await http.get(Uri.parse(imageUrl));
      if (response.statusCode != 200) {
        print('⚠️ Failed to download image: ${response.statusCode}');
        return null;
      }

      final bytes = response.bodyBytes;
      if (bytes.isEmpty) {
        print('⚠️ Downloaded image is empty');
        return null;
      }

      // 生成文件名
      final fileName = index == 0 ? 'cover.jpg' : '${_uuid.v4()}.jpg';
      final path = 'places/$placeId/$fileName';

      // 上传到 R2（使用固定密钥）
      final token = await _getUploadToken(forPlaceImages: true);
      final uploadResponse = await http.put(
        Uri.parse('$_baseUrl/$path'),
        headers: {
          'Content-Type': 'image/jpeg',
          'Authorization': 'Bearer $token',
        },
        body: bytes,
      );

      if (uploadResponse.statusCode != 200) {
        print('⚠️ Failed to upload image: ${uploadResponse.body}');
        return null;
      }

      return '$_baseUrl/$path';
    } catch (e) {
      print('⚠️ Error uploading image from URL: $e');
      return null;
    }
  }

  /// 批量上传 Google 图片到 R2
  /// 
  /// [googlePhotoUrls] Google 图片 URL 列表
  /// [placeId] 地点 ID
  /// 返回 {coverImage: String?, images: List<String>}
  static Future<Map<String, dynamic>> uploadGooglePhotosToR2(
    List<String> googlePhotoUrls,
    String placeId,
  ) async {
    if (googlePhotoUrls.isEmpty) {
      return {'coverImage': null, 'images': <String>[]};
    }

    final r2Urls = <String>[];
    
    for (int i = 0; i < googlePhotoUrls.length; i++) {
      final url = await uploadImageFromUrl(
        googlePhotoUrls[i],
        placeId,
        index: i,
      );
      if (url != null) {
        r2Urls.add(url);
      }
    }

    if (r2Urls.isEmpty) {
      return {'coverImage': null, 'images': <String>[]};
    }

    return {
      'coverImage': r2Urls.first,
      'images': r2Urls.length > 1 ? r2Urls.sublist(1) : <String>[],
    };
  }
}
