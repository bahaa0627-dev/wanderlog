import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/shared/models/spot_model.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';
import 'package:wanderlog/features/trips/presentation/widgets/myland/spot_card.dart';
import 'package:wanderlog/features/trips/presentation/widgets/myland/check_in_dialog.dart';
import 'package:wanderlog/features/trips/presentation/widgets/myland/add_city_dialog.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart';
import 'package:wanderlog/shared/models/trip_model.dart';
import 'package:wanderlog/features/trips/presentation/widgets/myland/spot_detail_modal.dart';
import 'package:wanderlog/features/trips/presentation/pages/myland/myland_spots_map_page.dart';
import 'package:wanderlog/features/map/presentation/widgets/mapbox_spot_map.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart' as map_page show Spot;

class SpotsTabController {
  _SpotsTabState? _state;
  final List<String> _savedCityHistory = [];
  final Map<String, String> _savedExtraCitySlugs = {};
  String? _savedSelectedCitySlug;

  void _attach(_SpotsTabState state) => _state = state;

  void _detach(_SpotsTabState state) {
    if (_state == state) {
      _state = null;
    }
  }

  void selectCity(String cityName) {
    _state?._selectCity(cityName);
  }

  void showAddCityDialog() {
    _state?._showAddCityDialog();
  }

  List<String> get cityOptionsNewestFirst =>
      _state?._citiesInCreationOrder(newestFirst: true) ?? const [];

  void _saveCityState({
    required List<String> history,
    required Map<String, String> extraSlugs,
    required String selectedSlug,
  }) {
    _savedCityHistory
      ..clear()
      ..addAll(history);
    _savedExtraCitySlugs
      ..clear()
      ..addAll(extraSlugs);
    _savedSelectedCitySlug = selectedSlug;
  }

  List<String> get savedCityHistory => List.unmodifiable(_savedCityHistory);
  Map<String, String> get savedExtraCitySlugs =>
      Map.unmodifiable(_savedExtraCitySlugs);
  String? get savedSelectedCitySlug => _savedSelectedCitySlug;
}

/// Spots Tab - 以地图为主的收藏概览，支持列表回退
class SpotsTab extends ConsumerStatefulWidget {
  const SpotsTab({
    super.key,
    this.initialSubTab,
    this.onCityChanged,
    this.onCityOptionsChanged,
    this.controller,
  });

  final int? initialSubTab;
  final ValueChanged<String>? onCityChanged;
  final ValueChanged<List<String>>? onCityOptionsChanged;
  final SpotsTabController? controller;

  @override
  ConsumerState<SpotsTab> createState() => _SpotsTabState();
}

class _SpotsTabState extends ConsumerState<SpotsTab> {
  static const List<String> _tagPalette = [
    'architecture',
    'museum',
    'coffee',
    'food',
    'park',
    'design',
    'history',
  ];
  static const String _allCityLabel = 'All';
  static const String _allCitySlug = '__all__';

  // Start empty; real data comes from destinations fetched from server or user input.
  final List<_SpotEntry> _entries = _buildMockEntries();
  final Set<String> _activeTags = {};
  final PageController _carouselController =
      PageController(viewportFraction: 0.78);
  final List<String> _userCityHistory = [];
  final Map<String, String> _extraCitySlugs = {};
  bool _isLoadingDestinations = true;

  late int _selectedSubTab;
  late bool _isMapView;
  late String _selectedCitySlug;
  String? _pendingSelectedSlug;

  List<_SpotEntry> get _entriesForCity => _selectedCitySlug == _allCitySlug
      ? List<_SpotEntry>.from(_entries)
      : _entries.where((entry) => entry.citySlug == _selectedCitySlug).toList();

  int get _allCount => _entriesForCity.length;
  int get _mustGoCount =>
      _entriesForCity.where((entry) => entry.isMustGo).length;
  int get _todaysPlanCount =>
      _entriesForCity.where((entry) => entry.isTodaysPlan).length;
  int get _visitedCount =>
      _entriesForCity.where((entry) => entry.isVisited).length;

  List<String> get _tagOptions {
    final tagSet = <String>{};
    // Get entries filtered by current tab
    Iterable<_SpotEntry> relevantEntries = _entriesForCity;
    switch (_selectedSubTab) {
      case 1: // MustGo - only tags from MustGo spots
        relevantEntries = relevantEntries.where((entry) => entry.isMustGo);
        break;
      case 2: // Today's Plan - only tags from Today's Plan spots
        relevantEntries = relevantEntries.where((entry) => entry.isTodaysPlan);
        break;
      case 3: // Visited - only tags from Visited spots
        relevantEntries = relevantEntries.where((entry) => entry.isVisited);
        break;
      default: // All - use all entries
        break;
    }
    for (final entry in relevantEntries) {
      tagSet.addAll(entry.spot.tags.map((tag) => tag.toLowerCase()));
    }
    final ordered = <String>[];
    for (final tag in _tagPalette) {
      if (tagSet.contains(tag)) {
        ordered.add(tag);
      }
    }
    for (final tag in tagSet) {
      if (!ordered.contains(tag)) {
        ordered.add(tag);
      }
    }
    return ordered;
  }

  String get _selectedCityName {
    if (_selectedCitySlug == _allCitySlug) return _allCityLabel;
    for (final entry in _entries) {
      if (entry.citySlug == _selectedCitySlug) {
        return entry.city;
      }
    }
    final manual = _extraCitySlugs[_selectedCitySlug];
    if (manual != null && manual.isNotEmpty) {
      return manual;
    }
    if (_entries.isNotEmpty) {
      return _entries.first.city;
    }
    return 'Your city';
  }

