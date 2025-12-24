import 'package:flutter/material.dart';

class DialogUtils {
  static Future<bool> showConfirmDialog({
    required BuildContext context,
    required String title,
    required String message,
    String confirmText = '确认',
    String cancelText = '取消',
    bool isDestructive = false,
  }) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(cancelText),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: isDestructive
                ? FilledButton.styleFrom(
                    backgroundColor: Colors.red,
                  )
                : null,
            child: Text(confirmText),
          ),
        ],
      ),
    );
    return result ?? false;
  }

  /// 统一的白底黑框 Toast 样式
  static SnackBar _buildSnackBar(String message, {IconData? icon}) {
    return SnackBar(
      content: Row(
        children: [
          if (icon != null) ...[
            Icon(icon, color: Colors.black87, size: 20),
            const SizedBox(width: 10),
          ],
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                color: Colors.black87,
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
      backgroundColor: Colors.white,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: const BorderSide(color: Colors.black87, width: 1.5),
      ),
      elevation: 0,
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    );
  }

  static void showSuccessSnackBar(BuildContext context, String message) {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      _buildSnackBar(message, icon: Icons.check_circle_outline),
    );
  }

  static void showErrorSnackBar(BuildContext context, String message) {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      _buildSnackBar(message, icon: Icons.error_outline),
    );
  }

  static void showInfoSnackBar(BuildContext context, String message) {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      _buildSnackBar(message, icon: Icons.info_outline),
    );
  }

  /// 通用 Toast 方法（无图标）
  static void showToast(BuildContext context, String message) {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      _buildSnackBar(message),
    );
  }
}






