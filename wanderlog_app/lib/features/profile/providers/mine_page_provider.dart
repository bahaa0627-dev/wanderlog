import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/core/utils/category_emoji.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/shared/models/trip_model.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart';

/// Data model for a check-in photo with associated metadata
class CheckInPhoto {
  const CheckInPhoto({
    required this.photoUrl,
    required this.spotId,
    required this.spotName,
    required this.city,
    required this.country,
    required this.visitDate,
    this.userNotes,
    required this.category,
    required this.tags,
  });

  final String photoUrl;
  final String spotId;
  final String spotName;
  final String city;
  final String country;
  final DateTime visitDate;
  final String? userNotes;
  final String category;
  final List<String> tags;
}

/// Data model for category count with emoji
class CategoryCount {
  const CategoryCount({
    required this.category,
    required this.count,
    required this.emoji,
  });

  final String category;
  final int count;
  final String emoji;
}

/// Data model for a visited spot marker on the map
class VisitedSpotMarker {
  const VisitedSpotMarker({
    required this.id,
    required this.name,
    required this.latitude,
    required this.longitude,
    required this.city,
    required this.country,
    required this.category,
    required this.visitDate,
  });

  final String id;
  final String name;
  final double latitude;
  final double longitude;
  final String city;
  final String country;
  final String category;
  final DateTime visitDate;
}

/// Complete data for the Mine page
class MinePageData {
  const MinePageData({
    required this.countriesCount,
    required this.citiesCount,
    required this.mapMarkers,
    required this.topCategories,
    required this.photos,
    required this.visitedSpots,
  });

  final int countriesCount;
  final int citiesCount;
  final List<VisitedSpotMarker> mapMarkers;
  final List<CategoryCount> topCategories;
  final List<CheckInPhoto> photos;
  final List<TripSpot> visitedSpots;

  static const empty = MinePageData(
    countriesCount: 0,
    citiesCount: 0,
    mapMarkers: [],
    topCategories: [],
    photos: [],
    visitedSpots: [],
  );
}

/// Provider for Mine page data
/// Uses keepAlive to cache data and improve performance
final minePageDataProvider = FutureProvider<MinePageData>((ref) async {
  try {
    print('🏠 [MinePageProvider] Loading trips data...');
    final startTime = DateTime.now();
    
    final tripsAsync = await ref.watch(tripsProvider.future);
    print('🏠 [MinePageProvider] Loaded ${tripsAsync.length} trips in ${DateTime.now().difference(startTime).inMilliseconds}ms');
    
    // Log trips details
    for (var trip in tripsAsync) {
      final spots = trip.tripSpots ?? [];
      final visitedCount = spots.where((s) => s.isVisited).length;
      print('🏠   Trip "${trip.name}": ${spots.length} spots, $visitedCount visited');
    }
    
    final processStart = DateTime.now();
    final result = _processMinePageData(tripsAsync);
    final processTime = DateTime.now().difference(processStart).inMilliseconds;
    
    print('🏠 [MinePageProvider] Processed in ${processTime}ms:');
    print('🏠   - ${result.countriesCount} countries, ${result.citiesCount} cities');
    print('🏠   - ${result.mapMarkers.length} markers');
    print('🏠   - ${result.photos.length} photos');
    print('🏠   - ${result.visitedSpots.length} visited spots');
    print('🏠   - ${result.topCategories.length} top categories');
    
    // Keep data alive to avoid unnecessary reloads
    ref.keepAlive();
    
    return result;
  } catch (e, stack) {
    print('🏠 [MinePageProvider] Error: $e');
    print('🏠 [MinePageProvider] Stack: $stack');
    rethrow;
  }
});

