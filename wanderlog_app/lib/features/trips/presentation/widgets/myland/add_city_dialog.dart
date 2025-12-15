import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/core/theme/app_theme.dart';

/// 添加城市弹窗 - 用于 MyLand 空状态时添加城市
class AddCityDialog extends ConsumerStatefulWidget {
  const AddCityDialog({
    required this.availableCities,
    required this.onCitySelected,
    super.key,
  });

  final List<String> availableCities;
  final void Function(String city) onCitySelected;

  @override
  ConsumerState<AddCityDialog> createState() => _AddCityDialogState();
}

class _AddCityDialogState extends ConsumerState<AddCityDialog> {
  final TextEditingController _cityController = TextEditingController();
  String? _selectedCity;
  bool _showError = false;

  @override
  void dispose() {
    _cityController.dispose();
    super.dispose();
  }

  void _onCityInputChanged(String value) {
    final input = value.trim().toLowerCase();
    
    if (input.isEmpty) {
      setState(() {
        _selectedCity = null;
        _showError = false;
      });
      return;
    }

    // 查找匹配的城市（不区分大小写）
    final matchingCity = widget.availableCities.firstWhere(
      (city) => city.toLowerCase() == input,
      orElse: () => '',
    );

    setState(() {
      if (matchingCity.isNotEmpty) {
        _selectedCity = matchingCity;
        _showError = false;
      } else {
        _selectedCity = null;
        _showError = true;
      }
    });
  }

  void _handleGo() {
    if (_selectedCity != null) {
      widget.onCitySelected(_selectedCity!);
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: AppTheme.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
        side: const BorderSide(
          color: AppTheme.black,
          width: AppTheme.borderMedium,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // 标题
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryYellow,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: AppTheme.black,
                      width: AppTheme.borderMedium,
                    ),
                  ),
                  child: const Icon(
                    Icons.add_location_alt_outlined,
                    size: 24,
                    color: AppTheme.black,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Add City',
                    style: AppTheme.headlineMedium(context).copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),

            // 输入框
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _cityController,
                    onChanged: _onCityInputChanged,
                    decoration: InputDecoration(
                      hintText: 'Enter city name...',
                      hintStyle: AppTheme.bodyMedium(context).copyWith(
                        color: AppTheme.black.withOpacity(0.4),
                      ),
                      filled: true,
                      fillColor: AppTheme.background,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 14,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(
                          color: AppTheme.black,
                          width: AppTheme.borderMedium,
                        ),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(
                          color: AppTheme.black,
                          width: AppTheme.borderMedium,
                        ),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(
                          color: AppTheme.black,
                          width: AppTheme.borderMedium,
                        ),
                      ),
                    ),
                  ),
                ),
                
                // Go 按钮
                const SizedBox(width: 12),
                GestureDetector(
                  onTap: _selectedCity != null ? _handleGo : null,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 14,
                    ),
                    decoration: BoxDecoration(
                      color: _selectedCity != null
                          ? AppTheme.primaryYellow
                          : AppTheme.background,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: AppTheme.black,
                        width: AppTheme.borderMedium,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'go',
                          style: AppTheme.labelLarge(context).copyWith(
                            fontWeight: FontWeight.bold,
                            color: _selectedCity != null
                                ? AppTheme.black
                                : AppTheme.black.withOpacity(0.4),
                          ),
                        ),
                        const SizedBox(width: 4),
                        Icon(
                          Icons.arrow_forward,
                          size: 18,
                          color: _selectedCity != null
                              ? AppTheme.black
                              : AppTheme.black.withOpacity(0.4),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),

            // 错误提示
            if (_showError) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: Colors.red,
                    width: AppTheme.borderThin,
                  ),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.info_outline,
                      size: 16,
                      color: Colors.red,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        "sorry, we don't have spots from this city yet",
                        style: AppTheme.labelMedium(context).copyWith(
                          color: Colors.red,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            // 可用城市提示
            if (_cityController.text.isEmpty) ...[
              const SizedBox(height: 16),
              Text(
                'Available cities:',
                style: AppTheme.labelSmall(context).copyWith(
                  color: AppTheme.black.withOpacity(0.6),
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: widget.availableCities.take(6).map((city) {
                  return GestureDetector(
                    onTap: () {
                      _cityController.text = city;
                      _onCityInputChanged(city);
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: AppTheme.primaryYellow.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: AppTheme.black,
                          width: AppTheme.borderThin,
                        ),
                      ),
                      child: Text(
                        city,
                        style: AppTheme.labelSmall(context),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
