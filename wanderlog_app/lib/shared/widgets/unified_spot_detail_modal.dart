import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/shared/models/spot_model.dart';
import 'package:wanderlog/shared/widgets/ui_components.dart';
import 'package:wanderlog/shared/widgets/save_spot_button.dart';
import 'package:wanderlog/features/auth/providers/auth_provider.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/features/ai_recognition/providers/wishlist_status_provider.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart' show TripSpotStatus, SpotPriority;
import 'package:wanderlog/shared/utils/destination_utils.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';
import 'package:wanderlog/shared/utils/opening_hours_utils.dart';
import 'package:wanderlog/features/trips/presentation/widgets/myland/check_in_dialog.dart';
import 'package:wanderlog/features/collections/providers/collection_providers.dart';
import 'package:wanderlog/features/map/presentation/pages/collection_spots_map_page.dart';

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
    this.hideCollectionEntry = false,
    this.linkedCollection,
    super.key,
  });

  // Accept either spot_model.Spot or a map_page.Spot-like object
  final dynamic spot;
  final bool? initialIsSaved;
  final bool? initialIsMustGo;
  final bool? initialIsTodaysPlan;
  final void Function(String spotId, {bool? isMustGo, bool? isTodaysPlan, bool? isVisited, bool? isRemoved, bool? needsReload})? onStatusChanged;
  final bool keepOpenOnAction; // If true, don't close modal after actions
  final bool hideCollectionEntry; // If true, don't show collection entry card (e.g. when opened from collection page)
  final Map<String, dynamic>? linkedCollection; // 预加载的关联合集数据

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
  String? _destinationId;
  bool _hasStatusChanged = false;
  DateTime? _visitDate;
  int? _userRating;
  String? _userNotes;
  List<String> _userPhotos = [];
  bool _isOpeningHoursExpanded = false;
  
  // 关联的合集（随机选择一个展示）
  Map<String, dynamic>? _linkedCollection;
  // 合集数据是否已加载完成
  bool _isCollectionLoaded = false;

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
      // 尝试获取 aiSummary（AI 地点的描述）
      final aiSummary = (widget.spot as dynamic).aiSummary as String?;
      if (aiSummary != null && aiSummary.isNotEmpty) return aiSummary;
      // 回退到 description
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

  String? get _spotRecommendationPhrase {
    try {
      return (widget.spot as dynamic).recommendationPhrase as String?;
    } catch (e) {
      return null;
    }
  }

  bool get _isAIOnlySpot {
    try {
      final isFromAI = (widget.spot as dynamic).isFromAI as bool?;
      final isVerified = (widget.spot as dynamic).isVerified as bool?;
      return (isFromAI == true) && (isVerified != true);
    } catch (e) {
      return false;
    }
  }

  /// 根据地点特征生成默认推荐短语
  String _getDefaultRecommendationPhrase() {
    final tags = _spotTags;
    final name = _spotName.toLowerCase();
    final category = _getCategory()?.toLowerCase() ?? '';
    
    if (tags.any((t) => t.toLowerCase().contains('museum') || t.toLowerCase().contains('gallery')) ||
        category.contains('museum')) {
      return 'Cultural treasure';
    }
    if (tags.any((t) => t.toLowerCase().contains('temple') || t.toLowerCase().contains('shrine')) ||
        category.contains('temple') || category.contains('shrine')) {
      return 'Sacred landmark';
    }
    if (tags.any((t) => t.toLowerCase().contains('park') || t.toLowerCase().contains('garden')) ||
        category.contains('park')) {
      return 'Scenic retreat';
    }
    if (tags.any((t) => t.toLowerCase().contains('cafe') || t.toLowerCase().contains('coffee')) ||
        category.contains('cafe')) {
      return 'Local favorite';
    }
    if (tags.any((t) => t.toLowerCase().contains('restaurant') || t.toLowerCase().contains('food')) ||
        category.contains('restaurant')) {
      return 'Culinary gem';
    }
    if (name.contains('castle') || name.contains('palace')) {
      return 'Historic landmark';
    }
    if (name.contains('tower') || name.contains('view')) {
      return 'Iconic viewpoint';
    }
    
    final phrases = ['Must-visit', 'Hidden gem', 'Local pick', 'Worth exploring', 'Traveler favorite'];
    return phrases[_spotName.length % phrases.length];
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

  Map<String, dynamic>? get _spotOpeningHours {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).openingHours;
    }
    try {
      return (widget.spot as dynamic).openingHours as Map<String, dynamic>?;
    } catch (e) {
      return null;
    }
  }

  String? get _spotPhoneNumber {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).phoneNumber;
    }
    try {
      return (widget.spot as dynamic).phoneNumber as String?;
    } catch (e) {
      return null;
    }
  }

  String? get _spotWebsite {
    if (widget.spot is Spot) {
      return (widget.spot as Spot).website;
    }
    try {
      return (widget.spot as dynamic).website as String?;
    } catch (e) {
      return null;
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
    } else {
      // 先从缓存同步读取收藏状态，避免闪烁
      _loadWishlistStatusFromCache();
    }
    // 异步加载详细状态
    _loadWishlistStatus();
    
    // 处理合集入口数据
    if (widget.hideCollectionEntry) {
      // 不需要显示合集入口，标记为已加载
      _isCollectionLoaded = true;
    } else if (widget.linkedCollection != null) {
      // 使用预加载的数据
      _linkedCollection = widget.linkedCollection;
      _isCollectionLoaded = true;
    } else {
      // 需要异步加载
      _loadLinkedCollection();
    }
  }

  /// 从缓存同步读取收藏状态（立即生效，无需等待）
  void _loadWishlistStatusFromCache() {
    final statusAsync = ref.read(wishlistStatusProvider);
    statusAsync.whenData((statusMap) {
      final (isInWishlist, destId) = checkWishlistStatus(statusMap, _spotId);
      if (isInWishlist) {
        _isWishlist = true;
        _destinationId = destId;
      }
    });
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

  Widget _buildPlaceholder() => Container(
      decoration: const BoxDecoration(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        color: AppTheme.lightGray,
      ),
      child: const Center(
        child: Icon(Icons.image_outlined, size: 64, color: AppTheme.mediumGray),
      ),
    );

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
                _isWishlist = tripSpot.status != null;
                _isMustGo = tripSpot.priority == SpotPriority.mustGo;
                _isTodaysPlan = tripSpot.status == TripSpotStatus.todaysPlan;
                _isVisited = tripSpot.status == TripSpotStatus.visited;
                _visitDate = tripSpot.visitDate;
                _userRating = tripSpot.userRating;
                _userNotes = tripSpot.userNotes;
                _userPhotos = tripSpot.userPhotos ?? [];
              });
            }
            return;
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  /// 加载地点关联的合集（随机选择一个展示）
  Future<void> _loadLinkedCollection() async {
    try {
      final repo = ref.read(collectionRepositoryProvider);
      final collections = await repo.getCollectionsForPlace(_spotId);
      
      if (mounted) {
        if (collections.isNotEmpty) {
          // 随机选择一个合集展示
          final random = math.Random();
          final selectedCollection = collections[random.nextInt(collections.length)];
          setState(() {
            _linkedCollection = selectedCollection;
            _isCollectionLoaded = true;
          });
        } else {
          setState(() {
            _isCollectionLoaded = true;
          });
        }
      }
    } catch (e) {
      // 静默失败，标记为已加载
      print('⚠️ Failed to load linked collection: $e');
      if (mounted) {
        setState(() {
          _isCollectionLoaded = true;
        });
      }
    }
  }

  void _copyToClipboard(String text, String label) {
    Clipboard.setData(ClipboardData(text: text));
    CustomToast.showSuccess(context, '复制成功');
  }

  Widget _buildCheckInButton() => GestureDetector(
      onTap: _isVisited ? null : _handleCheckIn,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: AppTheme.white,
          borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
          border: Border.all(color: AppTheme.black, width: AppTheme.borderMedium),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_isVisited) ...[
              const Text('✓', style: TextStyle(fontSize: 14)),
              const SizedBox(width: 4),
            ],
            Text(
              _isVisited ? 'Checked in' : 'Check in',
              style: AppTheme.labelSmall(context).copyWith(
                color: AppTheme.black,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );


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
            await _loadWishlistStatus();
            if (mounted) {
              CustomToast.showSuccess(context, 'Check-in updated');
              widget.onStatusChanged?.call(_spotId, isVisited: true, needsReload: true);
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
    
    if (confirmed ?? false) {
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

  Widget _buildUserCheckInInfo() => Container(
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


  Future<bool> _handleAddWishlist() async {
    // Optimistic update - change state immediately
    setState(() => _isWishlist = true);
    CustomToast.showSuccess(context, 'Saved');
    
    try {
      final authed = await requireAuth(context, ref);
      if (!authed) {
        setState(() => _isWishlist = false);
        return false;
      }
      // 使用 city，如果为空则使用 "Saved Places" 作为默认目的地
      final cityName = (_spotCity?.isNotEmpty == true) ? _spotCity! : 'Saved Places';
      final destId = await ensureDestinationForCity(ref, cityName);
      if (destId == null) {
        setState(() => _isWishlist = false);
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
      ref.invalidate(wishlistStatusProvider); // 同步更新卡片收藏状态
      if (mounted) {
        setState(() => _hasStatusChanged = true);
      }
      return true;
    } catch (e) {
      // Revert on error
      if (mounted) setState(() => _isWishlist = false);
      _showError('Error: $e');
      return false;
    }
  }

  Future<bool> _handleRemoveWishlist() async {
    if (_destinationId == null) return false;
    
    // Optimistic update - change state immediately
    setState(() => _isWishlist = false);
    CustomToast.showSuccess(context, 'Removed from Wishlist');
    widget.onStatusChanged?.call(_spotId, isRemoved: true);
    
    try {
      await ref.read(tripRepositoryProvider).manageTripSpot(
        tripId: _destinationId!,
        spotId: _spotId,
        remove: true,
      );
      ref.invalidate(tripsProvider);
      ref.invalidate(wishlistStatusProvider); // 同步更新卡片收藏状态
      if (mounted) {
        setState(() => _hasStatusChanged = true);
      }
      return true;
    } catch (e) {
      // Revert on error
      if (mounted) setState(() => _isWishlist = true);
      widget.onStatusChanged?.call(_spotId, isRemoved: false);
      _showError('Error: $e');
      return false;
    }
  }

  Future<bool> _handleToggleMustGo(bool isChecked) async {
    if (_destinationId == null) {
      final destId = await ensureDestinationForCity(ref, _spotCity ?? '');
      if (destId == null) return false;
      _destinationId = destId;
    }
    
    // Optimistic update - change state immediately
    final wasChecked = _isMustGo;
    setState(() => _isMustGo = isChecked);
    widget.onStatusChanged?.call(_spotId, isMustGo: isChecked);
    
    try {
      await ref.read(tripRepositoryProvider).manageTripSpot(
        tripId: _destinationId!,
        spotId: _spotId,
        status: TripSpotStatus.wishlist,
        priority: isChecked ? SpotPriority.mustGo : SpotPriority.optional,
      );
      ref.invalidate(tripsProvider);
      if (mounted) {
        setState(() => _hasStatusChanged = true);
      }
      return true;
    } catch (e) {
      // Revert on error
      if (mounted) setState(() => _isMustGo = wasChecked);
      widget.onStatusChanged?.call(_spotId, isMustGo: wasChecked);
      _showError('Error: $e');
      return false;
    }
  }

  Future<bool> _handleToggleTodaysPlan(bool isChecked) async {
    if (_destinationId == null) {
      final destId = await ensureDestinationForCity(ref, _spotCity ?? '');
      if (destId == null) return false;
      _destinationId = destId;
    }
    
    // Optimistic update - change state immediately
    final wasChecked = _isTodaysPlan;
    setState(() => _isTodaysPlan = isChecked);
    widget.onStatusChanged?.call(_spotId, isTodaysPlan: isChecked);
    
    try {
      await ref.read(tripRepositoryProvider).manageTripSpot(
        tripId: _destinationId!,
        spotId: _spotId,
        status: isChecked ? TripSpotStatus.todaysPlan : TripSpotStatus.wishlist,
      );
      ref.invalidate(tripsProvider);
      if (mounted) {
        setState(() => _hasStatusChanged = true);
      }
      return true;
    } catch (e) {
      // Revert on error
      if (mounted) setState(() => _isTodaysPlan = wasChecked);
      widget.onStatusChanged?.call(_spotId, isTodaysPlan: wasChecked);
      _showError('Error: $e');
      return false;
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

  // Check if opening hours is 24/7
  bool _is24Hours() {
    final raw = _spotOpeningHours;
    if (raw == null) return false;
    final periods = raw['periods'] as List?;
    if (periods == null || periods.length != 1) return false;
    final period = periods.first as Map<String, dynamic>?;
    if (period == null) return false;
    final openInfo = period['open'] as Map<String, dynamic>?;
    if (openInfo == null) return false;
    final time = openInfo['time']?.toString().replaceAll(':', '') ?? '';
    final hasClose = period['close'] != null;
    return time == '0000' && !hasClose;
  }

  // Get weekday text for 7 days display
  List<String>? _getWeekdayText() {
    final raw = _spotOpeningHours;
    if (raw == null) return null;
    final weekdayText = raw['weekday_text'];
    if (weekdayText is List && weekdayText.isNotEmpty) {
      return weekdayText.map((e) => e?.toString() ?? '').toList();
    }
    return null;
  }

  Widget _buildOpeningHoursSection() {
    final raw = _spotOpeningHours;
    if (raw == null) return const SizedBox.shrink();

    final eval = OpeningHoursUtils.evaluate(raw);
    if (eval == null) return const SizedBox.shrink();

    final is24h = _is24Hours();
    final weekdayText = _getWeekdayText();
    final canExpand = !is24h && weekdayText != null && weekdayText.isNotEmpty;
    
    // Only show red if closing within 2 hours
    final isClosingSoon = eval.isClosingSoon;
    final textColor = isClosingSoon ? AppTheme.error : AppTheme.black;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: canExpand ? () => setState(() => _isOpeningHoursExpanded = !_isOpeningHoursExpanded) : null,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const Icon(Icons.access_time, size: 18, color: AppTheme.black),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  eval.summaryText,
                  style: AppTheme.bodyMedium(context).copyWith(
                    color: textColor,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              if (canExpand)
                Icon(
                  _isOpeningHoursExpanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                  size: 20,
                  color: AppTheme.black,
                ),
            ],
          ),
        ),
        if (_isOpeningHoursExpanded && weekdayText != null) ...[
          const SizedBox(height: 12),
          ...weekdayText.map((dayText) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 4, left: 26),
              child: Text(
                dayText,
                style: AppTheme.bodySmall(context).copyWith(
                  color: AppTheme.black.withOpacity(0.6),
                ),
              ),
            );
          }),
        ],
      ],
    );
  }

  Widget _buildInfoRow({
    required IconData icon,
    required String text,
    VoidCallback? onCopy,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Icon(icon, size: 18, color: AppTheme.black),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: AppTheme.bodyMedium(context).copyWith(
              color: AppTheme.black,
            ),
          ),
        ),
        if (onCopy != null)
          GestureDetector(
            onTap: onCopy,
            child: Padding(
              padding: const EdgeInsets.only(left: 8),
              child: const Icon(Icons.copy, size: 18, color: AppTheme.black),
            ),
          ),
      ],
    );
  }

  /// 构建合集入口卡片 - 封面图左上角，宽度自适应
  Widget _buildCollectionEntryCard() {
    final collection = _linkedCollection;
    if (collection == null) return const SizedBox.shrink();

    final collectionName = collection['name'] as String? ?? '';

    return GestureDetector(
      onTap: () => _navigateToCollection(collection),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.9),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('📚', style: TextStyle(fontSize: 14)),
            const SizedBox(width: 6),
            ConstrainedBox(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.5,
              ),
              child: Text(
                collectionName,
                style: AppTheme.labelSmall(context).copyWith(
                  fontWeight: FontWeight.w500,
                  color: AppTheme.black,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 2),
            const Icon(
              Icons.chevron_right,
              size: 16,
              color: AppTheme.black,
            ),
          ],
        ),
      ),
    );
  }

  /// 跳转到合集地图页
  void _navigateToCollection(Map<String, dynamic> collection) {
    final collectionId = collection['id'] as String?;
    final collectionName = collection['name'] as String? ?? '';
    final coverImage = collection['coverImage'] as String?;
    final description = collection['description'] as String?;
    final collectionSpots = collection['collectionSpots'] as List<dynamic>?;
    final isFavorited = collection['isFavorited'] as bool?;

    if (collectionId == null) return;

    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => CollectionSpotsMapPage(
          city: _spotCity ?? '',
          collectionTitle: collectionName,
          collectionId: collectionId,
          initialIsFavorited: isFavorited,
          coverImage: coverImage,
          description: description,
          people: LinkItem.parseList(collection['people'], isPeople: true),
          works: LinkItem.parseList(collection['works'], isPeople: false),
          preloadedSpots: collectionSpots?.cast<Map<String, dynamic>>(),
        ),
      ),
    );
  }


  @override
  Widget build(BuildContext context) {
    // 如果需要显示合集入口但数据还没加载完，显示加载态
    if (!widget.hideCollectionEntry && !_isCollectionLoaded) {
      return Container(
        height: MediaQuery.of(context).size.height * 0.85,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          border: Border.all(color: AppTheme.black, width: 2),
        ),
        child: const Center(
          child: CircularProgressIndicator(
            color: AppTheme.primaryYellow,
          ),
        ),
      );
    }
    
    return Stack(
    clipBehavior: Clip.none,
    children: [
      // Main modal content
      Container(
      height: MediaQuery.of(context).size.height * 0.85,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border.all(color: AppTheme.black, width: 2),
      ),
      child: Column(
      children: [
        // 1. Image section with close button and collection entry
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
                              borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
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
                          borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
                          child: Image.network(
                            imageSource,
                            fit: BoxFit.cover,
                            width: double.infinity,
                            height: double.infinity,
                            gaplessPlayback: true,
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
            // 合集入口卡片 - 封面图左上角
            if (_linkedCollection != null && !widget.hideCollectionEntry)
              Positioned(
                top: 16,
                left: 16,
                child: _buildCollectionEntryCard(),
              ),
            // 关闭按钮 - 封面图右上角
            Positioned(
              top: 16,
              right: 16,
              child: GestureDetector(
                onTap: () => Navigator.pop(context, _hasStatusChanged),
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.7),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.close,
                    color: AppTheme.mediumGray,
                    size: 22,
                  ),
                ),
              ),
            ),
          ],
        ),
        // Scrollable content
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 2. Title - max 2 lines with ellipsis
                Text(
                  _spotName,
                  style: AppTheme.headlineLarge(context),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 12),
                // 3. Tags - max 3 tags, no scroll
                if (_effectiveTags().isNotEmpty) ...[
                  Row(
                    children: _effectiveTags().take(3).map((tag) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF2F2F2),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: AppTheme.black.withOpacity(0.2), width: 1),
                        ),
                        child: Text(
                          tag,
                          style: AppTheme.labelSmall(context).copyWith(
                            color: AppTheme.black.withOpacity(0.48),
                          ),
                        ),
                      ),
                    )).toList(),
                  ),
                  const SizedBox(height: 16),
                ],
                // 4. Description - max 3 lines with ellipsis
                if (_spotDescription != null && _spotDescription!.isNotEmpty) ...[
                  Text(
                    _spotDescription!,
                    style: AppTheme.bodyMedium(context).copyWith(color: AppTheme.darkGray),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 16),
                ],
                // 5. Rating or Recommendation Phrase with Check-in button on the right
                // For AI-only places or places without valid rating, show recommendation phrase
                if (_isAIOnlySpot || (_spotRating == null || _spotRating == 0)) ...[
                  Row(
                    children: [
                      Icon(Icons.auto_awesome, size: 20, color: AppTheme.primaryYellow),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _spotRecommendationPhrase ?? _getDefaultRecommendationPhrase(),
                          style: AppTheme.headlineMedium(context).copyWith(
                            fontWeight: FontWeight.w600,
                            fontSize: 16,
                          ),
                        ),
                      ),
                      _buildCheckInButton(),
                    ],
                  ),
                  const SizedBox(height: 16),
                ] else if (_spotRating != null && _spotRating! > 0) ...[
                  Row(
                    children: [
                      Text(
                        _spotRating!.toStringAsFixed(1),
                        style: AppTheme.headlineMedium(context).copyWith(fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(width: 8),
                      ...List.generate(5, (index) => Icon(
                        index < _spotRating!.floor() ? Icons.star : (index < _spotRating! ? Icons.star_half : Icons.star_border),
                        color: AppTheme.primaryYellow,
                        size: 20,
                      )),
                      if (_spotRatingCount != null) ...[
                        const SizedBox(width: 8),
                        Text(
                          '($_spotRatingCount)',
                          style: AppTheme.bodySmall(context).copyWith(color: AppTheme.mediumGray),
                        ),
                      ],
                      const Spacer(),
                      _buildCheckInButton(),
                    ],
                  ),
                  const SizedBox(height: 16),
                ] else ...[
                  // Show check-in button even without rating
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [_buildCheckInButton()],
                  ),
                  const SizedBox(height: 16),
                ],
                // 6. Other info: opening hours, address, phone, website
                // Opening hours with expand/collapse
                _buildOpeningHoursSection(),
                if (_spotOpeningHours != null) const SizedBox(height: 12),
                // Address with navigation button
                if (_spotAddress != null && _spotAddress!.isNotEmpty) ...[
                  _buildAddressRowWithNavigation(),
                  const SizedBox(height: 12),
                ],
                // Phone with copy
                if (_spotPhoneNumber != null && _spotPhoneNumber!.isNotEmpty) ...[
                  _buildInfoRow(
                    icon: Icons.phone_outlined,
                    text: _spotPhoneNumber!,
                    onCopy: () => _copyToClipboard(_spotPhoneNumber!, 'Phone'),
                  ),
                  const SizedBox(height: 12),
                ],
                // Website with copy
                if (_spotWebsite != null && _spotWebsite!.isNotEmpty) ...[
                  _buildInfoRow(
                    icon: Icons.language,
                    text: _spotWebsite!,
                    onCopy: () => _copyToClipboard(_spotWebsite!, 'Website'),
                  ),
                  const SizedBox(height: 16),
                ],
                // 7. User Check-in Info
                if (_isVisited && _visitDate != null) ...[
                  const SizedBox(height: 8),
                  _buildUserCheckInInfo(),
                ],
              ],
            ),
          ),
        ),
        // 8. Fixed bottom bar with SaveSpotButton
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Colors.white,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.08),
                blurRadius: 8,
                offset: const Offset(0, -4),
              ),
            ],
          ),
          child: SafeArea(
            top: false,
            child: _isWishlist
                ? SaveSpotButton(
                    isSaved: true,
                    isMustGo: _isMustGo,
                    isTodaysPlan: _isTodaysPlan,
                    onSave: () async => true,
                    onUnsave: () async {
                      final ok = await _handleRemoveWishlist();
                      if (ok && context.mounted) {
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
                    onTap: () async {
                      await _handleAddWishlist();
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
                      child: Row(
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
    ),
    ],
    );
  }

  Widget _buildAddressRowWithNavigation() {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        const Icon(Icons.location_on_outlined, size: 18, color: AppTheme.black),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            _spotAddress!,
            style: AppTheme.bodyMedium(context).copyWith(
              color: AppTheme.black,
            ),
          ),
        ),
        GestureDetector(
          onTap: _showNavigationOptions,
          child: Padding(
            padding: const EdgeInsets.only(left: 8),
            child: const Icon(Icons.navigation_outlined, size: 18, color: AppTheme.black),
          ),
        ),
      ],
    );
  }

  void _showNavigationOptions() {
    final lat = _getLatitude();
    final lng = _getLongitude();
    final name = Uri.encodeComponent(_spotName);
    
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        padding: const EdgeInsets.all(24),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Open in Maps',
                style: AppTheme.headlineMedium(context).copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 20),
              // Google Maps
              _buildMapOption(
                icon: '🗺️',
                title: 'Google Maps',
                onTap: () {
                  Navigator.pop(context);
                  _openGoogleMaps(lat, lng, name);
                },
              ),
              const SizedBox(height: 12),
              // Amap (高德地图)
              _buildMapOption(
                icon: '🧭',
                title: '高德地图',
                onTap: () {
                  Navigator.pop(context);
                  _openAmap(lat, lng, name);
                },
              ),
              const SizedBox(height: 12),
              // Apple Maps
              _buildMapOption(
                icon: '🍎',
                title: 'Apple Maps',
                onTap: () {
                  Navigator.pop(context);
                  _openAppleMaps(lat, lng, name);
                },
              ),
              const SizedBox(height: 16),
              // Cancel button - white with black border
              GestureDetector(
                onTap: () => Navigator.pop(context),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  decoration: BoxDecoration(
                    color: AppTheme.white,
                    borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                    border: Border.all(color: AppTheme.black, width: 2),
                  ),
                  child: Center(
                    child: Text(
                      'Cancel',
                      style: AppTheme.labelLarge(context).copyWith(
                        color: AppTheme.black,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMapOption({
    required String icon,
    required String title,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: AppTheme.white,
          borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
          border: Border.all(color: AppTheme.black, width: 2),
          boxShadow: const [
            BoxShadow(
              color: AppTheme.black,
              offset: Offset(2, 3),
              blurRadius: 0,
            ),
          ],
        ),
        child: Row(
          children: [
            Text(icon, style: const TextStyle(fontSize: 24)),
            const SizedBox(width: 12),
            Text(
              title,
              style: AppTheme.bodyLarge(context).copyWith(fontWeight: FontWeight.w500),
            ),
            const Spacer(),
            const Icon(Icons.chevron_right, color: AppTheme.black),
          ],
        ),
      ),
    );
  }

  Future<void> _openGoogleMaps(double lat, double lng, String name) async {
    final url = Uri.parse('https://www.google.com/maps/search/?api=1&query=$lat,$lng&query_place_id=$name');
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    } else {
      CustomToast.showError(context, 'Cannot open Google Maps');
    }
  }

  Future<void> _openAmap(double lat, double lng, String name) async {
    // Try to open Amap app first, fallback to web
    final appUrl = Uri.parse('amapuri://route/plan/?dlat=$lat&dlon=$lng&dname=$name&dev=0&t=0');
    final webUrl = Uri.parse('https://uri.amap.com/marker?position=$lng,$lat&name=$name');
    
    if (await canLaunchUrl(appUrl)) {
      await launchUrl(appUrl);
    } else if (await canLaunchUrl(webUrl)) {
      await launchUrl(webUrl, mode: LaunchMode.externalApplication);
    } else {
      CustomToast.showError(context, 'Cannot open Amap');
    }
  }

  Future<void> _openAppleMaps(double lat, double lng, String name) async {
    final url = Uri.parse('https://maps.apple.com/?q=$name&ll=$lat,$lng');
    if (await canLaunchUrl(url)) {
      await launchUrl(url, mode: LaunchMode.externalApplication);
    } else {
      CustomToast.showError(context, 'Cannot open Apple Maps');
    }
  }
}