/// Process trips data into MinePageData
MinePageData _processMinePageData(List<Trip> trips) {
  final Set<String> countries = {};
  final Set<String> cities = {};
  final List<VisitedSpotMarker> markers = [];
  final List<CheckInPhoto> photos = [];
  final Map<String, int> categoryCounts = {};
  final List<TripSpot> visitedSpots = [];

  for (final trip in trips) {
    try {
      final tripSpots = trip.tripSpots ?? [];
      
      for (final tripSpot in tripSpots) {
        try {
          // Only process visited spots
          if (!tripSpot.isVisited) continue;
          
          visitedSpots.add(tripSpot);
          
          final spot = tripSpot.spot;
          if (spot == null) continue;

          // Track countries and cities
          final country = spot.country ?? '';
          final city = spot.city ?? '';
          if (country.isNotEmpty) countries.add(country);
          if (city.isNotEmpty) cities.add(city);

          // Create marker with visit date
          final visitDate = tripSpot.visitDate ?? tripSpot.createdAt ?? DateTime.now();
          markers.add(VisitedSpotMarker(
            id: spot.id,
            name: spot.name,
            latitude: spot.latitude,
            longitude: spot.longitude,
            city: city,
            country: country,
            category: spot.category ?? 'other',
            visitDate: visitDate,
          ));

          // Count categories from category, tags, and aiTags
          _countCategories(
            categoryCounts,
            spot.category,
            spot.tags,
            spot.aiTags,
          );

          // Collect photos - use updatedAt as it reflects when photos were added
          final userPhotos = tripSpot.userPhotos ?? [];
          // Use the most recent date available: updatedAt > visitDate > createdAt
          final photoDate = tripSpot.updatedAt ?? tripSpot.visitDate ?? tripSpot.createdAt ?? DateTime.now();
          for (final photoUrl in userPhotos) {
            if (photoUrl.isNotEmpty) {
              photos.add(CheckInPhoto(
                photoUrl: photoUrl,
                spotId: spot.id,
                spotName: spot.name,
                city: city,
                country: country,
                visitDate: photoDate,
                userNotes: tripSpot.userNotes,
                category: spot.category ?? 'other',
                tags: spot.tags,
              ));
            }
          }
        } catch (e) {
          print('⚠️ [MinePageProvider] Error processing tripSpot: $e');
          continue;
        }
      }
    } catch (e) {
      print('⚠️ [MinePageProvider] Error processing trip: $e');
      continue;
    }
  }

  // Sort photos by visit date (newest first)
  photos.sort((a, b) => b.visitDate.compareTo(a.visitDate));
  
  // Debug: print photo order
  print('📸 [MinePageProvider] Photos sorted (newest first):');
  for (int i = 0; i < photos.length && i < 5; i++) {
    print('  ${i + 1}. ${photos[i].spotName} - ${photos[i].visitDate}');
  }

  // Sort markers by visit date (newest first) for preview display
  markers.sort((a, b) => b.visitDate.compareTo(a.visitDate));

  // Sort visited spots by visit date (newest first)
  visitedSpots.sort((a, b) {
    final aDate = a.visitDate ?? a.createdAt ?? DateTime.now();
    final bDate = b.visitDate ?? b.createdAt ?? DateTime.now();
    return bDate.compareTo(aDate);
  });

  // Get top 4 categories
  final sortedCategories = categoryCounts.entries.toList()
    ..sort((a, b) => b.value.compareTo(a.value));
  
  final topCategories = sortedCategories.take(4).map((entry) {
    return CategoryCount(
      category: entry.key,
      count: entry.value,
      emoji: getCategoryEmoji(entry.key),
    );
  }).toList();

  return MinePageData(
    countriesCount: countries.length,
    citiesCount: cities.length,
    mapMarkers: markers,
    topCategories: topCategories,
    photos: photos,
    visitedSpots: visitedSpots,
  );
}

/// Count categories from various sources
void _countCategories(
  Map<String, int> counts,
  String? category,
  List<String> tags,
  List<dynamic>? aiTags,
) {
  // Count main category
  if (category != null && category.isNotEmpty) {
    final normalizedCategory = _normalizeCategory(category);
    counts[normalizedCategory] = (counts[normalizedCategory] ?? 0) + 1;
  }

  // Count tags
  for (final tag in tags) {
    if (tag.isNotEmpty && !_isInvalidTag(tag)) {
      final normalizedTag = _normalizeCategory(tag);
      counts[normalizedTag] = (counts[normalizedTag] ?? 0) + 1;
    }
  }

  // Count AI tags
  if (aiTags != null) {
    for (final tag in aiTags) {
      final tagStr = tag.toString();
      if (tagStr.isNotEmpty && !_isInvalidTag(tagStr)) {
        final normalizedTag = _normalizeCategory(tagStr);
        counts[normalizedTag] = (counts[normalizedTag] ?? 0) + 1;
      }
    }
  }
}

/// Normalize category name for display
String _normalizeCategory(String category) {
  final lower = category.toLowerCase().trim();
  // Capitalize first letter
  if (lower.isEmpty) return lower;
  return lower[0].toUpperCase() + lower.substring(1);
}

/// Check if tag should be filtered out
bool _isInvalidTag(String tag) {
  const invalidTags = {
    'point_of_interest',
    'establishment',
    'premise',
    'subpremise',
    'route',
    'street_address',
    'political',
    'locality',
    'sublocality',
    'neighborhood',
    'administrative_area_level_1',
    'administrative_area_level_2',
    'country',
    'postal_code',
  };
  return invalidTags.contains(tag.toLowerCase());
}
