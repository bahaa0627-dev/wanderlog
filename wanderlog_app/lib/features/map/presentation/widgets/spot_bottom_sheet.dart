import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/shared/models/spot_model.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart';

class SpotBottomSheet extends ConsumerStatefulWidget {

  const SpotBottomSheet({required this.spot, super.key});
  final Spot spot;

  @override
  ConsumerState<SpotBottomSheet> createState() => _SpotBottomSheetState();
}

class _SpotBottomSheetState extends ConsumerState<SpotBottomSheet> {
  String? _selectedTripId;
  bool _isLoading = false;

  @override
  Widget build(BuildContext context) {
    final tripsAsync = ref.watch(tripsProvider);

    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      minChildSize: 0.4,
      maxChildSize: 0.9,
      builder: (context, scrollController) => Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: SingleChildScrollView(
            controller: scrollController,
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Drag handle
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.grey.shade300,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                // Spot image
                if (widget.spot.images.isNotEmpty)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.network(
                      widget.spot.images.first,
                      height: 200,
                      width: double.infinity,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        height: 200,
                        color: Colors.grey.shade300,
                        child: const Icon(Icons.place, size: 80),
                      ),
                    ),
                  ),
                const SizedBox(height: 16),
                // Spot name
                Text(
                  widget.spot.name,
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                // Category and rating
                Row(
                  children: [
                    if (widget.spot.category != null) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.blue.shade50,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          widget.spot.category!,
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.blue.shade700,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                    ],
                    if (widget.spot.rating != null) ...[
                      const Icon(Icons.star, size: 16, color: Colors.amber),
                      const SizedBox(width: 4),
                      Text(
                        widget.spot.rating!.toStringAsFixed(1),
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 12),
                // Address
                if (widget.spot.address != null) ...[
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.location_on_outlined,
                          size: 18, color: Colors.grey.shade600,),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          widget.spot.address!,
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.grey.shade700,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                ],
                // Tags
                if (widget.spot.tags.isNotEmpty) ...[
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: widget.spot.tags
                        .map(
                          (tag) => Chip(
                            label: Text('#$tag'),
                            backgroundColor: Colors.grey.shade100,
                            labelStyle: const TextStyle(fontSize: 12),
                          ),
                        )
                        .toList(),
                  ),
                  const SizedBox(height: 16),
                ],
                // Phone and website
                if (widget.spot.phoneNumber != null ||
                    widget.spot.website != null) ...[
                  if (widget.spot.phoneNumber != null)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.phone),
                      title: Text(widget.spot.phoneNumber!),
                      dense: true,
                    ),
                  if (widget.spot.website != null)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.language),
                      title: const Text('Website'),
                      trailing: const Icon(Icons.open_in_new, size: 16),
                      dense: true,
                      onTap: () {
                        // TODO: Open website
                      },
                    ),
                  const SizedBox(height: 16),
                ],
                // Add to Trip button
                tripsAsync.when(
                  data: (trips) {
                    if (trips.isEmpty) {
                      return const Card(
                        child: Padding(
                          padding: EdgeInsets.all(16),
                          child: Text(
                            'Create a trip first to add spots to your wishlist',
                            textAlign: TextAlign.center,
                          ),
                        ),
                      );
                    }

                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        DropdownButtonFormField<String>(
                          decoration: const InputDecoration(
                            labelText: 'Select Trip',
                            border: OutlineInputBorder(),
                          ),
                          initialValue: _selectedTripId,
                          items: trips
                              .map(
                                (trip) => DropdownMenuItem(
                                  value: trip.id,
                                  child: Text(trip.name),
                                ),
                              )
                              .toList(),
                          onChanged: (value) {
                            setState(() => _selectedTripId = value);
                          },
                        ),
                        const SizedBox(height: 12),
                        FilledButton.icon(
                          onPressed: _selectedTripId == null || _isLoading
                              ? null
                              : () => _addToTrip(context),
                          icon: _isLoading
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.add),
                          label: const Text('Add to Wishlist'),
                        ),
                      ],
                    );
                  },
                  loading: () =>
                      const Center(child: CircularProgressIndicator()),
                  error: (_, __) => const Text('Error loading trips'),
                ),
              ],
            ),
          ),
        ),
    );
  }

  Future<void> _addToTrip(BuildContext context) async {
    if (_selectedTripId == null) return;

    setState(() => _isLoading = true);

    try {
      final repository = ref.read(tripRepositoryProvider);
      await repository.manageTripSpot(
        tripId: _selectedTripId!,
        spotId: widget.spot.id,
        status: TripSpotStatus.wishlist,
      );

      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Added to wishlist!')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }
}