  @override
  void initState() {
    super.initState();
    _selectedSubTab = _normalizeSubTab(widget.initialSubTab ?? 0);
    _isMapView = _defaultMapViewFor(_selectedSubTab);
    _selectedCitySlug = _allCitySlug;
    widget.controller?._attach(this);
    final controller = widget.controller;
    if (controller != null) {
      final savedHistory = controller.savedCityHistory;
      if (savedHistory.isNotEmpty) {
        _userCityHistory.addAll(savedHistory);
      }
      final savedSlugs = controller.savedExtraCitySlugs;
      if (savedSlugs.isNotEmpty) {
        _extraCitySlugs.addAll(savedSlugs);
      }
      final savedSlug = controller.savedSelectedCitySlug;
      if (savedSlug != null && savedSlug.isNotEmpty) {
        _pendingSelectedSlug = savedSlug;
      }
    }
    unawaited(_loadDestinationsFromServer());
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _notifyCityChanged();
      _notifyCityOptionsChanged();
    });
  }

  @override
  void didUpdateWidget(covariant SpotsTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller?._detach(this);
      widget.controller?._attach(this);
    }
    final incoming = widget.initialSubTab;
    if (incoming != null && incoming != oldWidget.initialSubTab) {
      final normalized = _normalizeSubTab(incoming);
      if (normalized != _selectedSubTab) {
        setState(() {
          _selectedSubTab = normalized;
          _isMapView = _defaultMapViewFor(normalized);
        });
      }
    }
  }

  @override
  void dispose() {
    _persistCityState();
    widget.controller?._detach(this);
    _carouselController.dispose();
    super.dispose();
  }

  void _onSubTabChanged(int index) {
    setState(() {
      _selectedSubTab = index;
      _isMapView = _defaultMapViewFor(index);
    });
    if (_carouselController.hasClients) {
      _carouselController.jumpToPage(0);
    }
  }

  void _toggleView(bool useMap) {
    if (_isMapView == useMap) {
      return;
    }
    setState(() {
      _isMapView = useMap;
    });
  }

  void _toggleTag(String tag) {
    setState(() {
      if (_activeTags.contains(tag)) {
        _activeTags.remove(tag);
      } else {
        _activeTags.add(tag);
      }
    });
  }

  void _handleCheckIn(Spot spot) {
    showDialog<void>(
      context: context,
      builder: (context) => CheckInDialog(
        spot: spot,
        onCheckIn: (visitDate, rating, notes) {
          setState(() => _selectedSubTab = 3);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Checked in to ${spot.name}')),
          );
        },
      ),
    );
  }

  void _handleSpotTap(_SpotEntry entry) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => MyLandSpotDetailModal(
        spot: entry.spot,
        isMustGo: entry.isMustGo,
        isTodaysPlan: entry.isTodaysPlan,
        onStatusChanged: _handleStatusChanged,
      ),
    );
  }

  void _handleStatusChanged(String spotId, {bool? isMustGo, bool? isTodaysPlan, bool? isRemoved}) {
    final index = _indexForSpot(spotId);
    if (index == -1) return;

    if (isRemoved == true) {
      // Remove from list when unsaved
      setState(() {
        _entries.removeAt(index);
      });
      return;
    }

    final entry = _entries[index];
    setState(() {
      _entries[index] = entry.copyWith(
        isMustGo: isMustGo,
        isTodaysPlan: isTodaysPlan,
      );
    });
  }

  Future<void> _handleToggleMustGo(Spot spot) async {
    final index = _indexForSpot(spot.id);
    if (index == -1) {
      return;
    }
    final entry = _entries[index];
    final wasChecked = entry.isMustGo;
    final newChecked = !wasChecked;
    
    // Update local state immediately for responsiveness
    final nextEntry = entry.copyWith(isMustGo: newChecked);
    setState(() {
      _entries[index] = nextEntry;
    });
    
    // Persist to backend
    try {
      final city = spot.city ?? '';
      final destId = await _getDestinationIdForCity(city);
      if (destId != null) {
        await ref.read(tripRepositoryProvider).manageTripSpot(
          tripId: destId,
          spotId: spot.id,
          status: TripSpotStatus.wishlist,
          priority: newChecked ? SpotPriority.mustGo : SpotPriority.optional,
        );
      }
    } catch (e) {
      // Revert on error
      setState(() {
        _entries[index] = entry;
      });
      if (mounted) {
        CustomToast.showError(context, 'Failed to update: $e');
      }
      return;
    }
    
    if (newChecked) {
      CustomToast.showSuccess(context, 'Added to MustGo');
    } else {
      CustomToast.showInfo(context, 'Removed from MustGo');
    }
  }

  Future<void> _handleToggleTodaysPlan(Spot spot) async {
    final index = _indexForSpot(spot.id);
    if (index == -1) {
      return;
    }
    final entry = _entries[index];
    final wasChecked = entry.isTodaysPlan;
    final newChecked = !wasChecked;
    
    // Update local state immediately for responsiveness
    final nextEntry = entry.copyWith(isTodaysPlan: newChecked);
    setState(() {
      _entries[index] = nextEntry;
    });
    
    // Persist to backend
    try {
      final city = spot.city ?? '';
      final destId = await _getDestinationIdForCity(city);
      if (destId != null) {
        await ref.read(tripRepositoryProvider).manageTripSpot(
          tripId: destId,
          spotId: spot.id,
          status: newChecked ? TripSpotStatus.todaysPlan : TripSpotStatus.wishlist,
        );
      }
    } catch (e) {
      // Revert on error
      setState(() {
        _entries[index] = entry;
      });
      if (mounted) {
        CustomToast.showError(context, 'Failed to update: $e');
      }
      return;
    }
    
    if (newChecked) {
      CustomToast.showSuccess(context, "Added to Today's Plan");
    } else {
      CustomToast.showInfo(context, "Removed from Today's Plan");
    }
  }

  Future<void> _handleQuickAddMustGo(Spot spot) async {
    final index = _indexForSpot(spot.id);
    if (index == -1) {
      return;
    }
    final entry = _entries[index];
    if (entry.isMustGo) {
      CustomToast.showInfo(context, '${spot.name} already in MustGo');
      return;
    }
    
    // Update local state immediately
    setState(() {
      _entries[index] = entry.copyWith(isMustGo: true);
    });
    
    // Persist to backend
    try {
      final city = spot.city ?? '';
      final destId = await _getDestinationIdForCity(city);
      if (destId != null) {
        await ref.read(tripRepositoryProvider).manageTripSpot(
          tripId: destId,
          spotId: spot.id,
          status: TripSpotStatus.wishlist,
          priority: SpotPriority.mustGo,
        );
      }
    } catch (e) {
      // Revert on error
      setState(() {
        _entries[index] = entry;
      });
      if (mounted) {
        CustomToast.showError(context, 'Failed to update: $e');
      }
      return;
    }
    
    CustomToast.showSuccess(context, 'Added to MustGo');
  }

  Future<String?> _getDestinationIdForCity(String city) async {
    if (city.isEmpty) return null;
    try {
      final repo = ref.read(tripRepositoryProvider);
      final trips = await repo.getMyTrips();
      for (final t in trips) {
        if (t.city?.toLowerCase() == city.toLowerCase()) {
          return t.id;
        }
      }
      // Create if not found
      final newTrip = await repo.createTrip(name: city, city: city);
      return newTrip.id;
    } catch (_) {
      return null;
    }
  }

  void _showAddCityDialog() {
    showDialog<void>(
      context: context,
      builder: (context) => AddCityDialog(
        onCitySelected: (city) {
          final normalized = _normalizeCityName(city);
          final slug = _ensureCitySlug(normalized);
          setState(() {
            _selectedCitySlug = slug;
            _isMapView = _defaultMapViewFor(_selectedSubTab);
            _activeTags.clear();
          });
          _recordCityAddition(normalized);
          unawaited(_persistDestination(normalized));
          _notifyCityChanged();
          _notifyCityOptionsChanged();
          _navigateToCityMap(normalized);
        },
      ),
    );
  }

  void _openFullMap() {
    // MustGo (1) 和 Today's Plan (2) 使用专门的地图页面展示已筛选的地点
    if (_selectedSubTab == 1 || _selectedSubTab == 2) {
      final filteredEntries = _filteredEntries();
      if (filteredEntries.isEmpty) {
        _launchCityMapFlow(_selectedCityName);
        return;
      }
      
      final spots = filteredEntries.map((e) => e.spot).toList();
      final tabLabel = _selectedSubTab == 1 ? 'MustGo' : "Today's Plan";
      final allCities = _getAvailableCitiesForCurrentTab();
      final allSpotsByCity = _getAllSpotsByCityForCurrentTab();
      
      Navigator.of(context).push<void>(
        MaterialPageRoute<void>(
          builder: (context) => MyLandSpotsMapPage(
            cityName: _selectedCityName,
            spots: spots,
            tabLabel: tabLabel,
            allCities: allCities,
            allSpotsByCity: allSpotsByCity,
            onCityChanged: (newCity) {
              _selectCity(newCity);
            },
            onDataChanged: () {
              // Refresh data when spot status changes in the map page
              unawaited(_loadDestinationsFromServer());
            },
          ),
        ),
      );
      return;
    }
    
    _launchCityMapFlow(_selectedCityName);
  }

  /// 获取当前 tab 下存在地点的城市列表（包含 All 选项）
  List<String> _getAvailableCitiesForCurrentTab() {
    final Set<String> cities = {};
    for (final entry in _entries) {
      // MustGo tab
      if (_selectedSubTab == 1 && entry.isMustGo) {
        final city = entry.city.trim();
        if (city.isNotEmpty) cities.add(city);
      }
      // Today's Plan tab
      if (_selectedSubTab == 2 && entry.isTodaysPlan) {
        final city = entry.city.trim();
        if (city.isNotEmpty) cities.add(city);
      }
    }
    // Always include 'All' option at the beginning
    final result = cities.toList();
    if (result.isNotEmpty) {
      result.insert(0, _allCityLabel);
    }
    return result;
  }

  /// 获取当前 tab 下按城市分组的所有地点
  Map<String, List<Spot>> _getAllSpotsByCityForCurrentTab() {
    final Map<String, List<Spot>> result = {};
    for (final entry in _entries) {
      // MustGo tab
      if (_selectedSubTab == 1 && entry.isMustGo) {
        final city = entry.city.trim();
        if (city.isNotEmpty) {
          result.putIfAbsent(city, () => []).add(entry.spot);
        }
      }
      // Today's Plan tab
      if (_selectedSubTab == 2 && entry.isTodaysPlan) {
        final city = entry.city.trim();
        if (city.isNotEmpty) {
          result.putIfAbsent(city, () => []).add(entry.spot);
        }
      }
    }
    return result;
  }

  void _navigateToCityMap(String city) {
    _launchCityMapFlow(city);
  }

  void _launchCityMapFlow(String city, {bool adoptReturnedCity = false}) {
    unawaited(_pushMapAndHandleResult(
      city,
      adoptReturnedCity: adoptReturnedCity,
    ));
  }

  Future<void> _pushMapAndHandleResult(
    String city, {
    required bool adoptReturnedCity,
  }) async {
    final resolvedCityName = city.trim().isEmpty ? _selectedCityName : city;
    final query = Uri.encodeComponent(resolvedCityName);
    final result =
        await context.push<String>('/map?city=$query&from=myland');
    if (!mounted) {
      return;
    }
    final returnedCity = result?.trim();
    if (returnedCity == null || returnedCity.isEmpty) {
      return;
    }
    if (!adoptReturnedCity) {
      return;
    }
    _selectCity(returnedCity);
  }

  void _persistCityState() {
    if (widget.controller == null) {
      return;
    }
    widget.controller!._saveCityState(
      history: _userCityHistory,
      extraSlugs: _extraCitySlugs,
      selectedSlug: _selectedCitySlug,
    );
  }

  String _normalizeCityName(String city) => city.trim();

  String _ensureCitySlug(String city) {
    final normalized = _normalizeCityName(city);
    if (normalized.toLowerCase() == _allCityLabel.toLowerCase()) {
      return _allCitySlug;
    }
    if (normalized.isEmpty) {
      return _selectedCitySlug;
    }
    final entry = _entryByCityName(normalized);
    if (entry != null) {
      return entry.citySlug;
    }
    final slug = _slugify(normalized);
    _extraCitySlugs[slug] = normalized;
    return slug;
  }

  _SpotEntry? _entryByCityName(String city) {
    final target = city.toLowerCase();
    for (final entry in _entries) {
      if (entry.city.toLowerCase() == target) {
        return entry;
      }
    }
    return null;
  }

  int _indexForSpot(String spotId) =>
      _entries.indexWhere((entry) => entry.spot.id == spotId);

  String _slugify(String city) {
    final base = city.toLowerCase();
    final slug = base
        .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
        .replaceAll(RegExp(r'^-+|-+$'), '');
    return slug.isEmpty ? base : slug;
  }

  void _recordCityAddition(String city) {
    if (city.toLowerCase() == _allCityLabel.toLowerCase()) {
      return;
    }
    final normalized = city.trim();
    if (normalized.isEmpty) {
      return;
    }
    _userCityHistory.removeWhere(
      (existing) => existing.toLowerCase() == normalized.toLowerCase(),
    );
    _userCityHistory.insert(0, normalized);
    _persistCityState();
  }

  Future<void> _persistDestination(String city) async {
    final normalized = city.trim();
    if (normalized.isEmpty) {
      return;
    }
    try {
      await ref.read(tripActionsProvider).createTrip(
            name: normalized,
            city: normalized,
          );
    } catch (_) {
      // Silently ignore; UI still switches city locally.
    }
  }

  Future<void> _loadDestinationsFromServer() async {
    if (mounted) {
      setState(() {
        _isLoadingDestinations = true;
      });
    } else {
      _isLoadingDestinations = true;
    }
    try {
      final repo = ref.read(tripRepositoryProvider);
      final destinations = await repo.getMyTrips();
      if (!mounted) return;
      destinations.sort(
        (a, b) => b.createdAt.compareTo(a.createdAt),
      );

      final entries = <_SpotEntry>[];

      for (final destination in destinations) {
        final city = destination.city?.trim();
        if (city == null || city.isEmpty) continue;
        final slug = _ensureCitySlug(city);
        _extraCitySlugs[slug] = city;
        _userCityHistory.removeWhere(
          (existing) => existing.toLowerCase() == city.toLowerCase(),
        );
        _userCityHistory.insert(0, city);

        // load spots for this destination
        try {
          final detail = await repo.getTripById(destination.id);
          final tripSpots = detail.tripSpots ?? const <TripSpot>[];
          for (final ts in tripSpots) {
            final s = ts.spot;
            if (s == null) continue;
            // Use spot.city for city grouping
            // City list = manually added destinations + cities of saved spots
            final cityName = (s.city ?? 'Unknown').trim().isEmpty
                ? 'Unknown'
                : s.city!.trim();
            final spotSlug = _ensureCitySlug(cityName);
            final isMustGo = ts.priority == SpotPriority.mustGo;
            final isTodaysPlan = ts.status == TripSpotStatus.todaysPlan;
            final entry = _SpotEntry(
              city: cityName,
              citySlug: spotSlug,
              spot: s,
              addedAt: ts.createdAt,
              isMustGo: isMustGo,
              isTodaysPlan: isTodaysPlan,
              isVisited: ts.status == TripSpotStatus.visited,
              // Use updatedAt as the check time for sorting
              mustGoCheckedAt: isMustGo ? ts.updatedAt : null,
              todaysPlanCheckedAt: isTodaysPlan ? ts.updatedAt : null,
            );
            entries.add(entry);
          }
        } catch (_) {
          // ignore detail fetch errors per destination
        }
      }

      setState(() {
        _entries
          ..clear()
          ..addAll(entries);

        if (_pendingSelectedSlug != null && _pendingSelectedSlug!.isNotEmpty) {
          final slug = _pendingSelectedSlug!;
          final hasSlug = _entries.any((e) => e.citySlug == slug) ||
              _extraCitySlugs.containsKey(slug) ||
              slug == _allCitySlug;
          if (hasSlug) {
            _selectedCitySlug = slug;
          }
          _pendingSelectedSlug = null;
        }

        if (_selectedCitySlug != _allCitySlug && _userCityHistory.isNotEmpty) {
          final currentCity = _selectedCityName.toLowerCase();
          final hasCurrent = _citiesInCreationOrder(newestFirst: true).any(
            (city) => city.toLowerCase() == currentCity,
          );
          if (!hasCurrent) {
            final firstCity = _userCityHistory.first;
            _selectedCitySlug = _ensureCitySlug(firstCity);
          }
        }
      });

      _notifyCityChanged();
      _notifyCityOptionsChanged();
      _persistCityState();
    } catch (_) {
      // Ignore errors; fallback to local state.
    } finally {
      if (mounted) {
        setState(() {
          _isLoadingDestinations = false;
        });
      } else {
        _isLoadingDestinations = false;
      }
    }
  }

  List<_SpotEntry> _filteredEntries() {
    Iterable<_SpotEntry> base = _entriesForCity;
    bool shouldSortByMustGoTime = false;
    bool shouldSortByTodaysPlanTime = false;

    switch (_selectedSubTab) {
      case 1:
        base = base.where((entry) => entry.isMustGo);
        shouldSortByMustGoTime = true;
        break;
      case 2:
        base = base.where((entry) => entry.isTodaysPlan);
        shouldSortByTodaysPlanTime = true;
        break;
      case 3:
        base = base.where((entry) => entry.isVisited);
        break;
      default:
        break;
    }

    List<_SpotEntry> result;
    if (_activeTags.isEmpty) {
      result = base.toList();
    } else {
      result = base
          .where(
            (entry) => entry.spot.tags
                .map((tag) => tag.toLowerCase())
                .any(_activeTags.contains),
          )
          .toList();
    }

    // Sort by check time (newest first) for MustGo and Today's Plan tabs
    if (shouldSortByMustGoTime) {
      result.sort((a, b) {
        final aTime = a.mustGoCheckedAt ?? DateTime(1970);
        final bTime = b.mustGoCheckedAt ?? DateTime(1970);
        return bTime.compareTo(aTime); // Descending order (newest first)
      });
    } else if (shouldSortByTodaysPlanTime) {
      result.sort((a, b) {
        final aTime = a.todaysPlanCheckedAt ?? DateTime(1970);
        final bTime = b.todaysPlanCheckedAt ?? DateTime(1970);
        return bTime.compareTo(aTime); // Descending order (newest first)
      });
    } else if (_selectedCitySlug == _allCitySlug) {
      // All city视图下按收藏时间倒序
      result.sort((a, b) => b.addedAt.compareTo(a.addedAt));
    }

    return result;
  }

  int _normalizeSubTab(int value) {
    if (value < 0) {
      return 0;
    }
    if (value > 3) {
      return 3;
    }
    return value;
  }

  bool _defaultMapViewFor(int index) => index == 1 || index == 2;

  String _currentTabLabel() {
    switch (_selectedSubTab) {
      case 1:
        return 'MustGo';
      case 2:
        return "Today's Plan";
      case 3:
        return 'Visited';
      default:
        return 'All Spots';
    }
  }

  void _notifyCityChanged() {
    if (!mounted || widget.onCityChanged == null) {
      return;
    }
    widget.onCityChanged!(_selectedCityName);
  }

  void _notifyCityOptionsChanged() {
    if (!mounted || widget.onCityOptionsChanged == null) {
      return;
    }
    widget.onCityOptionsChanged!(
      _cityOptionsWithAll(),
    );
  }

  void _selectCity(String cityName) {
    final normalized = _normalizeCityName(cityName);
    final slug = _ensureCitySlug(normalized);
    setState(() {
      _selectedCitySlug = slug;
      _isMapView = _defaultMapViewFor(_selectedSubTab);
      _activeTags.clear();
    });
    _recordCityAddition(normalized);
    _notifyCityChanged();
    _notifyCityOptionsChanged();
    _persistCityState();
  }

  List<String> _citiesInCreationOrder({required bool newestFirst}) {
    final seen = <String>{};
    final ordered = <String>[];
    final historySource =
        newestFirst ? _userCityHistory : _userCityHistory.reversed;
    for (final city in historySource) {
      final normalized = city.trim();
      if (normalized.isEmpty) {
        continue;
      }
      final key = normalized.toLowerCase();
      if (seen.add(key)) {
        ordered.add(normalized);
      }
    }
    final entrySource = newestFirst ? _entries.reversed : _entries;
    for (final entry in entrySource) {
      final normalized = entry.city.trim();
      if (normalized.isEmpty) {
        continue;
      }
      final key = normalized.toLowerCase();
      if (seen.add(key)) {
        ordered.add(entry.city);
      }
    }
    return ordered;
  }

  List<String> _cityOptionsWithAll() {
    final cities = _citiesInCreationOrder(newestFirst: true);
    if (cities.contains(_allCityLabel)) return cities;
    return [_allCityLabel, ...cities];
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoadingDestinations) {
      return const _LoadingState();
    }

    final hasDestinations = _citiesInCreationOrder(newestFirst: true).isNotEmpty;
    if (!hasDestinations) {
      return _NoDestinationState(
        onAddDestination: _showAddCityDialog,
      );
    }

    final filteredEntries = _filteredEntries();

    return Column(
      children: [
        _SubTabBar(
          selectedIndex: _selectedSubTab,
          counts: _TabCounts(
            all: _allCount,
            mustGo: _mustGoCount,
            today: _todaysPlanCount,
            visited: _visitedCount,
          ),
          onChanged: _onSubTabChanged,
        ),
        Container(
          width: double.infinity,
          color: AppTheme.white,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: _tagOptions.isEmpty
              ? const SizedBox.shrink()
              : SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: _tagOptions
                        .map(
                          (tag) => Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: _TagChip(
                              label: tag,
                              active: _activeTags.contains(tag),
                              onTap: () => _toggleTag(tag),
                            ),
                          ),
                        )
                        .toList(),
                  ),
                ),
        ),
        Expanded(
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 220),
            switchInCurve: Curves.easeInOut,
            switchOutCurve: Curves.easeInOut,
            child: filteredEntries.isEmpty
                ? _EmptyState(
                    onOpenMap: _openFullMap,
                    isMapView: _isMapView,
                  )
                : _isMapView
                    // MustGo (1) 和 Today's Plan (2) 使用紧凑地图预览
                    ? (_selectedSubTab == 1 || _selectedSubTab == 2)
                        ? _CompactMapPreview(
                            key: ValueKey('compact-map-view-$_selectedSubTab-$_selectedCitySlug'),
                            entries: filteredEntries,
                            cityName: _selectedCityName,
                            spotsCount: filteredEntries.length,
                            onOpenFullMap: _openFullMap,
                            availableCities: _getAvailableCitiesForCurrentTab(),
                            onCityChanged: _selectCity,
                          )
                        : _MapPreview(
                            key: const ValueKey('map-view'),
                            entries: filteredEntries,
                            cityName: _selectedCityName,
                            tagOptions: _tagOptions,
                            activeTags: _activeTags,
                            onToggleTag: _toggleTag,
                            onOpenFullMap: _openFullMap,
                            controller: _carouselController,
                            onCardTap: _handleCheckIn,
                          )
                    : _ListView(
                        key: const ValueKey('list-view'),
                        entries: filteredEntries,
                        onCheckIn: _handleCheckIn,
                        onToggleMustGo: _handleToggleMustGo,
                        onQuickAddMustGo: _handleQuickAddMustGo,
                        onSpotTap: _handleSpotTap,
                      ),
          ),
        ),
      ],
    );
  }

  static List<_SpotEntry> _buildMockEntries() => [];
}

