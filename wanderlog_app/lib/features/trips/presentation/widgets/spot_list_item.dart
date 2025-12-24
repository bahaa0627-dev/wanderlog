import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:wanderlog/core/utils/dialog_utils.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart';
import 'package:wanderlog/features/trips/data/trip_repository.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/core/providers/dio_provider.dart';
import 'package:wanderlog/shared/utils/opening_hours_utils.dart';

class SpotListItem extends ConsumerWidget {

  const SpotListItem({
    required this.tripId, required this.tripSpot, super.key,
    this.showOpeningHours = false,
    this.showRating = false,
  });
  final String tripId;
  final TripSpot tripSpot;
  final bool showOpeningHours;
  final bool showRating;

  /// Build image widget that handles both data URIs and network URLs
  Widget _buildSpotImage(String imageSource) {
    final placeholder = Container(
      width: 60,
      height: 60,
      color: Colors.grey.shade300,
      child: const Icon(Icons.place),
    );

    // Handle data URI format (data:image/jpeg;base64,...)
    if (imageSource.startsWith('data:')) {
      try {
        final base64Data = imageSource.split(',').last;
        final bytes = base64Decode(base64Data);
        return Image.memory(
          bytes,
          width: 60,
          height: 60,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => placeholder,
        );
      } catch (e) {
        return placeholder;
      }
    }
    // Handle regular network URLs
    return Image.network(
      imageSource,
      width: 60,
      height: 60,
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => placeholder,
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final spot = tripSpot.spot;
    if (spot == null) return const SizedBox.shrink();
    final openingEval =
        showOpeningHours ? OpeningHoursUtils.evaluate(spot.openingHours) : null;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      child: InkWell(
        onTap: () => _showSpotActions(context, ref),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  // Spot image thumbnail
                  if (spot.images.isNotEmpty)
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: _buildSpotImage(spot.images.first),
                    )
                  else
                    Container(
                      width: 60,
                      height: 60,
                      decoration: BoxDecoration(
                        color: Colors.grey.shade300,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(Icons.place),
                    ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          spot.name,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (spot.category != null) ...[
                          const SizedBox(height: 4),
                          Text(
                            spot.category!,
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                            ),
                          ),
                        ],
                        if (spot.address != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            spot.address!,
                            style: TextStyle(
                              fontSize: 11,
                              color: Colors.grey.shade500,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ],
                    ),
                  ),
                  // Priority badge
                  if (tripSpot.priority == SpotPriority.mustGo)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.red.shade50,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.red.shade200),
                      ),
                      child: Text(
                        'MUST GO',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          color: Colors.red.shade700,
                        ),
                      ),
                    ),
                ],
              ),
              // Rating display
              if (showRating && tripSpot.userRating != null) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    ...List.generate(
                      5,
                      (index) => Icon(
                        index < tripSpot.userRating!
                            ? Icons.star
                            : Icons.star_border,
                        size: 16,
                        color: Colors.amber,
                      ),
                    ),
                    const SizedBox(width: 8),
                    if (tripSpot.visitDate != null)
                      Text(
                        DateFormat('MMM d, yyyy').format(tripSpot.visitDate!),
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade600,
                        ),
                      ),
                  ],
                ),
              ],
              // User notes
              if (tripSpot.userNotes != null &&
                  tripSpot.userNotes!.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  tripSpot.userNotes!,
                  style: TextStyle(
                    fontSize: 13,
                    color: Colors.grey.shade700,
                    fontStyle: FontStyle.italic,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              // Opening hours (for Today's Plan)
              if (openingEval != null) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(
                      Icons.schedule,
                      size: 14,
                      color: Colors.grey.shade600,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      openingEval.summaryText,
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  void _showSpotActions(BuildContext context, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: context,
      builder: (context) => _SpotActionsSheet(
        tripId: tripId,
        tripSpot: tripSpot,
        onRefresh: () {
          ref.read(tripActionsProvider).refreshTrip(tripId);
        },
      ),
    );
  }
}

class _SpotActionsSheet extends StatefulWidget {

  const _SpotActionsSheet({
    required this.tripId,
    required this.tripSpot,
    required this.onRefresh,
  });
  final String tripId;
  final TripSpot tripSpot;
  final VoidCallback onRefresh;

  @override
  State<_SpotActionsSheet> createState() => _SpotActionsSheetState();
}

class _SpotActionsSheetState extends State<_SpotActionsSheet> {
  bool _isLoading = false;

  Future<void> _changeStatus(
      BuildContext context, TripSpotStatus newStatus,) async {
    setState(() => _isLoading = true);

    try {
      final container = ProviderScope.containerOf(context);
      final dio = container.read(dioProvider);
      final repository = TripRepository(dio);

      await repository.manageTripSpot(
        tripId: widget.tripId,
        spotId: widget.tripSpot.spotId,
        status: newStatus,
      );

      widget.onRefresh();

      if (mounted) {
        Navigator.of(context).pop();
        DialogUtils.showSuccessSnackBar(context, '状态已更新');
      }
    } catch (e) {
      if (mounted) {
        DialogUtils.showErrorSnackBar(context, '操作失败: $e');
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _togglePriority(BuildContext context) async {
    final newPriority = widget.tripSpot.priority == SpotPriority.mustGo
        ? SpotPriority.optional
        : SpotPriority.mustGo;

    setState(() => _isLoading = true);

    try {
      final container = ProviderScope.containerOf(context);
      final dio = container.read(dioProvider);
      final repository = TripRepository(dio);

      await repository.manageTripSpot(
        tripId: widget.tripId,
        spotId: widget.tripSpot.spotId,
        priority: newPriority,
      );

      widget.onRefresh();

      if (mounted) {
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        DialogUtils.showErrorSnackBar(context, '操作失败: $e');
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _showCheckInDialog(BuildContext context) {
    Navigator.of(context).pop();
    showDialog<void>(
      context: context,
      builder: (context) => _CheckInDialog(
        tripId: widget.tripId,
        tripSpot: widget.tripSpot,
        onRefresh: widget.onRefresh,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const SizedBox(
        height: 200,
        child: Center(child: CircularProgressIndicator()),
      );
    }

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.tripSpot.spot?.name ?? 'Spot',
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            if (widget.tripSpot.status != TripSpotStatus.wishlist)
              ListTile(
                leading: const Icon(Icons.bookmark_outline),
                title: const Text('Move to Wishlist'),
                onTap: () => _changeStatus(context, TripSpotStatus.wishlist),
              ),
            if (widget.tripSpot.status != TripSpotStatus.todaysPlan)
              ListTile(
                leading: const Icon(Icons.today_outlined),
                title: const Text("Add to Today's Plan"),
                onTap: () => _changeStatus(context, TripSpotStatus.todaysPlan),
              ),
            if (widget.tripSpot.status != TripSpotStatus.visited)
              ListTile(
                leading: const Icon(Icons.check_circle_outline),
                title: const Text('Mark as Visited'),
                onTap: () => _showCheckInDialog(context),
              ),
            ListTile(
              leading: Icon(
                widget.tripSpot.priority == SpotPriority.mustGo
                    ? Icons.star
                    : Icons.star_outline,
              ),
              title: Text(
                widget.tripSpot.priority == SpotPriority.mustGo
                    ? 'Remove from Must Go'
                    : 'Mark as Must Go',
              ),
              onTap: () => _togglePriority(context),
            ),
          ],
        ),
      ),
    );
  }
}

class _CheckInDialog extends StatefulWidget {

  const _CheckInDialog({
    required this.tripId,
    required this.tripSpot,
    required this.onRefresh,
  });
  final String tripId;
  final TripSpot tripSpot;
  final VoidCallback onRefresh;

  @override
  State<_CheckInDialog> createState() => _CheckInDialogState();
}

class _CheckInDialogState extends State<_CheckInDialog> {
  DateTime _visitDate = DateTime.now();
  int _rating = 3;
  final _notesController = TextEditingController();
  bool _isLoading = false;

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _checkIn() async {
    setState(() => _isLoading = true);

    try {
      final container = ProviderScope.containerOf(context);
      final dio = container.read(dioProvider);
      final repository = TripRepository(dio);

      await repository.manageTripSpot(
        tripId: widget.tripId,
        spotId: widget.tripSpot.spotId,
        status: TripSpotStatus.visited,
        visitDate: _visitDate,
        userRating: _rating,
        userNotes:
            _notesController.text.isEmpty ? null : _notesController.text,
      );

      widget.onRefresh();

      if (mounted) {
        Navigator.of(context).pop();
        DialogUtils.showSuccessSnackBar(context, '打卡成功！');
      }
    } catch (e) {
      if (mounted) {
        DialogUtils.showErrorSnackBar(context, '操作失败: $e');
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
      title: const Text('Check In'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Date picker
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.calendar_today),
              title: Text(DateFormat('MMM d, yyyy').format(_visitDate)),
              trailing: const Icon(Icons.edit),
              onTap: () async {
                final date = await showDatePicker(
                  context: context,
                  initialDate: _visitDate,
                  firstDate: DateTime(2020),
                  lastDate: DateTime.now(),
                );
                if (date != null) {
                  setState(() => _visitDate = date);
                }
              },
            ),
            const SizedBox(height: 16),
            // Rating
            const Text(
              'Rating',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(
                5,
                (index) => IconButton(
                  icon: Icon(
                    index < _rating ? Icons.star : Icons.star_border,
                    color: Colors.amber,
                    size: 32,
                  ),
                  onPressed: () {
                    setState(() => _rating = index + 1);
                  },
                ),
              ),
            ),
            const SizedBox(height: 16),
            // Notes
            TextField(
              controller: _notesController,
              decoration: const InputDecoration(
                labelText: 'Notes (optional)',
                hintText: 'Share your thoughts...',
                border: OutlineInputBorder(),
              ),
              maxLines: 3,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _isLoading ? null : _checkIn,
          child: _isLoading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Check In'),
        ),
      ],
    );
}





