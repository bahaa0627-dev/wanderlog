import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

/// Service for uploading user images to R2
class ImageUploadService {
  ImageUploadService(this._dio);

  final Dio _dio;

  /// Upload multiple images and return their URLs
  /// 
  /// Returns a list of uploaded image URLs
  Future<List<String>> uploadImages(List<File> images) async {
    if (images.isEmpty) return [];

    try {
      final formData = FormData();
      
      for (int i = 0; i < images.length; i++) {
        final file = images[i];
        final bytes = await file.readAsBytes();
        formData.files.add(
          MapEntry(
            'images',
            MultipartFile.fromBytes(
              bytes,
              filename: 'image_$i.jpg',
              contentType: DioMediaType('image', 'jpeg'),
            ),
          ),
        );
      }

      final response = await _dio.post<Map<String, dynamic>>(
        '/upload/images',
        data: formData,
        options: Options(
          contentType: 'multipart/form-data',
        ),
      );

      if (response.data != null && response.data!['success'] == true) {
        final urls = response.data!['urls'] as List<dynamic>?;
        if (urls != null) {
          return urls.map((url) => url.toString()).toList();
        }
      }

      debugPrint('Upload response: ${response.data}');
      return [];
    } on DioException catch (e) {
      debugPrint('Image upload error: ${e.message}');
      debugPrint('Response: ${e.response?.data}');
      return [];
    } catch (e) {
      debugPrint('Image upload error: $e');
      return [];
    }
  }

  /// Upload a single image and return its URL
  Future<String?> uploadImage(File image) async {
    final urls = await uploadImages([image]);
    return urls.isNotEmpty ? urls.first : null;
  }
}
