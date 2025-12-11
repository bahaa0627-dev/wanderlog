import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:wanderlog/features/trips/providers/spots_provider.dart';
import 'package:wanderlog/shared/models/spot_model.dart';
import 'package:wanderlog/features/map/presentation/widgets/tag_filter_bar.dart';

class MapViewPage extends ConsumerStatefulWidget {

  const MapViewPage({super.key, this.city});
  final String? city;

  @override
  ConsumerState<MapViewPage> createState() => _MapViewPageState();
}

class _MapViewPageState extends ConsumerState<MapViewPage> {
  MapboxMap? _mapboxMap;
  List<String> _selectedTags = [];
  String? _selectedCategory;

  @override
  Widget build(BuildContext context) {
    final spotsAsync = ref.watch(
      spotsProvider(SpotFilters(city: widget.city, category: _selectedCategory)),
    );

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.city ?? 'Explore'),
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: () {
              _showFilterDialog();
            },
          ),
        ],
      ),
      body: Stack(
        children: [
          // Mapbox Map
          MapWidget(
            key: const ValueKey('mapWidget'),
            cameraOptions: CameraOptions(
              center: Point(coordinates: Position(0, 0)),
              zoom: 12.0,
            ),
            onMapCreated: (MapboxMap mapboxMap) {
              _mapboxMap = mapboxMap;
              _setupMap();
            },
          ),
          // Tag Filter Bar
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: TagFilterBar(
              selectedTags: _selectedTags,
              onTagsChanged: (tags) {
                setState(() {
                  _selectedTags = tags;
                });
              },
            ),
          ),
          // Loading/Error overlay
          spotsAsync.when(
            data: (spots) {
              // Update markers when spots load
              WidgetsBinding.instance.addPostFrameCallback((_) {
                _addMarkers(spots);
              });
              return const SizedBox.shrink();
            },
            loading: () => const ColoredBox(
              color: Colors.black26,
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (error, stack) => ColoredBox(
              color: Colors.black26,
              child: Center(
                child: Card(
                  margin: const EdgeInsets.all(16),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.error_outline,
                            size: 48, color: Colors.red,),
                        const SizedBox(height: 16),
                        const Text('Error loading spots'),
                        const SizedBox(height: 8),
                        Text(error.toString()),
                        const SizedBox(height: 16),
                        ElevatedButton(
                          onPressed: () {
                            ref.invalidate(spotsProvider);
                          },
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _goToMyLocation,
        child: const Icon(Icons.my_location),
      ),
    );
  }

  Future<void> _setupMap() async {
    if (_mapboxMap == null) return;

    // Set initial camera position based on city
    // For now, default to a general location
    // TODO: Geocode city name to coordinates
    await _mapboxMap!.setCamera(
      CameraOptions(
        center: Point(coordinates: Position(139.6917, 35.6895)), // Tokyo default
        zoom: 12.0,
      ),
    );
  }

  Future<void> _addMarkers(List<Spot> spots) async {
    if (_mapboxMap == null) return;

    // Filter by selected tags
    final filteredSpots = _selectedTags.isEmpty
        ? spots
        : spots.where((spot) => spot.tags.any((tag) => _selectedTags.contains(tag))).toList();

    // TODO: Add point annotations for each spot
    // This requires setting up the annotations plugin
    // For now, this is a placeholder

    // Move camera to show all spots
    if (filteredSpots.isNotEmpty) {
      final firstSpot = filteredSpots.first;
      await _mapboxMap!.setCamera(
        CameraOptions(
          center: Point(
            coordinates: Position(firstSpot.longitude, firstSpot.latitude),
          ),
          zoom: 12.0,
        ),
      );
    }
  }

  void _goToMyLocation() async {
    // TODO: Get user's current location and move camera
    // Requires location permissions
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Location feature coming soon')),
    );
  }

  void _showFilterDialog() {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Filter by Category'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            RadioListTile<String?>(
              title: const Text('All'),
              value: null,
              groupValue: _selectedCategory,
              onChanged: (value) {
                setState(() => _selectedCategory = value);
                Navigator.of(context).pop();
              },
            ),
            RadioListTile<String?>(
              title: const Text('Restaurant'),
              value: 'restaurant',
              groupValue: _selectedCategory,
              onChanged: (value) {
                setState(() => _selectedCategory = value);
                Navigator.of(context).pop();
              },
            ),
            RadioListTile<String?>(
              title: const Text('Museum'),
              value: 'museum',
              groupValue: _selectedCategory,
              onChanged: (value) {
                setState(() => _selectedCategory = value);
                Navigator.of(context).pop();
              },
            ),
            RadioListTile<String?>(
              title: const Text('Park'),
              value: 'park',
              groupValue: _selectedCategory,
              onChanged: (value) {
                setState(() => _selectedCategory = value);
                Navigator.of(context).pop();
              },
            ),
          ],
        ),
      ),
    );
  }
}



