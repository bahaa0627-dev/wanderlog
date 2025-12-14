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
          builder: (context, state) => const RegisterPage(),
        ),
        GoRoute(
          path: '/verify-email',
          name: 'verify-email',
          builder: (context, state) => const VerifyEmailPage(),
        ),
        GoRoute(
          path: '/forgot-password',
          name: 'forgot-password',
          builder: (context, state) => const ForgotPasswordPage(),
        ),
        GoRoute(
          path: '/reset-password',
          name: 'reset-password',
          builder: (context, state) {
            final email = state.extra as String?;
            return ResetPasswordPage(email: email);
          },
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
  static CustomTransitionPage<void> _slideFromRight(Widget child) => CustomTransitionPage<void>(
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

