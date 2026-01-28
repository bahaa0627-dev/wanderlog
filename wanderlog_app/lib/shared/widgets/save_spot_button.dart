import 'package:flutter/material.dart';
import 'package:wanderlog/core/theme/app_theme.dart';

/// Callback with optional MustGo and Today's Plan states
typedef SaveSpotCallback = Future<bool> Function();
typedef ToggleOptionCallback = Future<bool> Function(bool isChecked);

/// Neo Brutalism save button with MustGo/Today's Plan options
/// 
/// Always shows all buttons directly without animation:
/// - Left: Save/Unsave heart button
/// - Right: MustGo and Today's Plan checkboxes
class SaveSpotButton extends StatefulWidget {
  const SaveSpotButton({
    required this.isSaved, required this.isMustGo, required this.isTodaysPlan, required this.onSave, required this.onUnsave, required this.onToggleMustGo, required this.onToggleTodaysPlan, this.isClosed = false, super.key,
  });

  final bool isSaved;
  final bool isMustGo;
  final bool isTodaysPlan;
  final SaveSpotCallback onSave;
  final SaveSpotCallback onUnsave;
  final ToggleOptionCallback onToggleMustGo;
  final ToggleOptionCallback onToggleTodaysPlan;
  /// 地点是否关门 - 关门时 MustGo/Today's Plan 显示置灰样式
  final bool isClosed;

  @override
  State<SaveSpotButton> createState() => _SaveSpotButtonState();
}

class _SaveSpotButtonState extends State<SaveSpotButton> {
  Future<void> _handleSaveTap() async {
    print('🔘🔘🔘 [SaveSpotButton._handleSaveTap] isSaved=${widget.isSaved}');
    if (widget.isSaved) {
      print('🔘🔘🔘 [SaveSpotButton._handleSaveTap] Calling onUnsave');
      await widget.onUnsave();
    } else {
      print('🔘🔘🔘 [SaveSpotButton._handleSaveTap] Calling onSave');
      await widget.onSave();
    }
  }

  Future<void> _handleMustGoToggle() async {
    await widget.onToggleMustGo(!widget.isMustGo);
  }

  Future<void> _handleTodaysPlanToggle() async {
    await widget.onToggleTodaysPlan(!widget.isTodaysPlan);
  }

  @override
  Widget build(BuildContext context) => Row(
      children: [
        // Left: Save/Unsave circle button
        _buildSaveCircleButton(),
        const SizedBox(width: 12),
        // Right: Options panel with MustGo and Today's Plan
        Expanded(child: _buildOptionsPanel()),
      ],
    );

  Widget _buildSaveCircleButton() => GestureDetector(
      onTap: _handleSaveTap,
      child: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: AppTheme.primaryYellow,
          shape: BoxShape.circle,
          border: Border.all(
            color: AppTheme.black,
            width: 2,
          ),
          boxShadow: AppTheme.cardShadow,
        ),
        child: Icon(
          widget.isSaved ? Icons.favorite : Icons.favorite_border,
          color: AppTheme.white,
          size: 24,
        ),
      ),
    );

  Widget _buildOptionsPanel() => Container(
      height: 48,
      decoration: BoxDecoration(
        color: AppTheme.white,
        borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
        border: Border.all(
          color: AppTheme.black,
          width: 2,
        ),
        boxShadow: AppTheme.cardShadow,
      ),
      child: Row(
        children: [
          // MustGo checkbox
          Expanded(
            child: _OptionCheckbox(
              label: 'MustGo',
              icon: Icons.star,
              isChecked: widget.isMustGo,
              isEnabled: widget.isSaved,
              isClosed: widget.isClosed,
              activeColor: AppTheme.primaryYellow,
              onTap: widget.isSaved ? _handleMustGoToggle : null,
            ),
          ),
          // Divider
          Container(
            width: 2,
            height: 28,
            color: AppTheme.black,
          ),
          // Today's Plan checkbox
          Expanded(
            child: _OptionCheckbox(
              label: "Today's Plan",
              icon: Icons.today,
              isChecked: widget.isTodaysPlan,
              isEnabled: widget.isSaved,
              isClosed: widget.isClosed,
              activeColor: AppTheme.accentBlue,
              onTap: widget.isSaved ? _handleTodaysPlanToggle : null,
            ),
          ),
        ],
      ),
    );
}

class _OptionCheckbox extends StatelessWidget {
  const _OptionCheckbox({
    required this.label,
    required this.icon,
    required this.isChecked,
    required this.isEnabled,
    required this.activeColor,
    required this.onTap,
    this.isClosed = false,
  });

  final String label;
  final IconData icon;
  final bool isChecked;
  final bool isEnabled;
  final Color activeColor;
  final VoidCallback? onTap;
  /// 地点是否关门 - 关门时显示置灰样式
  final bool isClosed;

  @override
  Widget build(BuildContext context) {
    final effectiveOpacity = isEnabled ? 1.0 : 0.4;
    
    // 关门时的颜色：未选中浅灰，选中深灰
    final Color closedUncheckedColor = Colors.grey.shade300;
    final Color closedCheckedColor = Colors.grey.shade400;
    
    // 确定 checkbox 的背景色
    Color checkboxColor;
    if (isClosed) {
      checkboxColor = isChecked ? closedCheckedColor : closedUncheckedColor;
    } else {
      checkboxColor = isChecked ? activeColor : Colors.transparent;
    }
    
    // 确定边框颜色
    final Color borderColor = isClosed ? Colors.grey.shade500 : AppTheme.black;
    
    // 确定文字颜色
    final Color textColor = isClosed ? Colors.grey.shade500 : AppTheme.black;
    
    // 确定勾选图标颜色
    final Color checkColor = isClosed ? Colors.grey.shade600 : AppTheme.black;
    
    return GestureDetector(
      onTap: isEnabled ? onTap : null,
      behavior: HitTestBehavior.opaque,
      child: Opacity(
        opacity: effectiveOpacity,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Checkbox indicator - only this changes color
              AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                width: 20,
                height: 20,
                decoration: BoxDecoration(
                  color: checkboxColor,
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(
                    color: borderColor,
                    width: 2,
                  ),
                ),
                child: isChecked
                    ? Icon(
                        Icons.check,
                        size: 14,
                        color: checkColor,
                      )
                    : null,
              ),
              const SizedBox(width: 8),
              // Label - color depends on closed state
              Flexible(
                child: Text(
                  label,
                  style: AppTheme.labelMedium(context).copyWith(
                    color: textColor,
                    fontWeight: FontWeight.w500,
                    fontSize: 14,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
