import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/shared/models/spot_model.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';
import 'package:wanderlog/shared/widgets/save_spot_button.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart';
import 'package:wanderlog/shared/utils/destination_utils.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';
import 'package:wanderlog/features/trips/presentation/widgets/myland/check_in_dialog.dart';

/// Callback for MustGo/TodaysPlan/Visited state changes
typedef SpotStatusCallback = void Function(String spotId, {bool? isMustGo, bool? isTodaysPlan, bool? isVisited, bool? isRemoved});

/// Spot Detail Modal for MyLand page - displays spot details with save functionality
class MyLandSpotDetailModal extends ConsumerStatefulWidget {
  const MyLandSpotDetailModal({
    required this.spot,
    this.isMustGo = false,
    this.isTodaysPlan = false,
    this.onStatusChanged,
    super.key,
  });

  final Spot spot;
  final bool isMustGo;
  final bool isTodaysPlan;
  final SpotStatusCallback? onStatusChanged;

  @override
  ConsumerState<MyLandSpotDetailModal> createState() => _MyLandSpotDetailModalState();
}

class _MyLandSpotDetailModalState extends ConsumerState<MyLandSpotDetailModal> {
  final PageController _imagePageController = PageController();
  int _currentImageIndex = 0;
  bool _isWishlist = true; // Already in wishlist since it's in myland
  bool _isMustGo = false;
  bool _isTodaysPlan = false;
  bool _isVisited = false; // Check-in status
  bool _isActionLoading = false; // Only for save/unsave operations
  bool _isMustGoLoading = false; // Separate loading for MustGo
  bool _isTodaysPlanLoading = false; // Separate loading for Today's Plan
  String? _destinationId;
  DateTime? _visitDate;
  int? _userRating;
  String? _userNotes;
  List<String> _userPhotos = [];

  @override
  void initState() {
    super.initState();
    _isMustGo = widget.isMustGo;
    _isTodaysPlan = widget.isTodaysPlan;
    _loadStatus();
  }

  @override
  void dispose() {
    _imagePageController.dispose();
    super.dispose();
  }

  /// Decode base64 image data from data URI
  Uint8List? _decodeBase64Image(String dataUri) {
    try {
      final base64Data = dataUri.split(',').last;
      return base64Decode(base64Data);
    } catch (e) {
      return null;
    }
  }

