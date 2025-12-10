import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/pages/login_page.dart';
import '../../features/auth/presentation/pages/register_page.dart';
import '../../features/auth/providers/auth_provider.dart';
import '../../features/trips/presentation/pages/home_page.dart';
import '../../features/trips/presentation/pages/trip_list_page.dart';
import '../../features/trips/presentation/pages/trip_detail_page.dart';
import '../../features/map/presentation/pages/map_view_page.dart';

class AppRouter {
  AppRouter._();

  static final _rootNavigatorKey = GlobalKey<NavigatorState>();

  static GoRouter createRouter(WidgetRef ref) {
    return GoRouter(
      navigatorKey: _rootNavigatorKey,
      initialLocation: '/home',
      redirect: (context, state) {
        final authState = ref.read(authProvider);
        final isAuthenticated = authState.isAuthenticated;
        final isGoingToAuth =
            state.matchedLocation == '/login' || state.matchedLocation == '/register';

        // Redirect to login if not authenticated and not going to auth pages
        if (!isAuthenticated && !isGoingToAuth) {
          return '/login';
        }

        // Redirect to home if authenticated and going to auth pages
        if (isAuthenticated && isGoingToAuth) {
          return '/home';
        }

        return null; // No redirect
      },
      routes: [
        GoRoute(
          path: '/login',
          name: 'login',
          pageBuilder: (context, state) => _slideFromRight(const LoginPage()),
        ),
        GoRoute(
          path: '/register',
          name: 'register',
          builder: (context, state) => const RegisterPage(),
        ),
        GoRoute(
          path: '/home',
          name: 'home',
          builder: (context, state) => const HomePage(),
        ),
        GoRoute(
          path: '/map',
          name: 'map',
          builder: (context, state) {
            final city = state.uri.queryParameters['city'];
            return MapViewPage(city: city);
          },
        ),
        GoRoute(
          path: '/trips',
          name: 'trips',
          builder: (context, state) => const TripListPage(),
        ),
        GoRoute(
          path: '/trips/:id',
          name: 'trip-detail',
          builder: (context, state) {
            final id = state.pathParameters['id']!;
            return TripDetailPage(tripId: id);
          },
        ),
      ],
      errorBuilder: (context, state) => Scaffold(
        body: Center(
          child: Text('Error: ${state.error}'),
        ),
      ),
    );
  }

  // Legacy router for backwards compatibility
  static final GoRouter router = GoRouter(
    initialLocation: '/home',
    routes: [
      GoRoute(
        path: '/login',
        name: 'login',
        pageBuilder: (context, state) => _slideFromRight(const LoginPage()),
      ),
      GoRoute(
        path: '/register',
        name: 'register',
        builder: (context, state) => const RegisterPage(),
      ),
      GoRoute(
        path: '/home',
        name: 'home',
        builder: (context, state) => const HomePage(),
      ),
      GoRoute(
        path: '/trips',
        name: 'trips',
        builder: (context, state) => const TripListPage(),
      ),
    ],
    errorBuilder: (context, state) => Scaffold(
      body: Center(
        child: Text('Error: ${state.error}'),
      ),
    ),
  );

  // Slide transition helper (right -> left for push, left -> right for pop)
  static CustomTransitionPage _slideFromRight(Widget child) {
    return CustomTransitionPage(
      child: child,
      transitionsBuilder: (context, animation, secondaryAnimation, child) {
        final tween = Tween<Offset>(
          begin: const Offset(1, 0),
          end: Offset.zero,
        ).chain(CurveTween(curve: Curves.easeInOut));
        final reverseTween = Tween<Offset>(
          begin: Offset.zero,
          end: const Offset(1, 0),
        ).chain(CurveTween(curve: Curves.easeInOut));
        return SlideTransition(
          position: animation.drive(tween),
          child: SlideTransition(
            position: secondaryAnimation.drive(reverseTween),
            child: child,
          ),
        );
      },
    );
  }
}