class _LoadingState extends StatelessWidget {
  const _LoadingState();

  @override
  Widget build(BuildContext context) => const Center(
        child: Padding(
          padding: EdgeInsets.only(top: 64),
          child: CircularProgressIndicator(),
        ),
      );
}

class _TabCounts {
  const _TabCounts({
    required this.all,
    required this.mustGo,
    required this.today,
    required this.visited,
  });

  final int all;
  final int mustGo;
  final int today;
  final int visited;
}

class _TagChip extends StatelessWidget {
  const _TagChip({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final displayLabel = label.isEmpty
        ? ''
        : '${label[0].toUpperCase()}${label.length > 1 ? label.substring(1) : ''}';
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: active ? AppTheme.primaryYellow : AppTheme.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: AppTheme.black,
            width: AppTheme.borderThin,
          ),
          boxShadow: active ? AppTheme.cardShadow : null,
        ),
        child: Text(
          displayLabel,
          style: AppTheme.labelMedium(context).copyWith(
            color: AppTheme.black,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

class _SubTabBar extends StatelessWidget {
  const _SubTabBar({
    required this.selectedIndex,
    required this.counts,
    required this.onChanged,
  });

  final int selectedIndex;
  final _TabCounts counts;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        color: AppTheme.white,
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              _SubTabButton(
                label: 'All',
                count: counts.all,
                isActive: selectedIndex == 0,
                onTap: () => onChanged(0),
              ),
              const SizedBox(width: 12),
              _SubTabButton(
                label: 'MustGo',
                count: counts.mustGo,
                isActive: selectedIndex == 1,
                onTap: () => onChanged(1),
              ),
              const SizedBox(width: 12),
              _SubTabButton(
                label: "Today's Plan",
                count: counts.today,
                isActive: selectedIndex == 2,
                onTap: () => onChanged(2),
              ),
              const SizedBox(width: 12),
              _SubTabButton(
                label: 'Visited',
                count: counts.visited,
                isActive: selectedIndex == 3,
                onTap: () => onChanged(3),
              ),
            ],
          ),
        ),
      );
}

