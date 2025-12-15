import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/shared/models/spot_model.dart';
import 'package:wanderlog/features/trips/presentation/widgets/myland/spot_card.dart';
import 'package:wanderlog/features/trips/presentation/widgets/myland/check_in_dialog.dart';
import 'package:wanderlog/features/trips/presentation/widgets/myland/add_city_dialog.dart';

/// Spots Tab - 以地图为主的收藏概览，支持列表回退
class SpotsTab extends ConsumerStatefulWidget {
  const SpotsTab({
    super.key,
    this.initialSubTab,
  });

  final int? initialSubTab;

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

  final List<_SpotEntry> _entries = _buildMockEntries();
  final Set<String> _activeTags = {};
  final PageController _carouselController =
      PageController(viewportFraction: 0.78);

  late int _selectedSubTab;
  late bool _isMapView;
  late String _selectedCitySlug;

  List<_SpotEntry> get _entriesForCity =>
      _entries.where((entry) => entry.citySlug == _selectedCitySlug).toList();

  int get _allCount => _entriesForCity.length;
  int get _mustGoCount =>
      _entriesForCity.where((entry) => entry.isMustGo).length;
  int get _todaysPlanCount =>
      _entriesForCity.where((entry) => entry.isTodaysPlan).length;
  int get _visitedCount =>
      _entriesForCity.where((entry) => entry.isVisited).length;

  List<String> get _availableCities =>
      _entries.map((entry) => entry.city).toSet().toList()..sort();

