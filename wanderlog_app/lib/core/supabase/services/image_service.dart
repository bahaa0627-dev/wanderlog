import 'dart:io';
import 'package:http/http.dart' as http;
import '../supabase_config.dart';

/// 图片上传服务 (Cloudflare R2)
class ImageService {
  static String get _baseUrl => SupabaseConfig.imagesBaseUrl;

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
  static Future<String> _getUploadToken() async {
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
}
