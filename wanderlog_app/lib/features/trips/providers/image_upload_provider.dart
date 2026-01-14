import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/core/providers/dio_provider.dart';
import 'package:wanderlog/features/trips/data/image_upload_service.dart';

/// Provider for image upload service
final imageUploadServiceProvider = Provider<ImageUploadService>((ref) {
  final dio = ref.watch(dioProvider);
  return ImageUploadService(dio);
});
