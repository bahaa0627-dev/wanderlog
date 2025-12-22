import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/features/map/data/supabase_place_repository.dart';

final publicPlaceRepositoryProvider = Provider<SupabasePlaceRepository>((ref) {
  return SupabasePlaceRepository();
});