class _SubTabButton extends StatelessWidget {
  const _SubTabButton({
    required this.label,
    required this.count,
    required this.isActive,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool isActive;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  style: AppTheme.bodyLarge(context).copyWith(
                    color: isActive
                        ? AppTheme.black
                        : AppTheme.black.withOpacity(0.45),
                    fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryYellow
                        .withOpacity(isActive ? 0.9 : 0.35),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: AppTheme.black,
                      width: AppTheme.borderThin,
                    ),
                  ),
                  child: Text(
                    count.toString(),
                    style: AppTheme.labelSmall(context).copyWith(
                      color: AppTheme.black,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            AnimatedContainer(
              duration: const Duration(milliseconds: 160),
              height: 4,
              width: isActive ? 56 : 36,
              decoration: BoxDecoration(
                color: isActive ? AppTheme.primaryYellow : Colors.transparent,
                borderRadius: BorderRadius.circular(2),
                border: Border.all(
                  color: isActive ? AppTheme.black : Colors.transparent,
                  width: AppTheme.borderThin,
                ),
              ),
            ),
          ],
        ),
      );
}

class _ViewToggleButton extends StatelessWidget {
  const _ViewToggleButton({
    required this.label,
    required this.icon,
    required this.active,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: active ? AppTheme.primaryYellow : AppTheme.white,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: AppTheme.black,
              width: AppTheme.borderMedium,
            ),
            boxShadow: active ? AppTheme.cardShadow : null,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 18, color: AppTheme.black),
              const SizedBox(width: 6),
              Text(
                label,
                style: AppTheme.labelMedium(context).copyWith(
                  color: AppTheme.black,
                ),
              ),
            ],
          ),
        ),
      );
}

