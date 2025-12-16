import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart';
import 'package:wanderlog/features/trips/providers/trips_provider.dart';
import 'package:wanderlog/features/trips/presentation/widgets/spot_list_item.dart';

class TripDetailPage extends ConsumerStatefulWidget {

  const TripDetailPage({required this.tripId, super.key});
  final String tripId;

  @override
  ConsumerState<TripDetailPage> createState() => _TripDetailPageState();
}

class _TripDetailPageState extends ConsumerState<TripDetailPage>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tripAsync = ref.watch(tripProvider(widget.tripId));

    return Scaffold(
      appBar: AppBar(
        title: tripAsync.when(
          data: (trip) => Text(trip.name),
          loading: () => const Text('Loading...'),
          error: (_, __) => const Text('Error'),
        ),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Wishlist'),
            Tab(text: "Today's Plan"),
            Tab(text: 'Visited'),
          ],
        ),
      ),
      backgroundColor: const Color(0xFFF7F7F7),
      body: tripAsync.when(
        data: (trip) {
          final wishlistSpots = trip.tripSpots
                  ?.where((ts) => ts.status == TripSpotStatus.wishlist)
                  .toList() ??
              [];
          final todaysPlanSpots = trip.tripSpots
                  ?.where((ts) => ts.status == TripSpotStatus.todaysPlan)
                  .toList() ??
              [];
          final visitedSpots = trip.tripSpots
                  ?.where((ts) => ts.status == TripSpotStatus.visited)
                  .toList() ??
              [];

          return TabBarView(
            controller: _tabController,
            children: [
              _WishlistTab(tripId: widget.tripId, spots: wishlistSpots),
              _TodaysPlanTab(tripId: widget.tripId, spots: todaysPlanSpots),
              _VisitedTab(tripId: widget.tripId, spots: visitedSpots),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 60, color: Colors.red),
              const SizedBox(height: 16),
              const Text('Error loading trip'),
              const SizedBox(height: 8),
              Text(error.toString()),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () {
                  ref.read(tripActionsProvider).refreshTrip(widget.tripId);
                },
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _WishlistTab extends StatelessWidget {

  const _WishlistTab({required this.tripId, required this.spots});
  final String tripId;
  final List<TripSpot> spots;

  @override
  Widget build(BuildContext context) {
    if (spots.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.bookmark_outline, size: 80, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text(
              'No spots in wishlist',
              style: TextStyle(
                fontSize: 16,
                color: Colors.grey.shade600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Add spots from the map to start planning',
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey.shade500,
              ),
            ),
          ],
        ),
      );
    }

    // Sort by priority (Must Go first)
    final sortedSpots = List<TripSpot>.from(spots)
      ..sort((a, b) {
        if (a.priority == b.priority) return 0;
        return a.priority == SpotPriority.mustGo ? -1 : 1;
      });

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: sortedSpots.length,
      itemBuilder: (context, index) => SpotListItem(
          tripId: tripId,
          tripSpot: sortedSpots[index],
        ),
    );
  }
}

class _TodaysPlanTab extends StatelessWidget {

  const _TodaysPlanTab({required this.tripId, required this.spots});
  final String tripId;
  final List<TripSpot> spots;

  @override
  Widget build(BuildContext context) {
    if (spots.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.today_outlined, size: 80, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text(
              'No plans for today',
              style: TextStyle(
                fontSize: 16,
                color: Colors.grey.shade600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Move spots from wishlist to plan your day',
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey.shade500,
              ),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: spots.length,
      itemBuilder: (context, index) => SpotListItem(
          tripId: tripId,
          tripSpot: spots[index],
          showOpeningHours: true,
        ),
    );
  }
}

class _VisitedTab extends StatelessWidget {

  const _VisitedTab({required this.tripId, required this.spots});
  final String tripId;
  final List<TripSpot> spots;

  @override
  Widget build(BuildContext context) {
    if (spots.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.check_circle_outline,
                size: 80, color: Colors.grey.shade400,),
            const SizedBox(height: 16),
            Text(
              'No visited spots yet',
              style: TextStyle(
                fontSize: 16,
                color: Colors.grey.shade600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Check in to spots as you visit them',
              style: TextStyle(
                fontSize: 14,
                color: Colors.grey.shade500,
              ),
            ),
          ],
        ),
      );
    }

    // Sort by visit date (most recent first)
    final sortedSpots = List<TripSpot>.from(spots)
      ..sort((a, b) {
        if (a.visitDate == null && b.visitDate == null) return 0;
        if (a.visitDate == null) return 1;
        if (b.visitDate == null) return -1;
        return b.visitDate!.compareTo(a.visitDate!);
      });

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: sortedSpots.length,
      itemBuilder: (context, index) => SpotListItem(
          tripId: tripId,
          tripSpot: sortedSpots[index],
          showRating: true,
        ),
    );
  }
}