  /// Build placeholder widget for missing images
  Widget _buildPlaceholder() {
    return Container(
      decoration: const BoxDecoration(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(24),
        ),
        color: AppTheme.lightGray,
      ),
      child: const Center(
        child: Icon(
          Icons.image_outlined,
          size: 64,
          color: AppTheme.mediumGray,
        ),
      ),
    );
  }

  List<String> _effectiveTags() {
    final List<String> result = [];
    final Set<String> seen = {};

    final category = (widget.spot.category ?? '').trim();
    if (category.isNotEmpty) {
      result.add(category);
      seen.add(category.toLowerCase());
    }

    for (final raw in widget.spot.tags) {
      final tag = raw.toString().trim();
      if (tag.isEmpty) continue;
      final key = tag.toLowerCase();
      if (seen.add(key)) {
        result.add(tag);
      }
    }

    return result;
  }

  Widget _buildCheckInButton() {
    return GestureDetector(
      onTap: _isVisited ? null : _handleCheckIn,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: _isVisited ? AppTheme.background : AppTheme.primaryYellow,
          borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
          border: Border.all(
            color: AppTheme.black,
            width: AppTheme.borderMedium,
          ),
          boxShadow: _isVisited ? null : AppTheme.cardShadow,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_isVisited) ...[
              const Text('✓', style: TextStyle(fontSize: 16)),
              const SizedBox(width: 6),
            ],
            Text(
              _isVisited ? 'Checked in' : 'Check in',
              style: AppTheme.labelMedium(context).copyWith(
                color: AppTheme.black,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildUserCheckInInfo() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.background,
        borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
        border: Border.all(
          color: AppTheme.black,
          width: AppTheme.borderThin,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('✓', style: TextStyle(fontSize: 20)),
              const SizedBox(width: 8),
              Text(
                'Your Visit',
                style: AppTheme.headlineMedium(context).copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          if (_visitDate != null) ...[
            const SizedBox(height: 8),
            Text(
              _formatVisitDate(_visitDate!),
              style: AppTheme.bodySmall(context).copyWith(
                color: AppTheme.mediumGray,
              ),
            ),
          ],
          if (_userRating != null) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                ...List.generate(
                  5,
                  (index) => Icon(
                    index < _userRating!
                        ? Icons.star
                        : Icons.star_border,
                    color: AppTheme.primaryYellow,
                    size: 20,
                  ),
                ),
              ],
            ),
          ],
          if (_userNotes != null && _userNotes!.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              _userNotes!,
              style: AppTheme.bodyMedium(context),
            ),
          ],
          if (_userPhotos.isNotEmpty) ...[
            const SizedBox(height: 12),
            SizedBox(
              height: 80,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                itemCount: _userPhotos.length,
                itemBuilder: (context, index) {
                  return Container(
                    width: 80,
                    height: 80,
                    margin: const EdgeInsets.only(right: 8),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                      border: Border.all(
                        color: AppTheme.black,
                        width: AppTheme.borderThin,
                      ),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(AppTheme.radiusSmall - 1),
                      child: _userPhotos[index].startsWith('data:')
                          ? Image.memory(
                              _decodeBase64Image(_userPhotos[index])!,
                              fit: BoxFit.cover,
                            )
                          : Image.network(
                              _userPhotos[index],
                              fit: BoxFit.cover,
                            ),
                    ),
                  );
                },
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _formatVisitDate(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date);
    if (diff.inDays == 0) {
      return 'Today';
    } else if (diff.inDays == 1) {
      return 'Yesterday';
    } else if (diff.inDays < 7) {
      return '${diff.inDays} days ago';
    } else {
      return '${date.month}/${date.day}/${date.year}';
    }
  }

  @override
  Widget build(BuildContext context) => Container(
        height: MediaQuery.of(context).size.height * 0.85,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: const BorderRadius.vertical(
            top: Radius.circular(24),
          ),
          border: Border.all(color: AppTheme.black, width: 2),
        ),
        child: Column(
          children: [
            Stack(
              children: [
                SizedBox(
                  height: 300,
                  child: widget.spot.images.isNotEmpty
                      ? PageView.builder(
                          controller: _imagePageController,
                          onPageChanged: (index) {
                            setState(() {
                              _currentImageIndex = index;
                            });
                          },
                          itemCount: widget.spot.images.length,
                          itemBuilder: (context, index) {
                            final imageSource = widget.spot.images[index];
                            // Handle data URI images
                            if (imageSource.startsWith('data:')) {
                              final bytes = _decodeBase64Image(imageSource);
                              if (bytes != null) {
                                return ClipRRect(
                                  borderRadius: const BorderRadius.vertical(
                                    top: Radius.circular(24),
                                  ),
                                  child: Image.memory(
                                    bytes,
                                    fit: BoxFit.cover,
                                    width: double.infinity,
                                    height: double.infinity,
                                    errorBuilder: (_, __, ___) => _buildPlaceholder(),
                                  ),
                                );
                              }
                              return _buildPlaceholder();
                            }
                            // Handle network URLs
                            return Container(
                              decoration: BoxDecoration(
                                borderRadius: const BorderRadius.vertical(
                                  top: Radius.circular(24),
                                ),
                                image: DecorationImage(
                                  image: NetworkImage(imageSource),
                                  fit: BoxFit.cover,
                                ),
                              ),
                            );
                          },
                        )
                      : Container(
                          decoration: const BoxDecoration(
                            borderRadius: BorderRadius.vertical(
                              top: Radius.circular(24),
                            ),
                            color: AppTheme.lightGray,
                          ),
                          child: const Center(
                            child: Icon(
                              Icons.image_outlined,
                              size: 64,
                              color: AppTheme.mediumGray,
                            ),
                          ),
                        ),
                ),
                if (widget.spot.images.length > 1)
                  Positioned(
                    bottom: 12,
                    left: 0,
                    right: 0,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(
                        widget.spot.images.length,
                        (index) => Container(
                          margin: const EdgeInsets.symmetric(horizontal: 4),
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: index == _currentImageIndex
                                ? AppTheme.primaryYellow
                                : Colors.white.withOpacity(0.5),
                            border: Border.all(color: AppTheme.black, width: 1),
                          ),
                        ),
                      ),
                    ),
                  ),
                Positioned(
                  top: 16,
                  right: 16,
                  child: IconButtonCustom(
                    icon: Icons.close,
                    onPressed: () => Navigator.pop(context),
                    backgroundColor: Colors.white,
                  ),
                ),
                // Check-in button in bottom right corner
                Positioned(
                  bottom: 16,
                  right: 16,
                  child: _buildCheckInButton(),
                ),
              ],
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _effectiveTags()
                          .map(
                            (tag) => Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 6,
                              ),
                              decoration: BoxDecoration(
                                color: AppTheme.primaryYellow.withOpacity(0.3),
                                borderRadius: BorderRadius.circular(
                                  AppTheme.radiusSmall,
                                ),
                                border: Border.all(
                                  color: AppTheme.black,
                                  width: 2,
                                ),
                              ),
                              child: Text(
                                tag,
                                style: AppTheme.labelMedium(context),
                              ),
                            ),
                          )
                          .toList(),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      widget.spot.name,
                      style: AppTheme.headlineLarge(context),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 16),
                    if (widget.spot.address != null && widget.spot.address!.isNotEmpty) ...[
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(
                            Icons.location_on_outlined,
                            size: 18,
                            color: AppTheme.mediumGray,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              widget.spot.address!,
                              style: AppTheme.bodyMedium(context).copyWith(
                                color: AppTheme.darkGray,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                    ],
                    if (widget.spot.rating != null)
                      Row(
                        children: [
                          Text(
                            '${widget.spot.rating}',
                            style: AppTheme.headlineMedium(context).copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(width: 8),
                          ...List.generate(
                            5,
                            (index) => Icon(
                              index < widget.spot.rating!.floor()
                                  ? Icons.star
                                  : (index < widget.spot.rating!
                                      ? Icons.star_half
                                      : Icons.star_border),
                              color: AppTheme.primaryYellow,
                              size: 24,
                            ),
                          ),
                          const SizedBox(width: 8),
                          if (widget.spot.ratingCount != null)
                            Text(
                              '(${widget.spot.ratingCount})',
                              style: AppTheme.bodyMedium(context).copyWith(
                                color: AppTheme.mediumGray,
                              ),
                            ),
                        ],
                      ),
                    // User check-in information (if visited) - shown below official rating
                    if (_isVisited && _visitDate != null) ...[
                      const SizedBox(height: 24),
                      _buildUserCheckInInfo(),
                    ],
                  ],
                ),
              ),
            ),
            // Fixed bottom bar with SaveSpotButton
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border(
                  top: BorderSide(
                    color: AppTheme.black,
                    width: AppTheme.borderMedium,
                  ),
                ),
              ),
              child: SafeArea(
                top: false,
                child: SaveSpotButton(
                  isSaved: _isWishlist,
                  isMustGo: _isMustGo,
                  isTodaysPlan: _isTodaysPlan,
                  isLoading: _isActionLoading,
                  isMustGoLoading: _isMustGoLoading,
                  isTodaysPlanLoading: _isTodaysPlanLoading,
                  onSave: () async => true,
                  onUnsave: () async {
                    final ok = await _handleRemoveWishlist();
                    if (ok && context.mounted) {
                      CustomToast.showSuccess(context, 'Removed from wishlist');
                      Navigator.pop(context);
                    }
                    return ok;
                  },
                  onToggleMustGo: (isChecked) async {
                    return await _handleToggleMustGo(isChecked);
                  },
                  onToggleTodaysPlan: (isChecked) async {
                    return await _handleToggleTodaysPlan(isChecked);
                  },
                ),
              ),
            ),
          ],
        ),
      );

  Future<void> _loadStatus() async {
    final auth = ref.read(authProvider);
    if (!auth.isAuthenticated) return;
    try {
      final repo = ref.read(tripRepositoryProvider);
      final trips = await repo.getMyTrips();
      for (final t in trips) {
        try {
          final detail = await repo.getTripById(t.id);
          final tripSpot = detail.tripSpots?.firstWhere(
            (ts) => ts.spotId == widget.spot.id,
            orElse: () => throw StateError('not found'),
          );
          if (tripSpot != null) {
            _destinationId = detail.id;
            if (mounted) {
              setState(() {
                _isWishlist = true;
                _isMustGo = tripSpot.priority == SpotPriority.mustGo;
                _isTodaysPlan = tripSpot.status == TripSpotStatus.todaysPlan;
                _isVisited = tripSpot.status == TripSpotStatus.visited;
                _visitDate = tripSpot.visitDate;
                _userRating = tripSpot.userRating;
                _userNotes = tripSpot.userNotes;
                _userPhotos = tripSpot.userPhotos;
              });
            }
            return;
          }
        } catch (_) {
          // ignore this trip
        }
      }
    } catch (_) {
      // ignore preload errors
    }
  }

  Future<bool> _handleRemoveWishlist() async {
    setState(() => _isActionLoading = true);
    try {
      final authed = await requireAuth(context, ref);
      if (!authed) return false;

      final city = widget.spot.city ?? '';
      final destId = _destinationId ?? await ensureDestinationForCity(ref, city);
      if (destId == null) {
        _showError('Failed to load destination');
        return false;
      }

      await ref.read(tripRepositoryProvider).manageTripSpot(
            tripId: destId,
            spotId: widget.spot.id,
            remove: true,
          );
      ref.invalidate(tripsProvider);
      if (mounted) {
        setState(() {
          _isWishlist = false;
          _isMustGo = false;
          _isTodaysPlan = false;
        });
        // Notify parent about removal
        widget.onStatusChanged?.call(widget.spot.id, isRemoved: true);
      }
      return true;
    } catch (e) {
      _showError('Error: $e');
      return false;
    } finally {
      if (mounted) {
        setState(() => _isActionLoading = false);
      }
    }
  }

  Future<bool> _handleToggleMustGo(bool isChecked) async {
    setState(() => _isMustGoLoading = true);
    try {
      final authed = await requireAuth(context, ref);
      if (!authed) return false;

      final city = widget.spot.city ?? '';
      final destId = _destinationId ?? await ensureDestinationForCity(ref, city);
      if (destId == null) {
        _showError('Failed to create destination');
        return false;
      }
      _destinationId = destId;

      await ref.read(tripRepositoryProvider).manageTripSpot(
            tripId: destId,
            spotId: widget.spot.id,
            status: TripSpotStatus.wishlist,
            priority: isChecked ? SpotPriority.mustGo : SpotPriority.optional,
          );

      ref.invalidate(tripsProvider);
      if (mounted) {
        setState(() => _isMustGo = isChecked);
        // Notify parent about MustGo change
        widget.onStatusChanged?.call(widget.spot.id, isMustGo: isChecked);
        CustomToast.showSuccess(
          context,
          isChecked ? 'Added to MustGo' : 'Removed from MustGo',
        );
      }
      return true;
    } catch (e) {
      _showError('Error: $e');
      return false;
    } finally {
      if (mounted) {
        setState(() => _isMustGoLoading = false);
      }
    }
  }

  Future<bool> _handleToggleTodaysPlan(bool isChecked) async {
    setState(() => _isTodaysPlanLoading = true);
    try {
      final authed = await requireAuth(context, ref);
      if (!authed) return false;

      final city = widget.spot.city ?? '';
      final destId = _destinationId ?? await ensureDestinationForCity(ref, city);
      if (destId == null) {
        _showError('Failed to create destination');
        return false;
      }
      _destinationId = destId;

      await ref.read(tripRepositoryProvider).manageTripSpot(
            tripId: destId,
            spotId: widget.spot.id,
            status: isChecked ? TripSpotStatus.todaysPlan : TripSpotStatus.wishlist,
          );

      ref.invalidate(tripsProvider);
      if (mounted) {
        setState(() => _isTodaysPlan = isChecked);
        // Notify parent about Today's Plan change
        widget.onStatusChanged?.call(widget.spot.id, isTodaysPlan: isChecked);
        CustomToast.showSuccess(
          context,
          isChecked ? "Added to Today's Plan" : "Removed from Today's Plan",
        );
      }
      return true;
    } catch (e) {
      _showError('Error: $e');
      return false;
    } finally {
      if (mounted) {
        setState(() => _isTodaysPlanLoading = false);
      }
    }
  }

  Future<void> _handleCheckIn() async {
    // Check authentication first
    final authed = await requireAuth(context, ref);
    if (!authed) return; // User not logged in, already navigated to login page
    
    // User is logged in, show check-in dialog
    if (!context.mounted) return;
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => CheckInDialog(
        spot: widget.spot,
        onCheckIn: (visitDate, rating, notes) async {
          try {

            final city = widget.spot.city ?? '';
            final destId = _destinationId ?? await ensureDestinationForCity(ref, city);
            if (destId == null) {
              _showError('Failed to create destination');
              return;
            }
            _destinationId = destId;

            await ref.read(tripRepositoryProvider).manageTripSpot(
                  tripId: destId,
                  spotId: widget.spot.id,
                  status: TripSpotStatus.visited,
                  visitDate: visitDate,
                  userRating: rating.toInt(),
                  userNotes: notes,
                );

            ref.invalidate(tripsProvider);
            if (mounted) {
              setState(() {
                _isVisited = true;
                _visitDate = visitDate;
                _userRating = rating.toInt();
                _userNotes = notes;
                _isTodaysPlan = false; // Remove from Today's Plan when checked in
              });
              CustomToast.showSuccess(context, 'Checked in to ${widget.spot.name}');
              // Notify parent about check-in
              widget.onStatusChanged?.call(
                widget.spot.id,
                isMustGo: _isMustGo,
                isTodaysPlan: false,
                isVisited: true,
              );
              Navigator.of(context).pop({'success': true});
            }
          } catch (e) {
            _showError('Error: $e');
          }
        },
      ),
    );
  }

  void _showError(String message) {
    if (!mounted) return;
    CustomToast.showError(context, message);
  }
}

