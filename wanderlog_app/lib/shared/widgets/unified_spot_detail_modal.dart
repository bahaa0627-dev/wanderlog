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
import 'package:wanderlog/shared/models/trip_spot_model.dart' show TripSpotStatus, SpotPriority;
import 'package:wanderlog/shared/utils/destination_utils.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';
import 'package:wanderlog/features/trips/presentation/widgets/myland/check_in_dialog.dart';

/// Unified Spot Detail Modal - used by all entry points
/// Supports both spot_model.Spot and map_page.Spot (via adapter)
class UnifiedSpotDetailModal extends ConsumerStatefulWidget {
  const UnifiedSpotDetailModal({
    required this.spot,
    this.initialIsSaved,
    this.initialIsMustGo,
    this.initialIsTodaysPlan,
    this.onStatusChanged,
    this.keepOpenOnAction = false,
    super.key,
  });

  // Accept either spot_model.Spot or a map_page.Spot-like object
  final dynamic spot;
  final bool? initialIsSaved;
  final bool? initialIsMustGo;
  final bool? initialIsTodaysPlan;
  final void Function(String spotId, {bool? isMustGo, bool? isTodaysPlan, bool? isVisited, bool? isRemoved, bool? needsReload})? onStatusChanged;
  final bool keepOpenOnAction; // If true, don't close modal after actions

  @override
  ConsumerState<UnifiedSpotDetailModal> createState() => _UnifiedSpotDetailModalState();
}

class _UnifiedSpotDetailModalState extends ConsumerState<UnifiedSpotDetailModal> {
  final PageController _imagePageController = PageController();
  int _currentImageIndex = 0;
  bool _isWishlist = false;
  bool _isMustGo = false;
  bool _isTodaysPlan = false;
  bool _isVisited = false;
  bool _isActionLoading = false;
  bool _isMustGoLoading = false;
  bool _isTodaysPlanLoading = false;
  String? _destinationId;
  bool _hasStatusChanged = false;
  DateTime? _visitDate;
  int? _userRating;
  String? _userNotes;
  List<String> _userPhotos = [];