class _QuickActionChip extends StatelessWidget {
  const _QuickActionChip({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: AppTheme.white,
              borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
              border: Border.all(
                color: AppTheme.black,
                width: AppTheme.borderMedium,
              ),
              boxShadow: AppTheme.cardShadow,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 18, color: AppTheme.black),
                const SizedBox(width: 8),
                Text(
                  label,
                  style: AppTheme.labelSmall(context).copyWith(
                    color: AppTheme.black,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
}

class _ListView extends StatelessWidget {
  const _ListView({
    super.key,
    required this.entries,
    required this.onCheckIn,
    required this.onToggleMustGo,
    required this.onQuickAddMustGo,
    required this.onSpotTap,
  });

  final List<_SpotEntry> entries;
  final void Function(Spot spot) onCheckIn;
  final Future<void> Function(Spot spot) onToggleMustGo;
  final Future<void> Function(Spot spot) onQuickAddMustGo;
  final void Function(_SpotEntry entry) onSpotTap;

  @override
  Widget build(BuildContext context) => ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 24, 16, 24),
        itemCount: entries.length,
        separatorBuilder: (_, __) => const SizedBox(height: 16),
        itemBuilder: (context, index) {
          final entry = entries[index];
          return Dismissible(
            key: ValueKey('spot-${entry.spot.id}'),
            direction: DismissDirection.startToEnd,
            confirmDismiss: (direction) async {
              onQuickAddMustGo(entry.spot);
              return false;
            },
            background: _SwipeBackground(isMustGo: entry.isMustGo),
            child: SpotCard(
              spot: entry.spot,
              isMustGo: entry.isMustGo,
              onCheckIn: () => onCheckIn(entry.spot),
              onToggleMustGo: () => onToggleMustGo(entry.spot),
              onTap: () => onSpotTap(entry),
            ),
          );
        },
      );
}

class _SwipeBackground extends StatelessWidget {
  const _SwipeBackground({required this.isMustGo});

