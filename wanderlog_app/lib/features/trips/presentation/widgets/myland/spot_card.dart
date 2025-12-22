import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/shared/models/spot_model.dart';
import 'package:wanderlog/shared/utils/opening_hours_utils.dart';

/// 地点卡片组件 - 用于 MyLand 页面展示地点信息
class SpotCard extends StatelessWidget {
  const SpotCard({
    required this.spot,
    required this.isMustGo,
    required this.onToggleMustGo,
    this.onTap,
    super.key,
  });

  final Spot spot;
  final bool isMustGo;
  final VoidCallback onToggleMustGo;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final openingEval = OpeningHoursUtils.evaluate(spot.openingHours);
    final String? openingText = openingEval?.summaryText;
    final bool isClosingSoon = openingEval?.isClosingSoon ?? false;
    final String? priceText = _priceInfoText();
    final String? tagsLine = _tagsLine();

    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: AppTheme.white,
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
          border: Border.all(
            color: AppTheme.black,
            width: AppTheme.borderMedium,
          ),
          boxShadow: AppTheme.cardShadow,
        ),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildCoverImage(),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  spot.name,
                                  style: AppTheme.bodyLarge(context).copyWith(
                                    fontWeight: FontWeight.bold,
                                  ),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                if (spot.rating != null) ...[
                                  const SizedBox(height: 4),
                                  Row(
                                    children: [
                                      const Icon(
                                        Icons.star,
                                        size: 16,
                                        color: AppTheme.primaryYellow,
                                      ),
                                      const SizedBox(width: 4),
                                      Text(
                                        spot.rating!.toStringAsFixed(1),
                                        style: AppTheme.labelMedium(context)
                                            .copyWith(
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                      const SizedBox(width: 4),
                                      Text(
                                        '(1.2k)', // TODO: 从数据源获取评分人数
                                        style: AppTheme.labelSmall(context)
                                            .copyWith(
                                          color: AppTheme.black
                                              .withOpacity(0.6),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          _buildFavoriteButton(),
                        ],
                      ),
                      if (openingText != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                            '🕒 $openingText',
                            style: AppTheme.labelSmall(context).copyWith(
                              fontWeight: FontWeight.w600,
                              color: isClosingSoon 
                                  ? const Color(0xFFE53E3E) // 红色警示
                                  : AppTheme.black,
                            ),
                          ),
                        ),
                      if (priceText != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            '🎫 $priceText',
                            style: AppTheme.labelSmall(context).copyWith(
                              fontWeight: FontWeight.w600,
                              color: AppTheme.black,
                            ),
                          ),
                        ),
                      if (tagsLine != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                            tagsLine,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTheme.labelSmall(context).copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCoverImage() {
    return SizedBox(
      width: 130,
      child: ClipRRect(
        borderRadius: const BorderRadius.horizontal(
          left: Radius.circular(AppTheme.radiusMedium - 2),
        ),
        child: AspectRatio(
          aspectRatio: 3 / 4,
          child: spot.images.isNotEmpty
              ? _buildImageWidget(spot.images.first)
              : _buildPlaceholder(),
        ),
      ),
    );
  }

  /// Build image widget that handles both data URIs and network URLs
  Widget _buildImageWidget(String imageSource) {
    // Handle data URI format (data:image/jpeg;base64,...)
    if (imageSource.startsWith('data:')) {
      try {
        final base64Data = imageSource.split(',').last;
        final bytes = base64Decode(base64Data);
        return Image.memory(
          bytes,
          fit: BoxFit.cover,
          errorBuilder: (context, error, stackTrace) => _buildPlaceholder(),
        );
      } catch (e) {
        return _buildPlaceholder();
      }
    }
    // Handle regular network URLs
    return Image.network(
      imageSource,
      fit: BoxFit.cover,
      errorBuilder: (context, error, stackTrace) => _buildPlaceholder(),
    );
  }

  Widget _buildPlaceholder() {
    return Container(
      color: AppTheme.background,
      child: const Center(
        child: Icon(
          Icons.image_outlined,
          size: 40,
          color: Colors.grey,
        ),
      ),
    );
  }

  Widget _buildFavoriteButton() => GestureDetector(
        onTap: onToggleMustGo,
        child: Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: isMustGo
                ? AppTheme.primaryYellow.withOpacity(0.2)
                : AppTheme.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: AppTheme.black,
              width: AppTheme.borderThin,
            ),
          ),
          child: Icon(
            isMustGo ? Icons.star : Icons.star_outline,
            size: 18,
            color: isMustGo ? AppTheme.primaryYellow : AppTheme.black,
          ),
        ),
      );

  // Opening-hours parsing has been centralized in OpeningHoursUtils.

  /// Fallback: extract today's hours from weekday_text array
  String? _getTodayHoursFromWeekdayText(Map<String, dynamic> raw) {
    final weekdayText = raw['weekday_text'];
    if (weekdayText is! List || weekdayText.isEmpty) {
      return 'Closed';
    }

    // First check for 24/7 indicators in the entire list
    for (final item in weekdayText) {
      final text = item?.toString().toLowerCase() ?? '';
      if (text == '7x24' || 
          text == '24/7' || 
          text.contains('open 24 hours') ||
          text.contains('always open')) {
        return 'Open 24 hours';
      }
    }

    // Get the local time at the place (not device local time!)
    final utcOffsetMinutes = _extractUtcOffset(raw);
    final now = _nowInPlace(utcOffsetMinutes);
    
    // weekday_text is ordered: Monday=0, Tuesday=1, ..., Sunday=6
    // DateTime.weekday is: Monday=1, ..., Sunday=7
    final dartWeekday = now.weekday; // 1=Mon, 7=Sun
    final googleIndex = dartWeekday == 7 ? 6 : dartWeekday - 1; // Convert to 0-6

    if (googleIndex < weekdayText.length) {
      final todayText = weekdayText[googleIndex]?.toString() ?? '';
      // Format: "Monday: 9:00 AM – 5:00 PM" or "Monday: Open 24 hours" or "Monday: Closed"
      final colonIndex = todayText.indexOf(':');
      if (colonIndex != -1 && colonIndex < todayText.length - 1) {
        final hours = todayText.substring(colonIndex + 1).trim();
        if (hours.toLowerCase().contains('open 24') || hours == '7x24') {
          return 'Open 24 hours';
        }
        if (hours.toLowerCase() == 'closed') {
          // Check if we can find next opening time from weekday_text
          final nextOpenText = _findNextOpeningFromWeekdayText(weekdayText, googleIndex);
          if (nextOpenText != null) {
            return 'Closed, Open $nextOpenText';
          }
          return 'Closed';
        }
        // Extract opening and closing times from hours string (e.g., "9:00 AM – 5:00 PM")
        final hoursMatch = RegExp(r'(\d{1,2}):?(\d{2})?\s*(AM|PM)\s*–\s*(\d{1,2}):?(\d{2})?\s*(AM|PM)', caseSensitive: false).firstMatch(hours);
        if (hoursMatch != null) {
          final openTime = hoursMatch.group(1)! + (hoursMatch.group(2) != null ? ':${hoursMatch.group(2)}' : '') + ' ' + hoursMatch.group(3)!;
          final closeTime = hoursMatch.group(4)! + (hoursMatch.group(5) != null ? ':${hoursMatch.group(5)}' : '') + ' ' + hoursMatch.group(6)!;
          
          // Check if currently open
          if (_isCurrentlyOpenFromHours(hours, now)) {
            // Format closing time
            final closingMatch = RegExp(r'(\d{1,2}):?(\d{2})?\s*(AM|PM)', caseSensitive: false).firstMatch(closeTime);
            if (closingMatch != null) {
              return 'Open, Closes ${_formatTimeFromMatch(closingMatch)}';
            }
            return 'Open';
          } else {
            // Closed now, show next opening time
            final openingMatch = RegExp(r'(\d{1,2}):?(\d{2})?\s*(AM|PM)', caseSensitive: false).firstMatch(openTime);
            if (openingMatch != null) {
              // Check if opening is later today or tomorrow
              final openHour = int.parse(openingMatch.group(1)!);
              final openMinute = int.tryParse(openingMatch.group(2) ?? '0') ?? 0;
              final isPm = openingMatch.group(3)!.toUpperCase() == 'PM';
              final openMinutes = _parse12HourTime(openHour, openMinute, isPm);
              final currentMinutes = now.hour * 60 + now.minute;
              
              if (openMinutes > currentMinutes) {
                // Opens later today
                return 'Closed, Open ${_formatTimeFromMatch(openingMatch)}';
              } else {
                // Check next day
                final nextOpenText = _findNextOpeningFromWeekdayText(weekdayText, googleIndex);
                if (nextOpenText != null) {
                  return 'Closed, Open $nextOpenText';
                }
                return 'Closed';
              }
            }
            return 'Closed';
          }
        }
        // If hours format is not recognized, just show the raw text
        return hours;
      }
      // If no colon found but text looks like "Open 24 hours" directly
      if (todayText.toLowerCase().contains('open 24')) {
        return 'Open 24 hours';
      }
    }

    return 'Closed';
  }

  /// Find next opening time from weekday_text array starting from current day
  String? _findNextOpeningFromWeekdayText(List weekdayText, int currentIndex) {
    // Check today and next 7 days
    for (int offset = 0; offset < 7; offset++) {
      final index = (currentIndex + offset) % weekdayText.length;
      final dayText = weekdayText[index]?.toString() ?? '';
      final colonIndex = dayText.indexOf(':');
      if (colonIndex != -1 && colonIndex < dayText.length - 1) {
        final hours = dayText.substring(colonIndex + 1).trim();
        if (hours.toLowerCase() != 'closed' && 
            !hours.toLowerCase().contains('open 24')) {
          // Extract opening time
          final openingMatch = RegExp(r'(\d{1,2}):?(\d{2})?\s*(AM|PM)', caseSensitive: false).firstMatch(hours);
          if (openingMatch != null) {
            if (offset == 0) {
              // Today
              return _formatTimeFromMatch(openingMatch);
            } else if (offset == 1) {
              // Tomorrow - could add "tomorrow" prefix if needed
              return _formatTimeFromMatch(openingMatch);
            }
            // Future day - could add day name if needed
            return _formatTimeFromMatch(openingMatch);
          }
        }
      }
    }
    return null;
  }

  /// Check if currently open based on hours string like "9:00 AM – 5:00 PM"
  bool _isCurrentlyOpenFromHours(String hours, DateTime now) {
    final match = RegExp(r'(\d{1,2}):?(\d{2})?\s*(AM|PM)\s*–\s*(\d{1,2}):?(\d{2})?\s*(AM|PM)', caseSensitive: false).firstMatch(hours);
    if (match == null) return false;
    
    try {
      final openHour = int.parse(match.group(1)!);
      final openMinute = int.tryParse(match.group(2) ?? '0') ?? 0;
      final openPeriod = match.group(3)!.toUpperCase();
      final closeHour = int.parse(match.group(4)!);
      final closeMinute = int.tryParse(match.group(5) ?? '0') ?? 0;
      final closePeriod = match.group(6)!.toUpperCase();

      final openTime = _parse12HourTime(openHour, openMinute, openPeriod == 'PM');
      final closeTime = _parse12HourTime(closeHour, closeMinute, closePeriod == 'PM');
      
      final currentTime = now.hour * 60 + now.minute;
      final openMinutes = openTime;
      final closeMinutes = closeTime < openMinutes ? closeTime + 24 * 60 : closeTime;
      
      return currentTime >= openMinutes && currentTime < closeMinutes;
    } catch (e) {
      return false;
    }
  }

  /// Parse 12-hour time to minutes since midnight
  int _parse12HourTime(int hour, int minute, bool isPm) {
    var h = hour % 12;
    if (isPm && h != 12) h += 12;
    if (!isPm && h == 12) h = 0;
    return h * 60 + minute;
  }

  /// Format time from regex match (e.g., "9:00 AM" -> "9a.m")
  String _formatTimeFromMatch(RegExpMatch match) {
    final hour = int.parse(match.group(1)!);
    final minute = int.tryParse(match.group(2) ?? '0') ?? 0;
    final period = match.group(3)!.toUpperCase();
    
    final hourValue = hour % 12 == 0 ? 12 : hour % 12;
    final minuteText = minute == 0 ? '' : ':${minute.toString().padLeft(2, '0')}';
    final periodText = period == 'PM' ? 'p.m' : 'a.m';
    
    return '$hourValue$minuteText$periodText';
  }

  /// Check if periods indicate a 24/7 place
  /// Google's format for 24/7: single period with open at day 0, time "0000", and no close
  bool _is24HoursPeriods(List<Map<String, dynamic>> periods) {
    if (periods.length != 1) return false;
    
    final period = periods.first;
    final openInfo = period['open'];
    if (openInfo is! Map<String, dynamic>) return false;
    
    // Check if open is at Sunday 0000 and there's no close field
    final day = openInfo['day'];
    final time = openInfo['time']?.toString() ?? '';
    final hasClose = period['close'] != null;
    
    // day == 0 is Sunday, time "0000" is midnight, no close means never closes
    return day == 0 && time == '0000' && !hasClose;
  }

  DateTime? _resolveClosingTime(List<Map<String, dynamic>> periods, DateTime now) {
    for (final rawPeriod in periods) {
      final open = rawPeriod['open'];
      if (open is! Map<String, dynamic>) {
        continue;
      }
      final openDay = _normalizeGoogleDay(open['day']);
      final openTime = _buildDateTimeForGoogleDay(now, openDay, open['time']);
      if (openTime == null) {
        continue;
      }
      final close = rawPeriod['close'];
      DateTime? closeTime;
      if (close is Map<String, dynamic>) {
        final closeDay = _normalizeGoogleDay(close['day']) ?? openDay;
        closeTime = _buildDateTimeForGoogleDay(now, closeDay, close['time']);
      }
      closeTime ??= openTime.add(const Duration(hours: 24));
      if (closeTime.isBefore(openTime)) {
        closeTime = closeTime.add(const Duration(days: 7));
      }
      if (!now.isBefore(openTime) && now.isBefore(closeTime)) {
        return closeTime;
      }
    }
    return null;
  }

  DateTime? _resolveNextOpeningTime(List<Map<String, dynamic>> periods, DateTime now) {
    DateTime? candidate;
    for (final rawPeriod in periods) {
      final open = rawPeriod['open'];
      if (open is! Map<String, dynamic>) {
        continue;
      }
      final openDay = _normalizeGoogleDay(open['day']);
      final openTime = _buildDateTimeForGoogleDay(
        now,
        openDay,
        open['time'],
        futureOnly: true,
      );
      if (openTime == null) {
        continue;
      }
      if (candidate == null || openTime.isBefore(candidate)) {
        candidate = openTime;
      }
    }
    return candidate;
  }

  DateTime? _buildDateTimeForGoogleDay(
    DateTime reference,
    int? googleDay,
    dynamic rawTime, {
    bool futureOnly = false,
  }) {
    if (googleDay == null) {
      return null;
    }
    final normalizedTime = _normalizeTime(rawTime);
    if (normalizedTime == null) {
      return null;
    }
    final hours = int.tryParse(normalizedTime.substring(0, 2));
    final minutes = int.tryParse(normalizedTime.substring(2, 4));
    if (hours == null || minutes == null) {
      return null;
    }
    // Create start of day in local time (not UTC) since we're working with place-local time
    final DateTime startOfDay = DateTime(reference.year, reference.month, reference.day);
    // Convert Dart weekday (1=Mon, 7=Sun) to Google day (0=Sun, 1=Mon, ..., 6=Sat)
    // Dart: Monday=1, Tuesday=2, ..., Sunday=7
    // Google: Sunday=0, Monday=1, ..., Saturday=6
    final currentGoogleDay = reference.weekday == 7 ? 0 : reference.weekday;
    var delta = googleDay - currentGoogleDay;
    var candidate = startOfDay.add(Duration(days: delta));
    candidate = candidate.add(Duration(hours: hours, minutes: minutes));
    if (futureOnly && !candidate.isAfter(reference)) {
      candidate = candidate.add(const Duration(days: 7));
    }
    return candidate;
  }

  int? _normalizeGoogleDay(dynamic value) {
    if (value is int) {
      return value % 7;
    }
    if (value is String) {
      final parsed = int.tryParse(value);
      return parsed == null ? null : parsed % 7;
    }
    return null;
  }

  String? _normalizeTime(dynamic value) {
    if (value == null) {
      return null;
    }
    var text = value.toString().replaceAll(':', '');
    if (text.length == 3) {
      text = '0$text';
    }
    if (text.length != 4) {
      return null;
    }
    return text;
  }

  int? _extractUtcOffset(Map<String, dynamic>? value) {
    if (value == null) {
      return null;
    }
    final candidate = value['utc_offset_minutes'] ?? value['utcOffsetMinutes'];
    if (candidate is int) {
      return candidate;
    }
    if (candidate is String) {
      return int.tryParse(candidate);
    }
    return null;
  }

  DateTime _nowInPlace(int? offsetMinutes) {
    if (offsetMinutes == null) {
      return DateTime.now();
    }
    // Google returns utc_offset_minutes relative to UTC, so adjust from UTC to place-local time.
    // We need to return a local time (isUtc = false) DateTime to match how we build opening hours
    final utcNow = DateTime.now().toUtc();
    final localTime = utcNow.add(Duration(minutes: offsetMinutes));
    // Create a new DateTime in local time (not UTC) with the same values
    return DateTime(
      localTime.year,
      localTime.month,
      localTime.day,
      localTime.hour,
      localTime.minute,
      localTime.second,
      localTime.millisecond,
      localTime.microsecond,
    );
  }

  String _weekdayLabel(int weekday) {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var index = weekday - 1;
    if (index < 0 || index >= labels.length) {
      index = 0;
    }
    return labels[index];
  }

  String _formatTime(DateTime date) {
    final hourValue = date.hour % 12 == 0 ? 12 : date.hour % 12;
    final minuteValue = date.minute;
    final minuteText = minuteValue == 0
        ? ''
        : ':${minuteValue.toString().padLeft(2, '0')}';
    final period = date.hour >= 12 ? 'p.m' : 'a.m';
    return '$hourValue$minuteText$period';
  }

  String _formatClosingCountdown(Duration diff) {
    if (diff >= const Duration(hours: 2)) {
      return 'in 2h';
    }
    if (diff >= const Duration(hours: 1)) {
      return 'in 1h';
    }
    final minutes = diff.inMinutes.clamp(1, 59);
    return 'in ${minutes}mins';
  }

  bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  bool _isTomorrow(DateTime target, DateTime reference) {
    final tomorrow = reference.add(const Duration(days: 1));
    return target.year == tomorrow.year &&
        target.month == tomorrow.month &&
        target.day == tomorrow.day;
  }

  List<Map<String, dynamic>>? _parsePeriods(dynamic value) {
    if (value is! List) {
      return null;
    }
    final list = <Map<String, dynamic>>[];
    for (final entry in value) {
      if (entry is Map<String, dynamic>) {
        list.add(entry);
      }
    }
    return list.isEmpty ? null : list;
  }

  String? _priceInfoText() {
    final price = spot.priceLevel;
    if (price == null || price <= 0) {
      return null;
    }
    return '\$${price * 10}';
  }

  /// Combine category (if present) and tags into a single tag line
  String? _tagsLine() {
    final List<String> allTags = [];
    final Set<String> seen = {};
    
    // Add category first if available
    final category = spot.category?.trim() ?? '';
    if (category.isNotEmpty) {
      allTags.add(category);
      seen.add(category.toLowerCase());
    }
    
    // Add regular tags (which may include AI tags from backend)
    for (final rawTag in spot.tags) {
      final tag = rawTag.trim();
      if (tag.isEmpty) continue;
      final key = tag.toLowerCase();
      if (seen.add(key)) {
        allTags.add(tag);
      }
    }
    
    if (allTags.isEmpty) {
      return null;
    }
    
    final formatted = allTags
        .take(3)
        .map((tag) => '#${tag.replaceAll(RegExp(r'\s+'), '')}')
        .toList();
    
    return formatted.join('   ');
  }
}
