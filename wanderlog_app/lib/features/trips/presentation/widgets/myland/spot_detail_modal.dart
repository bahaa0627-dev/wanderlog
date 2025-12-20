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

/// Callback for MustGo/TodaysPlan state changes
typedef SpotStatusCallback = void Function(String spotId, {bool? isMustGo, bool? isTodaysPlan, bool? isRemoved});

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
  bool _isActionLoading = false;
  String? _destinationId;

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
                          itemBuilder: (context, index) => Container(
                            decoration: BoxDecoration(
                              borderRadius: const BorderRadius.vertical(
                                top: Radius.circular(24),
                              ),
                              image: DecorationImage(
                                image: NetworkImage(widget.spot.images[index]),
                                fit: BoxFit.cover,
                              ),
                            ),
                          ),
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
                    const SizedBox(height: 24),
                    SaveSpotButton(
                      isSaved: _isWishlist,
                      isMustGo: _isMustGo,
                      isTodaysPlan: _isTodaysPlan,
                      isLoading: _isActionLoading,
                      onSave: () async {
                        // Already saved
                        return true;
                      },
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
                  ],
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
    setState(() => _isActionLoading = true);
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
        setState(() => _isActionLoading = false);
      }
    }
  }

  Future<bool> _handleToggleTodaysPlan(bool isChecked) async {
    setState(() => _isActionLoading = true);
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
        setState(() => _isActionLoading = false);
      }
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    CustomToast.showError(context, message);
  }
}

