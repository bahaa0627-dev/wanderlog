import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/core/providers/dio_provider.dart';
import 'package:wanderlog/shared/models/spot_model.dart';
import 'package:wanderlog/features/trips/data/spot_repository.dart';

// Spot Repository Provider
final spotRepositoryProvider = Provider<SpotRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return SpotRepository(dio);
});

// Spots List Provider with optional filters
final spotsProvider = FutureProvider.family<List<Spot>, SpotFilters>((ref, filters) async {
  final repository = ref.watch(spotRepositoryProvider);
  return await repository.getSpots(
    city: filters.city,
    category: filters.category,
  );
});

// Single Spot Provider
final spotProvider = FutureProvider.family<Spot, String>((ref, spotId) async {
  final repository = ref.watch(spotRepositoryProvider);
  return await repository.getSpotById(spotId);
});

class SpotFilters {

  SpotFilters({this.city, this.category});
  final String? city;
  final String? category;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is SpotFilters &&
          runtimeType == other.runtimeType &&
          city == other.city &&
          category == other.category;

  @override
  int get hashCode => city.hashCode ^ category.hashCode;
}




