import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/core/providers/dio_provider.dart';
import 'package:wanderlog/core/theme/app_theme.dart';

/// 添加城市弹窗 - 用于 MyLand 空状态时添加城市
class AddCityDialog extends ConsumerStatefulWidget {
  const AddCityDialog({
    required this.onCitySelected,
    super.key,
  });

  final void Function(String city) onCitySelected;

  @override
  ConsumerState<AddCityDialog> createState() => _AddCityDialogState();
}

class _AddCityDialogState extends ConsumerState<AddCityDialog> {
  final TextEditingController _cityController = TextEditingController();
  String? _selectedCity;
  bool _showError = false;
  List<String> _matchingCities = [];
  bool _isLoading = false;
  Timer? _debounce;
  final Set<String> _cityCatalog = <String>{};

  @override
  void dispose() {
    _debounce?.cancel();
    _cityController.dispose();
    super.dispose();
  }

  void _onCityInputChanged(String value) {
    final trimmed = value.trim();
    _debounce?.cancel();

    if (trimmed.isEmpty) {
      setState(() {
        _selectedCity = null;
        _showError = false;
        _matchingCities = const [];
      });
      return;
    }

    _debounce = Timer(const Duration(milliseconds: 250), () {
      _fetchCities(trimmed);
    });
  }

  Future<void> _fetchCities(String query) async {
    setState(() {
      _isLoading = true;
      _showError = false;
      _selectedCity = null;
    });

    try {
      await _ensureCityCatalog();
      final dio = ref.read(dioProvider);
      final response = await dio.get<Map<String, dynamic>>(
        'public-places/search',
        queryParameters: {'q': query},
      );

      final results = response.data?['data'] as List<dynamic>? ?? const [];
      final lowerQuery = query.toLowerCase();
      final citySet = <String>{};

      for (final item in results) {
        if (item is Map) {
          final cityValue = item['city'];
          final city = cityValue?.toString();
          if (city != null && city.isNotEmpty) {
            citySet.add(city);
          }
        }
      }

      _cityCatalog.addAll(citySet);
      final allCities = {..._cityCatalog};
      final sortedCities = allCities.toList()
        ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
      final matches = _rankedCityMatches(sortedCities, lowerQuery);

      final exactMatch = matches.firstWhere(
        (city) => city.toLowerCase() == lowerQuery,
        orElse: () => '',
      );

      setState(() {
        _matchingCities = matches;
        _selectedCity = exactMatch.isNotEmpty ? exactMatch : null;
        _showError = matches.isEmpty && query.length >= 2;
        _isLoading = false;
      });
    } catch (error) {
      setState(() {
        _matchingCities = const [];
        _selectedCity = null;
        _showError = query.length >= 2;
        _isLoading = false;
      });
    }
  }

  void _handleGo() {
    final city = _selectedCity;
    if (city == null) {
      return;
    }
    Navigator.of(context).pop();
    widget.onCitySelected(city);
  }

  Future<void> _ensureCityCatalog() async {
    if (_cityCatalog.isNotEmpty) {
      return;
    }
    try {
      final dio = ref.read(dioProvider);
      final response = await dio.get<Map<String, dynamic>>(
        'public-places',
        queryParameters: {'limit': 500, 'page': 1},
      );
      final data = response.data?['data'] as List<dynamic>? ?? const [];
      for (final item in data) {
        if (item is Map) {
          final city = item['city']?.toString();
          if (city != null && city.isNotEmpty) {
            _cityCatalog.add(city);
          }
        }
      }
    } catch (_) {
      // ignore catalog failures and rely on search results only
    }
  }

  List<String> _rankedCityMatches(List<String> cities, String lowerQuery) {
    if (lowerQuery.isEmpty) {
      return cities;
    }
    final matches = <String>[];
    for (final city in cities) {
      if (city.toLowerCase().startsWith(lowerQuery)) {
        matches.add(city);
      }
    }
    return matches;
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
                    'Add Trip',
                    style: AppTheme.headlineMedium(context).copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),

            // 输入框 + 内嵌 Go
            TextField(
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
                suffixIconConstraints: const BoxConstraints(
                  minWidth: 0,
                  minHeight: 0,
                ),
                suffixIcon: Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      AnimatedOpacity(
                        duration: const Duration(milliseconds: 200),
                        opacity: _isLoading ? 1 : 0,
                        curve: Curves.easeInOut,
                        child: _isLoading
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const SizedBox(width: 16, height: 16),
                      ),
                      const SizedBox(width: 8),
                      AnimatedOpacity(
                        duration: const Duration(milliseconds: 200),
                        opacity: _selectedCity != null ? 1 : 0,
                        curve: Curves.easeInOut,
                        child: IgnorePointer(
                          ignoring: _selectedCity == null,
                          child: GestureDetector(
                            onTap: _handleGo,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 10,
                              ),
                              decoration: BoxDecoration(
                                color: AppTheme.primaryYellow,
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: AppTheme.black,
                                  width: AppTheme.borderMedium,
                                ),
                              ),
                              child: Text(
                                '>go',
                                style: AppTheme.labelLarge(context).copyWith(
                                  fontWeight: FontWeight.bold,
                                  color: AppTheme.black,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),

            const SizedBox(height: 12),

            if (_matchingCities.isNotEmpty && _selectedCity == null) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _matchingCities.map((city) {
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

          ],
        ),
      ),
    );
  }
}
