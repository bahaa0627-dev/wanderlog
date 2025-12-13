import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/core/providers/dio_provider.dart';
import 'package:wanderlog/features/map/data/public_place_repository.dart';

final publicPlaceRepositoryProvider = Provider<PublicPlaceRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return PublicPlaceRepository(dio);
});
