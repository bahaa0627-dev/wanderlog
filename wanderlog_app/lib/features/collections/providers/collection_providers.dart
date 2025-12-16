import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/core/providers/dio_provider.dart';
import 'package:wanderlog/features/collections/data/collection_repository.dart';

final collectionRepositoryProvider = Provider<CollectionRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return CollectionRepository(dio);
});