  final bool isMustGo;

  @override
  Widget build(BuildContext context) => Container(
        alignment: Alignment.centerLeft,
        decoration: BoxDecoration(
          color: AppTheme.primaryYellow.withOpacity(isMustGo ? 0.15 : 0.35),
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
          border: Border.all(
            color: AppTheme.black,
            width: AppTheme.borderMedium,
          ),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.star,
              color: AppTheme.black,
            ),
            const SizedBox(width: 8),
            Text(
              isMustGo ? 'Already in MustGo' : 'Slide to MustGo',
              style: AppTheme.labelMedium(context).copyWith(
                color: AppTheme.black,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      );
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.onOpenMap,
    required this.isMapView,
  });

  final VoidCallback onOpenMap;
  final bool isMapView;

  @override
  Widget build(BuildContext context) => Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 140,
                height: 140,
                decoration: BoxDecoration(
                  color: AppTheme.primaryYellow.withOpacity(0.25),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: AppTheme.black,
                    width: AppTheme.borderMedium,
                  ),
                ),
                child: Icon(
                  isMapView ? Icons.map_outlined : Icons.bookmark_border,
                  size: 64,
                  color: AppTheme.black,
                ),
              ),
              const SizedBox(height: 28),
              Text(
                'You have no spots here yet',
                textAlign: TextAlign.center,
                style: AppTheme.bodyLarge(context).copyWith(
                  color: AppTheme.black.withOpacity(0.65),
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'To find interesting spots',
                textAlign: TextAlign.center,
                style: AppTheme.bodyMedium(context).copyWith(
                  color: AppTheme.black.withOpacity(0.45),
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 28),
              GestureDetector(
                onTap: onOpenMap,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 28,
                    vertical: 14,
                  ),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryYellow,
                    borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                    border: Border.all(
                      color: AppTheme.black,
                      width: AppTheme.borderMedium,
                    ),
                    boxShadow: AppTheme.cardShadow,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.add, color: AppTheme.black),
                      const SizedBox(width: 8),
                      Text(
                        'Add spots',
                        style: AppTheme.labelLarge(context).copyWith(
                          color: AppTheme.black,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      );
}

class _NoDestinationState extends StatelessWidget {
  const _NoDestinationState({
    required this.onAddDestination,
  });

  final VoidCallback onAddDestination;

  @override
  Widget build(BuildContext context) => Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 140,
                height: 140,
                decoration: BoxDecoration(
                  color: AppTheme.primaryYellow.withOpacity(0.25),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: AppTheme.black,
                    width: AppTheme.borderMedium,
                  ),
                ),
                child: const Icon(
                  Icons.explore_outlined,
                  size: 64,
                  color: AppTheme.black,
                ),
              ),
              const SizedBox(height: 28),
              Text(
                "It seems you don't have any plan",
                textAlign: TextAlign.center,
                style: AppTheme.bodyLarge(context).copyWith(
                  color: AppTheme.black.withOpacity(0.65),
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'Add one more city to explore',
                textAlign: TextAlign.center,
                style: AppTheme.bodyMedium(context).copyWith(
                  color: AppTheme.black.withOpacity(0.45),
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 28),
              GestureDetector(
                onTap: onAddDestination,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 28,
                    vertical: 14,
                  ),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryYellow,
                    borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                    border: Border.all(
                      color: AppTheme.black,
                      width: AppTheme.borderMedium,
                    ),
                    boxShadow: AppTheme.cardShadow,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.add, color: AppTheme.black),
                      const SizedBox(width: 8),
                      Text(
                        'Add destination',
                        style: AppTheme.labelLarge(context).copyWith(
                          color: AppTheme.black,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      );
}

/// 紧凑地图预览组件 - 类似 home-map 初始态，展示真正的 Mapbox 地图、城市标签和放大按钮
class _CompactMapPreview extends StatefulWidget {
  const _CompactMapPreview({
    super.key,
    required this.entries,
    required this.cityName,
    required this.spotsCount,
    required this.onOpenFullMap,
    this.availableCities = const [],
    this.onCityChanged,
  });

  final List<_SpotEntry> entries;
  final String cityName;
  final int spotsCount;
  final VoidCallback onOpenFullMap;
  final List<String> availableCities;
  final ValueChanged<String>? onCityChanged;

  @override
  State<_CompactMapPreview> createState() => _CompactMapPreviewState();
}

class _CompactMapPreviewState extends State<_CompactMapPreview> {
  final GlobalKey<MapboxSpotMapState> _mapKey = GlobalKey<MapboxSpotMapState>();
  map_page.Spot? _selectedSpot;

  @override
  void initState() {
    super.initState();
    // 默认选中第一个地点（最新的）
    final mapSpots = _convertToMapSpots();
    if (mapSpots.isNotEmpty) {
      _selectedSpot = mapSpots.first;
      // 延迟跳转相机到选中的地点
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_selectedSpot != null && _mapKey.currentState != null) {
          _mapKey.currentState!.jumpToPosition(
            Position(_selectedSpot!.longitude, _selectedSpot!.latitude),
            zoom: 14.0,
          );
        }
      });
    }
  }

  /// 将 _SpotEntry 转换为 map_page.Spot
  List<map_page.Spot> _convertToMapSpots() {
    return widget.entries.map((entry) {
      final spot = entry.spot;
      final List<String> imageList = spot.images;
      final String coverImg = imageList.isNotEmpty ? imageList.first : '';
      final List<String> tagList = spot.tags
          .map((e) => e.toString().trim())
          .where((e) => e.isNotEmpty)
          .toList();
      final String category = (spot.category ?? 'place').trim();
      if (category.isNotEmpty && !tagList.contains(category)) {
        tagList.add(category);
      }

      return map_page.Spot(
        id: spot.id,
        name: spot.name,
        city: spot.city ?? 'Unknown',
        category: category.isNotEmpty ? category : 'place',
        latitude: spot.latitude,
        longitude: spot.longitude,
        rating: spot.rating ?? 0.0,
        ratingCount: spot.ratingCount ?? 0,
        coverImage: coverImg,
        images: imageList,
        tags: tagList,
        aiSummary: null,
      );
    }).toList();
  }

  /// 获取地图中心点 - 优先使用选中的地点
  Position _getMapCenter() {
    // 优先使用选中的地点
    if (_selectedSpot != null) {
      return Position(_selectedSpot!.longitude, _selectedSpot!.latitude);
    }
    // 使用第一个地点
    if (widget.entries.isNotEmpty) {
      final first = widget.entries.first.spot;
      return Position(first.longitude, first.latitude);
    }
    return Position(139.6503, 35.6762); // Tokyo as default
  }

  void _showCityPicker() {
    if (widget.availableCities.isEmpty) return;
    
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.5,
        minChildSize: 0.3,
        maxChildSize: 0.8,
        expand: false,
        builder: (context, scrollController) => Container(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Select City', style: AppTheme.headlineMedium(context)),
              const SizedBox(height: 16),
              Expanded(
                child: ListView.builder(
                  controller: scrollController,
                  itemCount: widget.availableCities.length,
                  itemBuilder: (context, index) {
                    final city = widget.availableCities[index];
                    return ListTile(
                      title: Text(city, style: AppTheme.bodyLarge(context)),
                      trailing: city == widget.cityName
                          ? const Icon(Icons.check, color: AppTheme.primaryYellow)
                          : null,
                      onTap: () {
                        Navigator.pop(context);
                        if (city != widget.cityName) {
                          widget.onCityChanged?.call(city);
                        }
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final mapSpots = _convertToMapSpots();
    final center = _getMapCenter();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
      child: Container(
        decoration: BoxDecoration(
          color: AppTheme.background,
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
          border: Border.all(
            color: AppTheme.black,
            width: AppTheme.borderMedium,
          ),
          boxShadow: AppTheme.cardShadow,
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium - 2),
          child: Stack(
            children: [
              // Mapbox 地图 - 支持拖拽和缩放交互
              Positioned.fill(
                child: MapboxSpotMap(
                  key: _mapKey,
                  spots: mapSpots,
                  initialCenter: center,
                  initialZoom: 14.0,
                  selectedSpot: _selectedSpot,
                  onSpotTap: (_) => widget.onOpenFullMap(), // 点击地点进入全屏
                  onCameraMove: (_, __) {},
                ),
              ),
              // 顶部：城市标签和放大按钮
              Positioned(
                top: 12,
                left: 12,
                right: 12,
                child: Row(
                  children: [
                    // 城市标签（可点击切换城市）
                    GestureDetector(
                      onTap: widget.availableCities.isNotEmpty ? _showCityPicker : null,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                        decoration: BoxDecoration(
                          color: AppTheme.white,
                          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                          border: Border.all(
                            color: AppTheme.black,
                            width: AppTheme.borderMedium,
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              widget.cityName,
                              style: AppTheme.labelLarge(context).copyWith(
                                color: AppTheme.black,
                              ),
                            ),
                            if (widget.availableCities.isNotEmpty) ...[
                              const SizedBox(width: 4),
                              const Icon(
                                Icons.keyboard_arrow_down,
                                size: 20,
                                color: AppTheme.black,
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                    const Spacer(),
                    // 放大按钮
                    GestureDetector(
                      onTap: widget.onOpenFullMap,
                      child: Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: AppTheme.white,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: AppTheme.black,
                            width: AppTheme.borderMedium,
                          ),
                        ),
                        child: const Icon(
                          Icons.fullscreen,
                          size: 24,
                          color: AppTheme.black,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MapPreview extends StatelessWidget {
  const _MapPreview({
    super.key,
    required this.entries,
    required this.cityName,
    required this.tagOptions,
    required this.activeTags,
    required this.onToggleTag,
    required this.onOpenFullMap,
    required this.controller,
    required this.onCardTap,
  });

  final List<_SpotEntry> entries;
  final String cityName;
  final List<String> tagOptions;
  final Set<String> activeTags;
  final void Function(String tag) onToggleTag;
  final VoidCallback onOpenFullMap;
  final PageController controller;
  final void Function(Spot spot) onCardTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
        child: Stack(
          children: [
            Positioned.fill(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
                child: Container(
                  decoration: BoxDecoration(
                    color: AppTheme.background,
                    border: Border.all(
                      color: AppTheme.black,
                      width: AppTheme.borderMedium,
                    ),
                    boxShadow: AppTheme.strongShadow,
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(
                        Icons.map_outlined,
                        size: 48,
                        color: AppTheme.mediumGray,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Interactive map coming soon',
                        style: AppTheme.bodyLarge(context).copyWith(
                          color: AppTheme.black.withOpacity(0.6),
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: onOpenFullMap,
                        child: const Text('Open full map'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            Positioned(
              top: 16,
              left: 16,
              right: 16,
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: tagOptions.map((tag) {
                    final isSelected = activeTags.contains(tag);
                    return Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: _TagChip(
                        label: '#$tag',
                        active: isSelected,
                        onTap: () => onToggleTag(tag),
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),
            Positioned(
              top: 16,
              left: 16,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: AppTheme.white,
                  borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                  border: Border.all(
                    color: AppTheme.black,
                    width: AppTheme.borderMedium,
                  ),
                  boxShadow: AppTheme.cardShadow,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.location_on,
                      size: 16,
                      color: AppTheme.black,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      cityName,
                      style: AppTheme.labelSmall(context).copyWith(
                        color: AppTheme.black,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Positioned(
              bottom: 16,
              left: 0,
              right: 0,
              child: SizedBox(
                height: 210,
                child: PageView.builder(
                  controller: controller,
                  physics: const BouncingScrollPhysics(),
                  itemCount: entries.length,
                  itemBuilder: (context, index) => _SpotCarouselCard(
                    entry: entries[index],
                    onCheckIn: () => onCardTap(entries[index].spot),
                  ),
                ),
              ),
            ),
          ],
        ),
      );
}

class _SpotCarouselCard extends StatelessWidget {
  const _SpotCarouselCard({
    required this.entry,
    required this.onCheckIn,
  });

  final _SpotEntry entry;
  final VoidCallback onCheckIn;

  /// Combine category (if present) and tags, removing duplicates
  List<String> _effectiveTags() {
    final List<String> result = [];
    final Set<String> seen = {};

    final category = entry.spot.category?.trim() ?? '';
    if (category.isNotEmpty) {
      result.add(category);
      seen.add(category.toLowerCase());
    }

    for (final raw in entry.spot.tags) {
      final tag = raw.trim();
      if (tag.isEmpty) continue;
      final key = tag.toLowerCase();
      if (seen.add(key)) {
        result.add(tag);
      }
    }

    return result;
  }

  /// Build image widget that handles both data URIs and network URLs
  Widget _buildImageWidget(String imageSource) {
    final placeholder = Container(
      color: AppTheme.lightGray,
      child: const Icon(
        Icons.photo,
        size: 48,
        color: AppTheme.mediumGray,
      ),
    );

    // Handle data URI format (data:image/jpeg;base64,...)
    if (imageSource.startsWith('data:')) {
      try {
        final base64Data = imageSource.split(',').last;
        final bytes = base64Decode(base64Data);
        return Image.memory(
          bytes,
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
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => placeholder,
    );
  }

  @override
  Widget build(BuildContext context) {
    final imageUrl =
        entry.spot.images.isNotEmpty ? entry.spot.images.first : null;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppTheme.radiusLarge),
          border: Border.all(
            color: AppTheme.black,
            width: AppTheme.borderMedium,
          ),
          boxShadow: AppTheme.cardShadow,
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppTheme.radiusLarge - 2),
          child: Stack(
            children: [
              Positioned.fill(
                child: imageUrl != null
                    ? _buildImageWidget(imageUrl)
                    : Container(
                        color: AppTheme.lightGray,
                        child: const Icon(
                          Icons.photo,
                          size: 48,
                          color: AppTheme.mediumGray,
                        ),
                      ),
              ),
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.bottomCenter,
                      end: Alignment.topCenter,
                      colors: [
                        Colors.black.withOpacity(0.75),
                        Colors.transparent,
                      ],
                    ),
                  ),
                ),
              ),
              Positioned(
                left: 16,
                right: 16,
                bottom: 16,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      entry.spot.name,
                      style: AppTheme.headlineMedium(context).copyWith(
                        color: AppTheme.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: _effectiveTags().take(3).map((tag) {
                        return Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: AppTheme.primaryYellow.withOpacity(0.9),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: AppTheme.black,
                              width: AppTheme.borderThin,
                            ),
                          ),
                          child: Text(
                            tag,
                            style: AppTheme.labelSmall(context).copyWith(
                              color: AppTheme.black,
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 12),
                    Align(
                      alignment: Alignment.centerRight,
                      child: GestureDetector(
                        onTap: onCheckIn,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 18,
                            vertical: 10,
                          ),
                          decoration: BoxDecoration(
                            color: AppTheme.white,
                            borderRadius:
                                BorderRadius.circular(AppTheme.radiusSmall),
                            border: Border.all(
                              color: AppTheme.black,
                              width: AppTheme.borderMedium,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                Icons.check_circle_outline,
                                size: 16,
                                color: AppTheme.black,
                              ),
                              const SizedBox(width: 6),
                              Text(
                                'Check in',
                                style: AppTheme.labelSmall(context).copyWith(
                                  color: AppTheme.black,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SpotEntry {
  _SpotEntry({
    required this.city,
    required this.citySlug,
    required this.spot,
    required this.addedAt,
    this.isMustGo = false,
    this.isTodaysPlan = false,
    this.isVisited = false,
    DateTime? mustGoCheckedAt,
    DateTime? todaysPlanCheckedAt,
  })  : mustGoCheckedAt = mustGoCheckedAt ?? (isMustGo ? DateTime.now() : null),
        todaysPlanCheckedAt = todaysPlanCheckedAt ?? (isTodaysPlan ? DateTime.now() : null);

  final String city;
  final String citySlug;
  final Spot spot;
  final DateTime addedAt;
  final bool isMustGo;
  final bool isTodaysPlan;
  final bool isVisited;
  final DateTime? mustGoCheckedAt;
  final DateTime? todaysPlanCheckedAt;

  _SpotEntry copyWith({
    bool? isMustGo,
    bool? isTodaysPlan,
    bool? isVisited,
    DateTime? addedAt,
    DateTime? mustGoCheckedAt,
    DateTime? todaysPlanCheckedAt,
  }) {
    final nowMustGo = isMustGo ?? this.isMustGo;
    final nowTodaysPlan = isTodaysPlan ?? this.isTodaysPlan;
    
    return _SpotEntry(
      city: city,
      citySlug: citySlug,
      spot: spot,
      addedAt: addedAt ?? this.addedAt,
      isMustGo: nowMustGo,
      isTodaysPlan: nowTodaysPlan,
      isVisited: isVisited ?? this.isVisited,
      // Update mustGoCheckedAt: set to now if newly checked, keep existing if still checked, null if unchecked
      mustGoCheckedAt: isMustGo != null
          ? (nowMustGo ? (this.isMustGo ? this.mustGoCheckedAt : DateTime.now()) : null)
          : this.mustGoCheckedAt,
      // Update todaysPlanCheckedAt similarly
      todaysPlanCheckedAt: isTodaysPlan != null
          ? (nowTodaysPlan ? (this.isTodaysPlan ? this.todaysPlanCheckedAt : DateTime.now()) : null)
          : this.todaysPlanCheckedAt,
    );
  }
}