  List<String> get _tagOptions {
    final tagSet = <String>{};
    for (final entry in _entriesForCity) {
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
    if (_entries.isEmpty) {
      return 'Your city';
    }
    final entry = _entries.firstWhere(
      (element) => element.citySlug == _selectedCitySlug,
      orElse: () => _entries.first,
    );
    return entry.city;
  }

  @override
  void initState() {
    super.initState();
    _selectedSubTab = _normalizeSubTab(widget.initialSubTab ?? 0);
    _isMapView = _defaultMapViewFor(_selectedSubTab);
    _selectedCitySlug =
        _entries.isNotEmpty ? _entries.first.citySlug : 'copenhagen';
  }

  @override
  void didUpdateWidget(covariant SpotsTab oldWidget) {
    super.didUpdateWidget(oldWidget);
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

  void _showAddCityDialog() {
    showDialog<void>(
      context: context,
      builder: (context) => AddCityDialog(
        availableCities: _availableCities,
        onCitySelected: (city) {
          if (_entries.isEmpty) {
            setState(() {
              _selectedCitySlug = city.toLowerCase().replaceAll(' ', '-');
              _isMapView = _defaultMapViewFor(_selectedSubTab);
            });
            return;
          }
          final match = _entries.firstWhere(
            (entry) => entry.city == city,
            orElse: () => _entries.first,
          );
          setState(() {
            _selectedCitySlug = match.citySlug;
            _isMapView = _defaultMapViewFor(_selectedSubTab);
          });
        },
      ),
    );
  }

  void _openFullMap() {
    final query = _selectedCitySlug.replaceAll(' ', '%20');
    context.push('/map?city=$query&from=myland');
  }

  List<_SpotEntry> _filteredEntries() {
    Iterable<_SpotEntry> base = _entriesForCity;
    switch (_selectedSubTab) {
      case 1:
        base = base.where((entry) => entry.isMustGo);
        break;
      case 2:
        base = base.where((entry) => entry.isTodaysPlan);
        break;
      case 3:
        base = base.where((entry) => entry.isVisited);
        break;
      default:
        break;
    }

    if (_activeTags.isEmpty) {
      return base.toList();
    }

    return base
        .where(
          (entry) => entry.spot.tags
              .map((tag) => tag.toLowerCase())
              .any(_activeTags.contains),
        )
        .toList();
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

  @override
  Widget build(BuildContext context) {
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
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _currentTabLabel(),
                          style: AppTheme.headlineMedium(context).copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${filteredEntries.length} spots · $_selectedCityName',
                          style: AppTheme.bodyMedium(context).copyWith(
                            color: AppTheme.black.withOpacity(0.55),
                          ),
                        ),
                      ],
                    ),
                  ),
                  _ViewToggleButton(
                    label: 'Map',
                    icon: Icons.map,
                    active: _isMapView,
                    onTap: () => _toggleView(true),
                  ),
                  const SizedBox(width: 8),
                  _ViewToggleButton(
                    label: 'List',
                    icon: Icons.view_agenda,
                    active: !_isMapView,
                    onTap: () => _toggleView(false),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: 44,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    _QuickActionChip(
                      icon: Icons.add_location_alt_outlined,
                      label: 'Add city',
                      onTap: _showAddCityDialog,
                    ),
                    _QuickActionChip(
                      icon: Icons.fullscreen,
                      label: 'Open map',
                      onTap: _openFullMap,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 220),
            switchInCurve: Curves.easeInOut,
            switchOutCurve: Curves.easeInOut,
            child: filteredEntries.isEmpty
                ? _EmptyState(
                    onAddCity: _showAddCityDialog,
                    isMapView: _isMapView,
                  )
                : _isMapView
                    ? _MapPreview(
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
                      ),
          ),
        ),
      ],
    );
  }

  static List<_SpotEntry> _buildMockEntries() => [
        _SpotEntry(
          city: 'Copenhagen',
          citySlug: 'copenhagen',
          isMustGo: true,
          isTodaysPlan: true,
          spot: Spot(
            id: 'spot-nyhavn',
            googlePlaceId: 'nyhavn',
            name: 'Nyhavn Harbor',
            latitude: 55.6796,
            longitude: 12.5908,
            address: 'Nyhavn, Copenhagen',
            category: 'landmark',
            tags: const ['Architecture', 'Harbor', 'History'],
            images: const [
              'https://images.unsplash.com/photo-1505733563568-6247e1ac6904?auto=format&fit=crop&w=1200&q=80'
            ],
            rating: 4.7,
            priceLevel: 2,
            website: 'https://nyhavn.com',
            phoneNumber: '+45 1234 5678',
            createdAt: DateTime(2024, 11, 24),
            updatedAt: DateTime(2024, 11, 24),
          ),
        ),
        _SpotEntry(
          city: 'Copenhagen',
          citySlug: 'copenhagen',
          isMustGo: true,
          spot: Spot(
            id: 'spot-designmuseum',
            googlePlaceId: 'designmuseum',
            name: 'Designmuseum Danmark',
            latitude: 55.6870,
            longitude: 12.5937,
            address: 'Bredgade 68, Copenhagen',
            category: 'museum',
            tags: const ['Design', 'Museum', 'Architecture'],
            images: const [
              'https://images.unsplash.com/photo-1500522144261-ea64433bbe27?auto=format&fit=crop&w=1200&q=80'
            ],
            rating: 4.6,
            priceLevel: 3,
            website: 'https://designmuseum.dk',
            phoneNumber: '+45 3344 3360',
            createdAt: DateTime(2024, 10, 18),
            updatedAt: DateTime(2024, 12, 4),
          ),
        ),
        _SpotEntry(
          city: 'Copenhagen',
          citySlug: 'copenhagen',
          isTodaysPlan: true,
          spot: Spot(
            id: 'spot-juno',
            googlePlaceId: 'juno',
            name: 'Juno the Bakery',
            latitude: 55.7024,
            longitude: 12.5710,
            address: 'Århusgade 48, Copenhagen',
            category: 'bakery',
            tags: const ['Food', 'Coffee', 'Bakery'],
            images: const [
              'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80'
            ],
            rating: 4.9,
            priceLevel: 1,
            website: 'https://junothebakery.dk',
            phoneNumber: '+45 1122 3344',
            createdAt: DateTime(2024, 12, 1),
            updatedAt: DateTime(2024, 12, 2),
          ),
        ),
        _SpotEntry(
          city: 'Paris',
          citySlug: 'paris',
          isVisited: true,
          spot: Spot(
            id: 'spot-louvre',
            googlePlaceId: 'louvre',
            name: 'Louvre Museum',
            latitude: 48.8606,
            longitude: 2.3376,
            address: 'Rue de Rivoli, Paris',
            category: 'museum',
            tags: const ['Museum', 'Art', 'History'],
            images: const [
              'https://images.unsplash.com/photo-1549893214-952c2053ce1e?auto=format&fit=crop&w=1200&q=80'
            ],
            rating: 4.8,
            priceLevel: 3,
            website: 'https://www.louvre.fr',
            phoneNumber: '+33 1 40 20 50 50',
            createdAt: DateTime(2024, 8, 9),
            updatedAt: DateTime(2024, 9, 2),
          ),
        ),
        _SpotEntry(
          city: 'Paris',
          citySlug: 'paris',
          spot: Spot(
            id: 'spot-holybelly',
            googlePlaceId: 'holybelly',
            name: 'Holybelly 5',
            latitude: 48.8722,
            longitude: 2.3596,
            address: '5 Rue Lucien Sampaix, Paris',
            category: 'restaurant',
            tags: const ['Food', 'Brunch', 'Coffee'],
            images: const [
              'https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=1200&q=80'
            ],
            rating: 4.5,
            priceLevel: 2,
            website: 'https://holybellycafe.com',
            phoneNumber: '+33 1 82 28 00 80',
            createdAt: DateTime(2024, 7, 15),
            updatedAt: DateTime(2024, 7, 21),
          ),
        ),
        _SpotEntry(
          city: 'Paris',
          citySlug: 'paris',
          isVisited: true,
          spot: Spot(
            id: 'spot-jardin',
            googlePlaceId: 'jardin',
            name: 'Jardin du Luxembourg',
            latitude: 48.8462,
            longitude: 2.3371,
            address: 'Rue de Médicis, Paris',
            category: 'park',
            tags: const ['Park', 'Garden', 'Relax'],
            images: const [
              'https://images.unsplash.com/photo-1528901166007-3784c7dd3653?auto=format&fit=crop&w=1200&q=80'
            ],
            rating: 4.7,
            priceLevel: 0,
            website: 'https://www.senat.fr/visite/jardin/index.html',
            phoneNumber: '+33 1 42 34 20 00',
            createdAt: DateTime(2024, 6, 4),
            updatedAt: DateTime(2024, 10, 11),
          ),
        ),
      ];
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
        color: AppTheme.white,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
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
              const SizedBox(width: 16),
              _SubTabButton(
                label: 'MustGo',
                count: counts.mustGo,
                isActive: selectedIndex == 1,
                onTap: () => onChanged(1),
              ),
              const SizedBox(width: 16),
              _SubTabButton(
                label: "Today's Plan",
                count: counts.today,
                isActive: selectedIndex == 2,
                onTap: () => onChanged(2),
              ),
              const SizedBox(width: 16),
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
  });

  final List<_SpotEntry> entries;
  final void Function(Spot spot) onCheckIn;

  @override
  Widget build(BuildContext context) => ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 24, 16, 24),
        itemCount: entries.length,
        separatorBuilder: (_, __) => const SizedBox(height: 16),
        itemBuilder: (context, index) => SpotCard(
          spot: entries[index].spot,
          onCheckIn: () => onCheckIn(entries[index].spot),
        ),
      );
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.onAddCity,
    required this.isMapView,
  });

  final VoidCallback onAddCity;
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
                isMapView
                    ? 'No spots on the map yet'
                    : 'You have no spots here yet',
                textAlign: TextAlign.center,
                style: AppTheme.bodyLarge(context).copyWith(
                  color: AppTheme.black.withOpacity(0.65),
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'Add another city to start planning your next adventure.',
                textAlign: TextAlign.center,
                style: AppTheme.bodyMedium(context).copyWith(
                  color: AppTheme.black.withOpacity(0.45),
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 28),
              GestureDetector(
                onTap: onAddCity,
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
                        'Add city',
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

class _TagChip extends StatelessWidget {
  const _TagChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: selected ? AppTheme.primaryYellow : AppTheme.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: AppTheme.black,
              width: AppTheme.borderMedium,
            ),
            boxShadow: selected ? AppTheme.cardShadow : null,
          ),
          child: Text(
            label,
            style: AppTheme.labelSmall(context).copyWith(
              color: AppTheme.black,
            ),
          ),
        ),
      );
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
                        selected: isSelected,
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
                    ? Image.network(
                        imageUrl,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Container(
                          color: AppTheme.lightGray,
                          child: const Icon(
                            Icons.photo,
                            size: 48,
                            color: AppTheme.mediumGray,
                          ),
                        ),
                      )
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
                      children: entry.spot.tags.take(3).map((tag) {
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
  const _SpotEntry({
    required this.city,
    required this.citySlug,
    required this.spot,
    this.isMustGo = false,
    this.isTodaysPlan = false,
    this.isVisited = false,
  });

  final String city;
  final String citySlug;
  final Spot spot;
  final bool isMustGo;
  final bool isTodaysPlan;
  final bool isVisited;
}
