import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers/dio_provider.dart';
import '../../../shared/models/trip_model.dart';
import '../data/trip_repository.dart';

// Trip Repository Provider
final tripRepositoryProvider = Provider<TripRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return TripRepository(dio);
});

// Trips List Provider
final tripsProvider = FutureProvider<List<Trip>>((ref) async {
  final repository = ref.watch(tripRepositoryProvider);
  return await repository.getMyTrips();
});

// Single Trip Provider
final tripProvider = FutureProvider.family<Trip, String>((ref, tripId) async {
  final repository = ref.watch(tripRepositoryProvider);
  return await repository.getTripById(tripId);
});

// Trip Actions Provider
final tripActionsProvider = Provider<TripActions>((ref) {
  final repository = ref.watch(tripRepositoryProvider);
  return TripActions(repository, ref);
});

class TripActions {
  final TripRepository _repository;
  final Ref _ref;

  TripActions(this._repository, this._ref);

  Future<Trip> createTrip({
    required String name,
    String? city,
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    final trip = await _repository.createTrip(
      name: name,
      city: city,
      startDate: startDate,
      endDate: endDate,
    );
    
    // Refresh trips list
    _ref.invalidate(tripsProvider);
    
    return trip;
  }

  Future<void> refreshTrips() async {
    _ref.invalidate(tripsProvider);
  }

  Future<void> refreshTrip(String tripId) async {
    _ref.invalidate(tripProvider(tripId));
  }
}


