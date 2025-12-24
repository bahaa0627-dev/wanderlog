import 'package:flutter/material.dart';
import 'package:wanderlog/core/theme/app_theme.dart';

class CustomToast {
  static void show(
    BuildContext context, {
    required String message,
    required ToastType type,
    Duration duration = const Duration(seconds: 3),
  }) {
    final overlay = Overlay.of(context);
    final overlayEntry = OverlayEntry(
      builder: (context) => _ToastWidget(
        message: message,
        type: type,
        duration: duration,
      ),
    );

    overlay.insert(overlayEntry);

    Future.delayed(duration, () {
      overlayEntry.remove();
    });
  }

  static void showSuccess(BuildContext context, String message) {
    show(context, message: message, type: ToastType.success);
  }

  static void showError(BuildContext context, String message) {
    show(context, message: message, type: ToastType.error);
  }

  static void showInfo(BuildContext context, String message) {
    show(context, message: message, type: ToastType.info);
  }
}

enum ToastType {
  success,
  error,
  info,
}

class _ToastWidget extends StatefulWidget {
  const _ToastWidget({
    required this.message,
    required this.type,
    required this.duration,
  });

  final String message;
  final ToastType type;
  final Duration duration;

  @override
  State<_ToastWidget> createState() => _ToastWidgetState();
}

class _ToastWidgetState extends State<_ToastWidget>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnimation;
  late Animation<Offset> _slideAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );

    _fadeAnimation = CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOut,
    );

    _slideAnimation = Tween<Offset>(
      begin: const Offset(0, 1),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOut,
    ),);

    _controller.forward();

    // Auto dismiss animation
    Future.delayed(
      widget.duration - const Duration(milliseconds: 300),
      () {
        if (mounted) {
          _controller.reverse();
        }
      },
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Color get _backgroundColor {
    return Colors.white;
  }

  Color get _iconColor {
    switch (widget.type) {
      case ToastType.success:
        return const Color(0xFF4CAF50);
      case ToastType.error:
        return AppTheme.error;
      case ToastType.info:
        return AppTheme.accentBlue;
    }
  }

  IconData get _icon {
    switch (widget.type) {
      case ToastType.success:
        return Icons.check_circle;
      case ToastType.error:
        return Icons.error;
      case ToastType.info:
        return Icons.info;
    }
  }

  @override
  Widget build(BuildContext context) => Positioned(
        bottom: MediaQuery.of(context).padding.bottom + 80,
        left: 16,
        right: 16,
        child: FadeTransition(
          opacity: _fadeAnimation,
          child: SlideTransition(
            position: _slideAnimation,
            child: Material(
              color: Colors.transparent,
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 12,
                  ),
                  decoration: BoxDecoration(
                    color: _backgroundColor,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: AppTheme.black,
                      width: 2,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.1),
                        blurRadius: 10,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        _icon,
                        color: _iconColor,
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(
                          widget.message,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            color: AppTheme.black,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
}
