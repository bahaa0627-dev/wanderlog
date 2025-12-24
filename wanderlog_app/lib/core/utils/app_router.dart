import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:wanderlog/features/auth/presentation/pages/login_page.dart';
import 'package:wanderlog/features/auth/presentation/pages/register_page.dart';
import 'package:wanderlog/features/auth/presentation/pages/verify_email_page.dart';
import 'package:wanderlog/features/auth/presentation/pages/forgot_password_page.dart';
import 'package:wanderlog/features/auth/presentation/pages/reset_password_page.dart';
import 'package:wanderlog/features/trips/presentation/pages/home_page.dart';
import 'package:wanderlog/features/trips/presentation/pages/trip_list_page.dart';
import 'package:wanderlog/features/trips/presentation/pages/trip_detail_page.dart';
import 'package:wanderlog/features/trips/presentation/pages/my_land_screen.dart';
import 'package:wanderlog/features/trips/presentation/pages/recommendation_detail_page.dart';
import 'package:wanderlog/features/map/presentation/pages/map_view_page.dart';

class AppRouter {
  AppRouter._();

  static final _rootNavigatorKey = GlobalKey<NavigatorState>();

  static GoRouter createRouter(WidgetRef ref) => GoRouter(
        navigatorKey: _rootNavigatorKey,
        initialLocation: '/home',
        // 移除认证重定向，允许访问所有页面
        redirect: (context, state) {
          return null; // 不进行任何重定向
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
            pageBuilder: (context, state) =>
                _slideFromRight(const RegisterPage()),
          ),
          GoRoute(
            path: '/verify-email',
            name: 'verify-email',
            pageBuilder: (context, state) =>
                _slideFromRight(const VerifyEmailPage()),
          ),
          GoRoute(
            path: '/forgot-password',
            name: 'forgot-password',
            pageBuilder: (context, state) =>
                _slideFromRight(const ForgotPasswordPage()),
          ),
          GoRoute(
            path: '/reset-password',
            name: 'reset-password',
            pageBuilder: (context, state) {
              final email = state.extra as String?;
              return _slideFromRight(ResetPasswordPage(email: email));
            },
          ),
          GoRoute(
            path: '/home',
            name: 'home',
            pageBuilder: (context, state) {
              final tabParam = state.uri.queryParameters['tab'];
              final initialTab = tabParam == 'profile' ? 2 : 0;
              return _noTransitionPage(
                HomePage(initialTabIndex: initialTab),
              );
            },
          ),
          GoRoute(
            path: '/map',
            name: 'map',
            pageBuilder: (context, state) {
              final city = state.uri.queryParameters['city'];
              final from = state.uri.queryParameters['from'];
              return _slideFromRight(
                MapViewPage(
                  city: city,
                  fromMyLand: from == 'myland',
                ),
              );
            },
          ),
          GoRoute(
            path: '/trips',
            name: 'trips',
            pageBuilder: (context, state) =>
                _slideFromRight(const TripListPage()),
          ),
          GoRoute(
            path: '/trips/:id',
            name: 'trip-detail',
            pageBuilder: (context, state) {
              final id = state.pathParameters['id']!;
              return _slideFromRight(TripDetailPage(tripId: id));
            },
          ),
          GoRoute(
            path: '/myland',
            name: 'myland',
            pageBuilder: (context, state) {
              final tabParam = state.uri.queryParameters['tab']?.toLowerCase();
              final subTabParam = state.uri.queryParameters['subtab'];
              final cityParam = state.uri.queryParameters['city'];
              final initialTabIndex =
                  (tabParam == 'collections' || tabParam == '1') ? 1 : 0;
              final initialSpotsSubTab =
                  _resolveSpotsSubTab(subTabParam?.toLowerCase());
              return _noTransitionPage(
                MyLandScreen(
                  initialTabIndex: initialTabIndex,
                  initialSpotsSubTab: initialSpotsSubTab,
                  initialCity: cityParam,
                ),
              );
            },
          ),
          GoRoute(
            path: '/recommendation/:id',
            name: 'recommendation-detail',
            pageBuilder: (context, state) {
              final id = state.pathParameters['id']!;
              final name = state.uri.queryParameters['name'] ?? 'Recommendation';
              return _slideFromRight(
                RecommendationDetailPage(
                  recommendationId: id,
                  recommendationName: name,
                ),
              );
            },
          ),
        ],
        errorBuilder: (context, state) => Scaffold(
          body: Center(
            child: Text('Error: ${state.error}'),
          ),
        ),
      );

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

  static int? _resolveSpotsSubTab(String? value) {
    switch (value) {
      case '0':
      case 'all':
        return 0;
      case '1':
      case 'mustgo':
        return 1;
      case '2':
      case "today's plan":
      case 'todays plan':
      case 'todays-plan':
      case 'today':
        return 2;
      case '3':
      case 'visited':
        return 3;
      default:
        return null;
    }
  }

  // Slide transition helper (right -> left for push, left -> right for pop)
  static CustomTransitionPage<void> _slideFromRight(Widget child) =>
      CustomTransitionPage<void>(
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

  static NoTransitionPage<void> _noTransitionPage(Widget child) =>
      NoTransitionPage<void>(child: child);
}
