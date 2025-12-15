import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:wanderlog/features/map/presentation/pages/map_page_new.dart';

class MapViewPage extends StatelessWidget {
  const MapViewPage({super.key, this.city, this.fromMyLand = false});

  final String? city;
  final bool fromMyLand;

  @override
  Widget build(BuildContext context) {
    final trimmedCity = city?.trim();
    final hasCity = trimmedCity != null && trimmedCity.isNotEmpty;
    final snapshot = hasCity
        ? MapPageSnapshot(
            selectedCity: trimmedCity!,
            selectedTags: <String>{},
            currentZoom: 13.0,
            carouselSpots: const <Spot>[],
            currentCardIndex: 0,
          )
        : null;

    return MapPage(
      startFullscreen: true,
      initialSnapshot: snapshot,
      onBack: fromMyLand ? (city) => context.pop<String>(city) : null,
    );
  }
}