  // Adapter methods to handle different Spot types
  String get _spotId {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).id;
    }
    try {
      return (widget.spot as dynamic).id as String;
    } catch (e) {
      return '';
    }
  }

  String get _spotName {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).name;
    }
    try {
      return (widget.spot as dynamic).name as String;
    } catch (e) {
      return '';
    }
  }

  String? get _spotCity {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).city;
    }
    try {
      return (widget.spot as dynamic).city as String?;
    } catch (e) {
      return null;
    }
  }

  String? get _spotAddress {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).address;
    }
    try {
      return (widget.spot as dynamic).address as String?;
    } catch (e) {
      return null;
    }
  }

  String? get _spotDescription {
    try {
      if (widget.spot is Spot) {
        // Spot model doesn't have aiSummary, check if it has description
        return null; // Spot model doesn't have description field in the model
      }
      // For map_page.Spot, try aiSummary first
      final aiSummary = (widget.spot as dynamic).aiSummary as String?;
      if (aiSummary != null && aiSummary.isNotEmpty) return aiSummary;
      return (widget.spot as dynamic).description as String?;
    } catch (e) {
      return null;
    }
  }

  double? get _spotRating {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).rating;
    }
    try {
      return (widget.spot as dynamic).rating as double?;
    } catch (e) {
      return null;
    }
  }

  int? get _spotRatingCount {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).ratingCount;
    }
    try {
      return (widget.spot as dynamic).ratingCount as int?;
    } catch (e) {
      return null;
    }
  }

  List<String> get _spotTags {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).tags;
    }
    try {
      return (widget.spot as dynamic).tags as List<String>? ?? <String>[];
    } catch (e) {
      return <String>[];
    }
  }

  List<String> get _spotImages {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).images;
    }
    try {
      return (widget.spot as dynamic).images as List<String>? ?? <String>[];
    } catch (e) {
      return <String>[];
    }
  }

  double _getLatitude() {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).latitude;
    }
    try {
      return (widget.spot as dynamic).latitude as double? ?? 0.0;
    } catch (e) {
      return 0.0;
    }
  }

  double _getLongitude() {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).longitude;
    }
    try {
      return (widget.spot as dynamic).longitude as double? ?? 0.0;
    } catch (e) {
      return 0.0;
    }
  }

  String? _getCategory() {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).category;
    }
    try {
      return (widget.spot as dynamic).category as String?;
    } catch (e) {
      return null;
    }
  }

  @override
  void initState() {
    super.initState();
    if (widget.initialIsSaved != null) {
      _isWishlist = widget.initialIsSaved!;
      _isMustGo = widget.initialIsMustGo ?? false;
      _isTodaysPlan = widget.initialIsTodaysPlan ?? false;
    }
    _loadWishlistStatus();
  }

  @override
  void dispose() {
    _imagePageController.dispose();
    super.dispose();
  }

  Uint8List? _decodeBase64Image(String dataUri) {
    try {
      final base64Data = dataUri.split(',').last;
      return base64Decode(base64Data);
    } catch (e) {
      return null;
    }
  }

  Widget _buildPlaceholder() {
    return Container(
      decoration: const BoxDecoration(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        color: AppTheme.lightGray,
      ),
      child: const Center(
        child: Icon(Icons.image_outlined, size: 64, color: AppTheme.mediumGray),
      ),
    );
  }

  List<String> _effectiveTags() {
    final List<String> result = [];
    final Set<String> seen = {};
    final category = _getCategory();
    if (category != null && category.isNotEmpty) {
      result.add(category);
      seen.add(category.toLowerCase());
    }
    for (final tag in _spotTags) {
      final key = tag.toLowerCase();
      if (seen.add(key)) {
        result.add(tag);
      }
    }
    return result;
  }

  Future<void> _loadWishlistStatus() async {
    final auth = ref.read(authProvider);
    if (!auth.isAuthenticated) return;
    try {
      final repo = ref.read(tripRepositoryProvider);
      final trips = await repo.getMyTrips();
      for (final t in trips) {
        try {
          final detail = await repo.getTripById(t.id);
          final tripSpot = detail.tripSpots?.firstWhere(
            (ts) => ts.spotId == _spotId,
            orElse: () => throw StateError('not found'),
          );
          if (tripSpot != null) {
            _destinationId = detail.id;
            if (mounted) {
              setState(() {
                // Check if spot is in wishlist (any status means it's saved)
                _isWishlist = tripSpot.status != null;
                _isMustGo = tripSpot.priority == SpotPriority.mustGo;
                _isTodaysPlan = tripSpot.status == TripSpotStatus.todaysPlan;
                _isVisited = tripSpot.status == TripSpotStatus.visited;
                // Load check-in info regardless of wishlist status
                _visitDate = tripSpot.visitDate;
                _userRating = tripSpot.userRating;
                _userNotes = tripSpot.userNotes;
                _userPhotos = tripSpot.userPhotos;
              });
            }
            return;
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  Widget _buildCheckInButton() {
    return GestureDetector(
      onTap: _isVisited ? null : _handleCheckIn,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: _isVisited ? AppTheme.background : AppTheme.primaryYellow,
          borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
          border: Border.all(color: AppTheme.black, width: AppTheme.borderMedium),
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

  Future<void> _handleCheckIn() async {
    final authed = await requireAuth(context, ref);
    if (!authed) return;
    if (!context.mounted) return;
    
    final now = DateTime.now();
    final spotModel = Spot(
      id: _spotId,
      googlePlaceId: _spotId,
      name: _spotName,
      city: _spotCity ?? '',
      latitude: _getLatitude(),
      longitude: _getLongitude(),
      tags: _spotTags,
      images: _spotImages,
      rating: _spotRating,
      ratingCount: _spotRatingCount,
      category: _getCategory(),
      createdAt: now,
      updatedAt: now,
    );
    
    showDialog<void>(
      context: context,
      builder: (context) => CheckInDialog(
        spot: spotModel,
        onCheckIn: (visitDate, rating, notes) async {
          try {
            final city = _spotCity ?? '';
            final destId = _destinationId ?? await ensureDestinationForCity(ref, city);
            if (destId == null) {
              CustomToast.showError(context, 'Failed to create destination');
              return;
            }
            _destinationId = destId;
            await ref.read(tripRepositoryProvider).manageTripSpot(
              tripId: destId,
              spotId: _spotId,
              status: TripSpotStatus.visited,
              visitDate: visitDate,
              userRating: rating.toInt(),
              userNotes: notes,
              spotPayload: _spotPayload(),
            );
            ref.invalidate(tripsProvider);
            if (mounted) {
              setState(() {
                // Check-in creates a tripSpot entry, so it's technically "saved"
                _isWishlist = true;
                _isVisited = true;
                _visitDate = visitDate;
                _userRating = rating.toInt();
                _userNotes = notes;
                _isTodaysPlan = false;
              });
              CustomToast.showSuccess(context, 'Checked in to $_spotName');
              widget.onStatusChanged?.call(_spotId, isVisited: true, isTodaysPlan: false);
              if (!widget.keepOpenOnAction) {
                Navigator.of(context).pop({'success': true});
              }
            }
          } catch (e) {
            CustomToast.showError(context, 'Error: $e');
          }
        },
      ),
    );
  }

  Future<void> _handleEditCheckIn() async {
    if (!_isVisited || _visitDate == null) return;
    
    final now = DateTime.now();
    final spotModel = Spot(
      id: _spotId,
      googlePlaceId: _spotId,
      name: _spotName,
      city: _spotCity ?? '',
      latitude: _getLatitude(),
      longitude: _getLongitude(),
      tags: _spotTags,
      images: _spotImages,
      rating: _spotRating,
      ratingCount: _spotRatingCount,
      category: _getCategory(),
      createdAt: now,
      updatedAt: now,
    );
    
    showDialog<void>(
      context: context,
      builder: (context) => CheckInDialog(
        spot: spotModel,
        isEditMode: true,
        initialVisitDate: _visitDate,
        initialRating: _userRating?.toDouble(),
        initialNotes: _userNotes,
        onCheckIn: (visitDate, rating, notes) async {
          try {
            if (_destinationId == null) {
              CustomToast.showError(context, 'Destination not found');
              return;
            }
            await ref.read(tripRepositoryProvider).manageTripSpot(
              tripId: _destinationId!,
              spotId: _spotId,
              status: TripSpotStatus.visited,
              visitDate: visitDate,
              userRating: rating.toInt(),
              userNotes: notes,
            );
            ref.invalidate(tripsProvider);
            // Reload check-in info to get latest data
            await _loadWishlistStatus();
            if (mounted) {
              CustomToast.showSuccess(context, 'Check-in updated');
              widget.onStatusChanged?.call(_spotId, isVisited: true, needsReload: true);
              // Don't pop here - CheckInDialog will close itself, and we want to stay on detail page
            }
          } catch (e) {
            CustomToast.showError(context, 'Error: $e');
          }
        },
      ),
    );
  }

  Future<void> _handleDeleteCheckIn() async {
    if (!_isVisited || _destinationId == null) return;
    
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppTheme.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
          side: const BorderSide(color: AppTheme.black, width: AppTheme.borderMedium),
        ),
        title: Text(
          'Delete Check-in',
          style: AppTheme.headlineMedium(context).copyWith(fontWeight: FontWeight.bold),
        ),
        content: Text(
          'Are you sure you want to delete this check-in? This action cannot be undone.',
          style: AppTheme.bodyMedium(context),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(
              'Cancel',
              style: AppTheme.labelLarge(context).copyWith(
                color: AppTheme.black,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primaryYellow,
              foregroundColor: AppTheme.black,
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                side: const BorderSide(color: AppTheme.black, width: AppTheme.borderMedium),
              ),
            ),
            child: Text(
              'Delete',
              style: AppTheme.labelLarge(context).copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
    );
    
    if (confirmed == true) {
      try {
        await ref.read(tripRepositoryProvider).manageTripSpot(
          tripId: _destinationId!,
          spotId: _spotId,
          remove: true,
        );
        ref.invalidate(tripsProvider);
        if (mounted) {
          setState(() {
            _isVisited = false;
            _visitDate = null;
            _userRating = null;
            _userNotes = null;
            _userPhotos = [];
            _isWishlist = false;
          });
          CustomToast.showSuccess(context, 'Check-in deleted');
          widget.onStatusChanged?.call(_spotId, isVisited: false, isRemoved: true);
        }
      } catch (e) {
        CustomToast.showError(context, 'Error: $e');
      }
    }
  }

  Widget _buildUserCheckInInfo() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.background,
        borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
        border: Border.all(color: AppTheme.black, width: AppTheme.borderThin),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('✓', style: TextStyle(fontSize: 20)),
              const SizedBox(width: 8),
              Expanded(
                child: Text('Your Visit', style: AppTheme.headlineMedium(context).copyWith(fontWeight: FontWeight.bold)),
              ),
              // Edit icon
              GestureDetector(
                onTap: _handleEditCheckIn,
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppTheme.background,
                    borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                    border: Border.all(color: AppTheme.black, width: AppTheme.borderThin),
                  ),
                  child: const Icon(Icons.edit, size: 18, color: AppTheme.black),
                ),
              ),
              const SizedBox(width: 8),
              // Delete icon
              GestureDetector(
                onTap: _handleDeleteCheckIn,
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppTheme.background,
                    borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                    border: Border.all(color: AppTheme.black, width: AppTheme.borderThin),
                  ),
                  child: const Icon(Icons.delete_outline, size: 18, color: AppTheme.black),
                ),
              ),
            ],
          ),
          if (_visitDate != null) ...[
            const SizedBox(height: 8),
            Text('${_visitDate!.year}/${_visitDate!.month}/${_visitDate!.day}', style: AppTheme.bodySmall(context).copyWith(color: AppTheme.mediumGray)),
          ],
          if (_userRating != null) ...[
            const SizedBox(height: 12),
            Row(children: List.generate(5, (index) => Icon(index < _userRating! ? Icons.star : Icons.star_border, color: AppTheme.primaryYellow, size: 20))),
          ],
          if (_userNotes != null && _userNotes!.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(_userNotes!, style: AppTheme.bodyMedium(context)),
          ],
          if (_userPhotos.isNotEmpty) ...[
            const SizedBox(height: 12),
            SizedBox(
              height: 80,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                itemCount: _userPhotos.length,
                itemBuilder: (context, index) => Container(
                  width: 80,
                  height: 80,
                  margin: const EdgeInsets.only(right: 8),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                    border: Border.all(color: AppTheme.black, width: AppTheme.borderThin),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(AppTheme.radiusSmall - 1),
                    child: _userPhotos[index].startsWith('data:')
                        ? Image.memory(_decodeBase64Image(_userPhotos[index])!, fit: BoxFit.cover)
                        : Image.network(_userPhotos[index], fit: BoxFit.cover),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Future<bool> _handleAddWishlist() async {
    setState(() => _isActionLoading = true);
    try {
      final authed = await requireAuth(context, ref);
      if (!authed) return false;
      final destId = await ensureDestinationForCity(ref, _spotCity ?? '');
      if (destId == null) {
        _showError('Failed to create destination');
        return false;
      }
      _destinationId = destId;
      await ref.read(tripRepositoryProvider).manageTripSpot(
        tripId: destId,
        spotId: _spotId,
        status: TripSpotStatus.wishlist,
        spotPayload: _spotPayload(),
      );
      ref.invalidate(tripsProvider);
      if (mounted) {
        setState(() {
          _isWishlist = true;
          _hasStatusChanged = true;
        });
        return true;
      }
      return false;
    } catch (e) {
      _showError('Error: $e');
      return false;
    } finally {
      if (mounted) setState(() => _isActionLoading = false);
    }
  }

  Future<bool> _handleRemoveWishlist() async {
    if (_destinationId == null) return false;
    setState(() => _isActionLoading = true);
    try {
      await ref.read(tripRepositoryProvider).manageTripSpot(
        tripId: _destinationId!,
        spotId: _spotId,
        remove: true,
      );
      ref.invalidate(tripsProvider);
      if (mounted) {
        setState(() {
          _isWishlist = false;
          _hasStatusChanged = true;
        });
        widget.onStatusChanged?.call(_spotId, isRemoved: true);
        return true;
      }
      return false;
    } catch (e) {
      _showError('Error: $e');
      return false;
    } finally {
      if (mounted) setState(() => _isActionLoading = false);
    }
  }

  Future<bool> _handleToggleMustGo(bool isChecked) async {
    if (_destinationId == null) {
      final destId = await ensureDestinationForCity(ref, _spotCity ?? '');
      if (destId == null) return false;
      _destinationId = destId;
    }
    setState(() => _isMustGoLoading = true);
    try {
      await ref.read(tripRepositoryProvider).manageTripSpot(
        tripId: _destinationId!,
        spotId: _spotId,
        status: TripSpotStatus.wishlist,
        priority: isChecked ? SpotPriority.mustGo : SpotPriority.optional,
      );
      ref.invalidate(tripsProvider);
      if (mounted) {
        setState(() {
          _isMustGo = isChecked;
          _hasStatusChanged = true;
        });
        widget.onStatusChanged?.call(_spotId, isMustGo: isChecked);
        return true;
      }
      return false;
    } catch (e) {
      _showError('Error: $e');
      return false;
    } finally {
      if (mounted) setState(() => _isMustGoLoading = false);
    }
  }

  Future<bool> _handleToggleTodaysPlan(bool isChecked) async {
    if (_destinationId == null) {
      final destId = await ensureDestinationForCity(ref, _spotCity ?? '');
      if (destId == null) return false;
      _destinationId = destId;
    }
    setState(() => _isTodaysPlanLoading = true);
    try {
      await ref.read(tripRepositoryProvider).manageTripSpot(
        tripId: _destinationId!,
        spotId: _spotId,
        status: isChecked ? TripSpotStatus.todaysPlan : TripSpotStatus.wishlist,
      );
      ref.invalidate(tripsProvider);
      if (mounted) {
        setState(() {
          _isTodaysPlan = isChecked;
          _hasStatusChanged = true;
        });
        widget.onStatusChanged?.call(_spotId, isTodaysPlan: isChecked);
        return true;
      }
      return false;
    } catch (e) {
      _showError('Error: $e');
      return false;
    } finally {
      if (mounted) setState(() => _isTodaysPlanLoading = false);
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    CustomToast.showError(context, message);
  }

  Map<String, dynamic> _spotPayload() => {
    'name': _spotName,
    'city': _spotCity ?? '',
    'country': _spotCity ?? '',
    'latitude': _getLatitude(),
    'longitude': _getLongitude(),
    'address': _spotAddress,
    'description': _spotDescription,
    'rating': _spotRating,
    'ratingCount': _spotRatingCount,
    'category': _getCategory(),
    'tags': _spotTags,
    'coverImage': _spotImages.isNotEmpty ? _spotImages.first : null,
    'images': _spotImages,
    'googlePlaceId': _spotId,
    'source': 'app_wishlist',
  };

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.85,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border.all(color: AppTheme.black, width: 2),
      ),
      child: Column(
      children: [
        // Image section with check-in button
        Stack(
          children: [
            SizedBox(
              height: 300,
              child: _spotImages.isNotEmpty
                  ? PageView.builder(
                      controller: _imagePageController,
                      onPageChanged: (index) => setState(() => _currentImageIndex = index),
                      itemCount: _spotImages.length,
                      itemBuilder: (context, index) {
                        final imageSource = _spotImages[index];
                        if (imageSource.startsWith('data:')) {
                          final bytes = _decodeBase64Image(imageSource);
                          if (bytes != null) {
                            return ClipRRect(
                              borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
                              child: Image.memory(
                                bytes,
                                fit: BoxFit.cover,
                                width: double.infinity,
                                height: double.infinity,
                                gaplessPlayback: true,
                                errorBuilder: (_, __, ___) => _buildPlaceholder(),
                              ),
                            );
                          }
                          return _buildPlaceholder();
                        }
                        return ClipRRect(
                          borderRadius: const BorderRadius.vertical(
                            top: Radius.circular(24),
                          ),
                          child: Image.network(
                            imageSource,
                            fit: BoxFit.cover,
                            width: double.infinity,
                            height: double.infinity,
                            gaplessPlayback: true,
                            // Avoid fade/jump during quick rebuilds (e.g. toggling Today's Plan)
                            frameBuilder: (context, child, frame, wasSynchronouslyLoaded) {
                              if (wasSynchronouslyLoaded) return child;
                              return child;
                            },
                            errorBuilder: (_, __, ___) => _buildPlaceholder(),
                          ),
                        );
                      },
                    )
                  : _buildPlaceholder(),
            ),
            if (_spotImages.length > 1)
              Positioned(
                bottom: 12,
                left: 0,
                right: 0,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(_spotImages.length, (index) => Container(
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: index == _currentImageIndex ? AppTheme.primaryYellow : Colors.white.withOpacity(0.5),
                      border: Border.all(color: AppTheme.black, width: 1),
                    ),
                  )),
                ),
              ),
            Positioned(
              top: 16,
              right: 16,
              child: IconButtonCustom(
                icon: Icons.close,
                onPressed: () => Navigator.pop(context, _hasStatusChanged),
                backgroundColor: Colors.white,
              ),
            ),
            Positioned(bottom: 16, right: 16, child: _buildCheckInButton()),
          ],
        ),
        // Scrollable content
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 1. Tags
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: _effectiveTags().map((tag) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: AppTheme.primaryYellow.withOpacity(0.3),
                          borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                          border: Border.all(color: AppTheme.black, width: 2),
                        ),
                        child: Text(tag, style: AppTheme.labelMedium(context)),
                      ),
                    )).toList(),
                  ),
                ),
                const SizedBox(height: 16),
                // 2. Name
                Text(_spotName, style: AppTheme.headlineLarge(context), maxLines: 2, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 16),
                // 3. Description
                if (_spotDescription != null && _spotDescription!.isNotEmpty) ...[
                  Text(_spotDescription!, style: AppTheme.bodyLarge(context).copyWith(color: AppTheme.darkGray)),
                  const SizedBox(height: 16),
                ],
                // 4. Address
                if (_spotAddress != null && _spotAddress!.isNotEmpty) ...[
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.location_on_outlined, size: 18, color: AppTheme.mediumGray),
                      const SizedBox(width: 8),
                      Expanded(child: Text(_spotAddress!, style: AppTheme.bodyMedium(context).copyWith(color: AppTheme.darkGray))),
                    ],
                  ),
                  const SizedBox(height: 16),
                ],
                // 5. Official Rating
                if (_spotRating != null) ...[
                  Row(
                    children: [
                      Text('$_spotRating', style: AppTheme.headlineMedium(context).copyWith(fontWeight: FontWeight.bold)),
                      const SizedBox(width: 8),
                      ...List.generate(5, (index) => Icon(
                        index < _spotRating!.floor() ? Icons.star : (index < _spotRating! ? Icons.star_half : Icons.star_border),
                        color: AppTheme.primaryYellow,
                        size: 24,
                      )),
                      if (_spotRatingCount != null) ...[
                        const SizedBox(width: 8),
                        Text('($_spotRatingCount)', style: AppTheme.bodyMedium(context).copyWith(color: AppTheme.mediumGray)),
                      ],
                    ],
                  ),
                  const SizedBox(height: 24),
                ],
                // 6. User Check-in Info
                if (_isVisited && _visitDate != null) _buildUserCheckInInfo(),
              ],
            ),
          ),
        ),
        // 7. Fixed bottom bar with SaveSpotButton
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border(top: BorderSide(color: AppTheme.black, width: AppTheme.borderMedium)),
          ),
          child: SafeArea(
            top: false,
            child: _isWishlist
                ? SaveSpotButton(
                    isSaved: true,
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
                        if (!widget.keepOpenOnAction) {
                          Navigator.pop(context);
                        }
                      }
                      return ok;
                    },
                    onToggleMustGo: (isChecked) async => await _handleToggleMustGo(isChecked),
                    onToggleTodaysPlan: (isChecked) async => await _handleToggleTodaysPlan(isChecked),
                  )
                : GestureDetector(
                    onTap: _isActionLoading ? null : () async {
                      final success = await _handleAddWishlist();
                      if (success && context.mounted) {
                        CustomToast.showSuccess(context, 'Saved');
                      }
                    },
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      decoration: BoxDecoration(
                        color: AppTheme.primaryYellow,
                        borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                        border: Border.all(color: AppTheme.black, width: 2),
                        boxShadow: AppTheme.cardShadow,
                      ),
                      child: _isActionLoading
                          ? const Center(child: SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.black)))
                          : Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(Icons.favorite_border, color: AppTheme.black, size: 24),
                                const SizedBox(width: 12),
                                Text('Save', style: AppTheme.labelLarge(context).copyWith(color: AppTheme.black, fontWeight: FontWeight.bold, fontSize: 18)),
                              ],
                            ),
                    ),
                  ),
          ),
        ),
      ],
    ),
    );
  }
}

