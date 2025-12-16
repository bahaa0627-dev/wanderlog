import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/shared/models/trip_model.dart';

/// Ensure user is logged in; if not, navigate to login and return false.
Future<bool> requireAuth(BuildContext context, WidgetRef ref) async {
  final auth = ref.read(authProvider);
  if (auth.isAuthenticated) return true;
  final result = await context.push('/login');
  return result == true;
}

/// Ensure the user has a destination (trip) for the given city.
/// Returns the destination id.
Future<String?> ensureDestinationForCity(WidgetRef ref, String city) async {
  final normalized = city.trim();
  if (normalized.isEmpty) return null;

  final repo = ref.read(tripRepositoryProvider);
  final trips = await repo.getMyTrips();
  Trip? existing;
  for (final t in trips) {
    if ((t.city ?? '').toLowerCase() == normalized.toLowerCase()) {
      existing = t;
      break;
    }
  }

  if (existing != null) {
    return existing.id;
  }

  final created = await repo.createTrip(
    name: normalized,
    city: normalized,
  );
  // refresh destinations cache
  ref.invalidate(tripsProvider);
  return created.id;
}

