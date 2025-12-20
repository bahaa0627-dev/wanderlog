import 'package:flutter/material.dart';
import 'package:wanderlog/core/theme/app_theme.dart';

/// Callback with optional MustGo and Today's Plan states
typedef SaveSpotCallback = Future<bool> Function();
typedef ToggleOptionCallback = Future<bool> Function(bool isChecked);

/// Neo Brutalism animated save button with MustGo/Today's Plan options
/// 
/// When saved:
/// - Button shrinks to a circular icon on the left
/// - A panel expands on the right with MustGo and Today's Plan checkboxes
/// 
/// When unsaved:
/// - Button expands back to original state with micro animation
class SaveSpotButton extends StatefulWidget {
  const SaveSpotButton({
    super.key,
    required this.isSaved,
    required this.isMustGo,
    required this.isTodaysPlan,
    required this.onSave,
    required this.onUnsave,
    required this.onToggleMustGo,
    required this.onToggleTodaysPlan,
    this.isLoading = false,
  });

  final bool isSaved;
  final bool isMustGo;
  final bool isTodaysPlan;
  final bool isLoading;
  final SaveSpotCallback onSave;
  final SaveSpotCallback onUnsave;
  final ToggleOptionCallback onToggleMustGo;
  final ToggleOptionCallback onToggleTodaysPlan;

  @override
  State<SaveSpotButton> createState() => _SaveSpotButtonState();
}

class _SaveSpotButtonState extends State<SaveSpotButton>
    with TickerProviderStateMixin {
  late AnimationController _shrinkController;
  late AnimationController _bounceController;
  late Animation<double> _shrinkAnimation;
  late Animation<double> _panelWidthAnimation;
  late Animation<double> _bounceAnimation;

  bool _isProcessing = false;

  @override
  void initState() {
    super.initState();
    
    _shrinkController = AnimationController(
      duration: const Duration(milliseconds: 400),
      vsync: this,
    );
    
    _bounceController = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );
    
    _shrinkAnimation = CurvedAnimation(
      parent: _shrinkController,
      curve: Curves.easeOutBack,
    );
    
    _panelWidthAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _shrinkController,
        curve: const Interval(0.3, 1.0, curve: Curves.easeOutCubic),
      ),
    );
    
    _bounceAnimation = Tween<double>(begin: 0.8, end: 1.0).animate(
      CurvedAnimation(
        parent: _bounceController,
        curve: Curves.elasticOut,
      ),
    );
    
    if (widget.isSaved) {
      _shrinkController.value = 1.0;
    }
  }

  @override
  void didUpdateWidget(SaveSpotButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isSaved != oldWidget.isSaved) {
      if (widget.isSaved) {
        _shrinkController.forward();
      } else {
        _bounceController.forward(from: 0);
        _shrinkController.reverse();
      }
    }
  }

  @override
  void dispose() {
    _shrinkController.dispose();
    _bounceController.dispose();
    super.dispose();
  }

  Future<void> _handleSaveTap() async {
    if (_isProcessing || widget.isLoading) return;
    
    setState(() => _isProcessing = true);
    
    try {
      if (widget.isSaved) {
        final success = await widget.onUnsave();
        if (success && mounted) {
          _bounceController.forward(from: 0);
        }
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
    if (_isProcessing || widget.isLoading) return;
    
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
    if (_isProcessing || widget.isLoading) return;
    
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
    final isLoading = widget.isLoading || _isProcessing;
    
    return AnimatedBuilder(
      animation: Listenable.merge([_shrinkAnimation, _bounceAnimation]),
      builder: (context, child) {
        final shrinkValue = _shrinkAnimation.value;
        final bounceValue = _bounceAnimation.value;
        
        return Row(
          children: [
            // Circular saved button (left side)
            _buildSavedCircleButton(shrinkValue, bounceValue, isLoading),
            
            // Options panel (right side) - appears when saved
            _buildOptionsPanel(shrinkValue, isLoading),
            
            // Full save button - appears when not saved
            _buildFullSaveButton(shrinkValue, bounceValue, isLoading),
          ],
        );
      },
    );
  }

  Widget _buildSavedCircleButton(double shrinkValue, double bounceValue, bool isLoading) {
    if (shrinkValue == 0) return const SizedBox.shrink();
    
    final scale = shrinkValue * bounceValue;
    
    return Transform.scale(
      scale: scale.clamp(0.0, 1.0),
      alignment: Alignment.centerLeft,
      child: Opacity(
        opacity: shrinkValue.clamp(0.0, 1.0),
        child: GestureDetector(
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
            child: isLoading
                ? const Padding(
                    padding: EdgeInsets.all(12),
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppTheme.black,
                    ),
                  )
                : const Icon(
                    Icons.favorite,
                    color: AppTheme.black,
                    size: 24,
                  ),
          ),
        ),
      ),
    );
  }

  Widget _buildOptionsPanel(double shrinkValue, bool isLoading) {
    final panelWidth = _panelWidthAnimation.value;
    if (panelWidth == 0) return const SizedBox.shrink();
    
    return Expanded(
      child: Opacity(
        opacity: panelWidth.clamp(0.0, 1.0),
        child: Transform.translate(
          offset: Offset((1 - panelWidth) * 50, 0),
          child: Padding(
            padding: const EdgeInsets.only(left: 12),
            child: Container(
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
                      isLoading: isLoading,
                      activeColor: AppTheme.primaryYellow,
                      onTap: _handleMustGoToggle,
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
                      isLoading: isLoading,
                      activeColor: AppTheme.accentBlue,
                      onTap: _handleTodaysPlanToggle,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildFullSaveButton(double shrinkValue, double bounceValue, bool isLoading) {
    if (shrinkValue >= 1.0) return const SizedBox.shrink();
    
    final scale = (1 - shrinkValue) * bounceValue;
    
    return Expanded(
      child: Transform.scale(
        scale: scale.clamp(0.0, 1.0),
        alignment: Alignment.center,
        child: Opacity(
          opacity: (1 - shrinkValue).clamp(0.0, 1.0),
          child: GestureDetector(
            onTap: _handleSaveTap,
            child: Container(
              height: 52,
              decoration: BoxDecoration(
                color: AppTheme.primaryYellow,
                borderRadius: BorderRadius.circular(AppTheme.radiusSmall),
                border: Border.all(
                  color: AppTheme.black,
                  width: 2,
                ),
                boxShadow: AppTheme.cardShadow,
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (isLoading)
                    const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppTheme.black,
                      ),
                    )
                  else ...[
                    const Icon(
                      Icons.favorite_border,
                      color: AppTheme.black,
                      size: 22,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Add to Wishlist',
                      style: AppTheme.labelLarge(context).copyWith(
                        color: AppTheme.black,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _OptionCheckbox extends StatelessWidget {
  const _OptionCheckbox({
    required this.label,
    required this.icon,
    required this.isChecked,
    required this.isLoading,
    required this.activeColor,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool isChecked;
  final bool isLoading;
  final Color activeColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: isLoading ? null : onTap,
      behavior: HitTestBehavior.opaque,
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
    );
  }
}

