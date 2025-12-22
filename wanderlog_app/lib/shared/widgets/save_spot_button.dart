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
    required this.isSaved, required this.isMustGo, required this.isTodaysPlan, required this.onSave, required this.onUnsave, required this.onToggleMustGo, required this.onToggleTodaysPlan, super.key,
    this.isLoading = false,
    this.isMustGoLoading = false,
    this.isTodaysPlanLoading = false,
  });

  final bool isSaved;
  final bool isMustGo;
  final bool isTodaysPlan;
  final bool isLoading; // For save/unsave operations only
  final bool isMustGoLoading; // For MustGo toggle only
  final bool isTodaysPlanLoading; // For Today's Plan toggle only
  final SaveSpotCallback onSave;
  final SaveSpotCallback onUnsave;
  final ToggleOptionCallback onToggleMustGo;
  final ToggleOptionCallback onToggleTodaysPlan;

  @override
  State<SaveSpotButton> createState() => _SaveSpotButtonState();
}

class _SaveSpotButtonState extends State<SaveSpotButton> {
  bool _isProcessing = false;

  Future<void> _handleSaveTap() async {
    if (_isProcessing || widget.isLoading) return;
    
    setState(() => _isProcessing = true);
    
    try {
      if (widget.isSaved) {
        await widget.onUnsave();
      } else {
        await widget.onSave();
      }
    } finally {
      if (mounted) {
        setState(() => _isProcessing = false);
      }
    }
  }

  Future<void> _handleMustGoToggle() async {
    if (_isProcessing || widget.isLoading || widget.isMustGoLoading) return;
    
    setState(() => _isProcessing = true);
    try {
      await widget.onToggleMustGo(!widget.isMustGo);
    } finally {
      if (mounted) {
        setState(() => _isProcessing = false);
      }
    }
  }

  Future<void> _handleTodaysPlanToggle() async {
    if (_isProcessing || widget.isLoading || widget.isTodaysPlanLoading) return;
    
    setState(() => _isProcessing = true);
    try {
      await widget.onToggleTodaysPlan(!widget.isTodaysPlan);
    } finally {
      if (mounted) {
        setState(() => _isProcessing = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // Save button only shows loading for save/unsave operations
    final saveButtonLoading = widget.isLoading || (_isProcessing && !widget.isMustGoLoading && !widget.isTodaysPlanLoading);
    // Options panel shows loading for respective operations
    final optionsLoading = widget.isMustGoLoading || widget.isTodaysPlanLoading || _isProcessing;
    
    return Row(
      children: [
        // Left: Save/Unsave circle button
        _buildSaveCircleButton(saveButtonLoading),
        const SizedBox(width: 12),
        // Right: Options panel with MustGo and Today's Plan
        Expanded(child: _buildOptionsPanel(optionsLoading)),
      ],
    );
  }

  Widget _buildSaveCircleButton(bool isLoading) => GestureDetector(
      onTap: _handleSaveTap,
      child: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: widget.isSaved ? AppTheme.primaryYellow : AppTheme.white,
          shape: BoxShape.circle,
          border: Border.all(
            color: AppTheme.black,
            width: 2,
          ),
          boxShadow: AppTheme.cardShadow,
        ),
        child: isLoading
            ? const Padding(
                padding: EdgeInsets.all(12),
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AppTheme.black,
                ),
              )
            : Icon(
                widget.isSaved ? Icons.favorite : Icons.favorite_border,
                color: AppTheme.black,
                size: 24,
              ),
      ),
    );

  Widget _buildOptionsPanel(bool isLoading) => Container(
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
              isLoading: widget.isMustGoLoading || (_isProcessing && !widget.isTodaysPlanLoading),
              isEnabled: widget.isSaved,
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
              isLoading: widget.isTodaysPlanLoading || (_isProcessing && !widget.isMustGoLoading),
              isEnabled: widget.isSaved,
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
    required this.isLoading,
    required this.isEnabled,
    required this.activeColor,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool isChecked;
  final bool isLoading;
  final bool isEnabled;
  final Color activeColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final effectiveOpacity = isEnabled ? 1.0 : 0.4;
    
    return GestureDetector(
      onTap: (isLoading || !isEnabled) ? null : onTap,
      behavior: HitTestBehavior.opaque,
      child: Opacity(
        opacity: effectiveOpacity,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          decoration: BoxDecoration(
            color: isChecked ? activeColor.withOpacity(0.2) : Colors.transparent,
            borderRadius: BorderRadius.circular(AppTheme.radiusSmall - 2),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Checkbox indicator
              AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                width: 20,
                height: 20,
                decoration: BoxDecoration(
                  color: isChecked ? activeColor : Colors.transparent,
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(
                    color: AppTheme.black,
                    width: 2,
                  ),
                ),
                child: isChecked
                    ? const Icon(
                        Icons.check,
                        size: 14,
                        color: AppTheme.black,
                      )
                    : null,
              ),
              const SizedBox(width: 6),
              // Icon
              Icon(
                icon,
                size: 16,
                color: isChecked ? activeColor : AppTheme.mediumGray,
              ),
              const SizedBox(width: 4),
              // Label
              Flexible(
                child: Text(
                  label,
                  style: AppTheme.labelSmall(context).copyWith(
                    color: isChecked ? AppTheme.black : AppTheme.mediumGray,
                    fontWeight: isChecked ? FontWeight.bold : FontWeight.normal,
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
