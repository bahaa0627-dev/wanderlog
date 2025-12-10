import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/spots_provider.dart';
import '../../../auth/providers/auth_provider.dart';

class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class _HomePageState extends ConsumerState<HomePage> {
  int _selectedIndex = 0;

  static const _mockTrips = [
    {
      'city': 'copenhagen',
      'count': 50,
      'title': '3 day in copenhagen',
      'tags': ['architecture', 'coffee', 'bread', 'brunch'],
    },
    {
      'city': 'Porto',
      'count': 10,
      'title': 'Amazing Architectures in Porto',
      'tags': ['architecture', 'Siza'],
    },
  ];

  void _onNavItemTapped(int index) {
    setState(() => _selectedIndex = index);
    switch (index) {
      case 0:
        // Already on home, do nothing
        break;
      case 1:
        context.push('/trips');
        break;
      case 2:
        // Profile page - placeholder
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile page coming soon')),
        );
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7F7F7),
      body: SafeArea(
        child: Column(
          children: [
            _Header(ref: ref),
            const SizedBox(height: 12),
            _SearchBar(),
            const SizedBox(height: 16),
            const _TabSwitcher(),
            const SizedBox(height: 12),
            Expanded(
              child: ListView.builder(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                itemCount: _mockTrips.length,
                itemBuilder: (context, index) {
                  final trip = _mockTrips[index];
                  return _TripCard(
                    city: trip['city'] as String,
                    count: trip['count'] as int,
                    title: trip['title'] as String,
                    tags:
                        (trip['tags'] as List<String>).map((t) => '#$t').toList(),
                  );
                },
              ),
            ),
            _BottomNav(
              selectedIndex: _selectedIndex,
              onItemTapped: _onNavItemTapped,
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends ConsumerWidget {
  final WidgetRef ref;
  
  const _Header({required this.ref});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final isAuthenticated = authState.isAuthenticated;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          Text(
            'WanderLog',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const Spacer(),
          if (isAuthenticated)
            IconButton(
              icon: const Icon(Icons.account_circle),
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Profile coming soon')),
                );
              },
            )
          else
            TextButton(
              onPressed: () => context.go('/login'),
              child: const Text('sign in'),
            ),
        ],
      ),
    );
  }
}

class _SearchBar extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Colors.grey.shade300),
        ),
        height: 52,
        child: Row(
          children: [
            Icon(Icons.search, color: Colors.grey.shade600),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'where you wanna go, copenhagen, Paris, cairo',
                style: TextStyle(color: Colors.grey.shade500),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TabSwitcher extends StatelessWidget {
  const _TabSwitcher();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.grey.shade300),
        ),
        child: Row(
          children: [
            Expanded(
              child: Container(
                height: 44,
                decoration: BoxDecoration(
                  color: Colors.yellow.shade400,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Center(
                  child: Text(
                    'Album',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ),
            Expanded(
              child: Container(
                height: 44,
                decoration: const BoxDecoration(),
                child: const Center(
                  child: Text(
                    'Map',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TripCard extends StatelessWidget {
  const _TripCard({
    required this.city,
    required this.count,
    required this.title,
    required this.tags,
  });

  final String city;
  final int count;
  final String title;
  final List<String> tags;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFBEA),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.grey.shade300),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _Chip(label: city),
              _Chip(
                label: count.toString(),
                icon: Icons.location_on_outlined,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            title,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: tags
                .map(
                  (tag) => Text(
                    tag,
                    style: TextStyle(
                      color: Colors.grey.shade700,
                      fontSize: 13,
                    ),
                  ),
                )
                .toList(),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, this.icon});

  final String label;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade300),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 16, color: Colors.redAccent),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _BottomNav extends StatelessWidget {
  final int selectedIndex;
  final Function(int) onItemTapped;

  const _BottomNav({
    required this.selectedIndex,
    required this.onItemTapped,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Colors.grey.shade300)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _NavItem(
            label: 'Home',
            active: selectedIndex == 0,
            onTap: () => onItemTapped(0),
          ),
          _NavItem(
            label: 'MyLand',
            active: selectedIndex == 1,
            onTap: () => onItemTapped(1),
          ),
          _NavItem(
            label: 'Profile',
            active: selectedIndex == 2,
            onTap: () => onItemTapped(2),
          ),
        ],
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = active ? Colors.yellow.shade700 : Colors.grey.shade600;
    return GestureDetector(
      onTap: onTap,
      child: Text(
        label,
        style: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}

