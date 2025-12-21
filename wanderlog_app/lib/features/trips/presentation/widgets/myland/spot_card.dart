import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/shared/models/spot_model.dart';

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
    final String? openingText = _openingInfoText();
    final bool isClosingSoon = _isClosingSoon();
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

  String? _openingInfoText() {
    final raw = spot.openingHours;
    if (raw == null) {
      return 'Hours unavailable';
    }
    
    final utcOffsetMinutes = _extractUtcOffset(raw);
    final List<Map<String, dynamic>>? periods = _parsePeriods(raw['periods']);
    
    // If no periods data, try to use weekday_text as fallback
    if (periods == null || periods.isEmpty) {
      return _getTodayHoursFromWeekdayText(raw);
    }
    
    // Check for 24/7 places: single period with open at day 0, time 0000, and no close
    if (_is24HoursPeriods(periods)) {
      return 'Open 24 hours';
    }

    final DateTime now = _nowInPlace(utcOffsetMinutes);
    bool isOpen = false;
    DateTime? closingTime;
    DateTime? nextOpening;

    for (final period in periods) {
      final openInfo = period['open'];
      if (openInfo is! Map<String, dynamic>) {
        continue;
      }
      final openDay = _normalizeGoogleDay(openInfo['day']);
      final openTime = _buildDateTimeForGoogleDay(now, openDay, openInfo['time']);
      if (openTime == null) {
        continue;
      }
      final closeInfo = period['close'];
      DateTime? closeTime;
      if (closeInfo is Map<String, dynamic>) {
        final closeDay = _normalizeGoogleDay(closeInfo['day']) ?? openDay;
        closeTime = _buildDateTimeForGoogleDay(now, closeDay, closeInfo['time']);
      }
      closeTime ??= openTime.add(const Duration(hours: 24));
      if (closeTime.isBefore(openTime)) {
        closeTime = closeTime.add(const Duration(days: 7));
      }

      for (final offset in [-7, 0, 7]) {
        final start = openTime.add(Duration(days: offset));
        final end = closeTime.add(Duration(days: offset));

        final bool started = !now.isBefore(start);
        final bool notEnded = now.isBefore(end);
        if (!isOpen && started && notEnded) {
          isOpen = true;
          closingTime = end;
        }
        if (start.isAfter(now)) {
          if (nextOpening == null || start.isBefore(nextOpening)) {
            nextOpening = start;
          }
        }
      }
    }

    if (isOpen && closingTime != null) {
      final diff = closingTime.difference(now);
      if (diff > Duration.zero && diff <= const Duration(hours: 2)) {
        return 'Open, Closes ${_formatClosingCountdown(diff)}, ${_formatTime(closingTime)}';
      }
      return 'Open, Closes ${_formatTime(closingTime)}';
    }

    if (nextOpening != null) {
      final timeText = _formatTime(nextOpening);
      if (_isSameDay(nextOpening, now) || _isTomorrow(nextOpening, now)) {
        return 'Closed, Open $timeText';
      }
      return 'Closed, Open ${_weekdayLabel(nextOpening.weekday)} $timeText';
    }

    return 'Hours unavailable';
  }

  bool _isClosingSoon() {
    final raw = spot.openingHours;
    final utcOffsetMinutes = _extractUtcOffset(raw);
    final List<Map<String, dynamic>>? periods = _parsePeriods(raw?['periods']);
    if (periods == null) {
      return false;
    }
    
    // 24/7 places never close
    if (_is24HoursPeriods(periods)) {
      return false;
    }

    final DateTime now = _nowInPlace(utcOffsetMinutes);
    DateTime? closingTime;

    for (final period in periods) {
      final openInfo = period['open'];
      if (openInfo is! Map<String, dynamic>) {
        continue;
      }
      final openDay = _normalizeGoogleDay(openInfo['day']);
      final openTime = _buildDateTimeForGoogleDay(now, openDay, openInfo['time']);
      if (openTime == null) {
        continue;
      }
      final closeInfo = period['close'];
      DateTime? closeTime;
      if (closeInfo is Map<String, dynamic>) {
        final closeDay = _normalizeGoogleDay(closeInfo['day']) ?? openDay;
        closeTime = _buildDateTimeForGoogleDay(now, closeDay, closeInfo['time']);
      }
      closeTime ??= openTime.add(const Duration(hours: 24));
      if (closeTime.isBefore(openTime)) {
        closeTime = closeTime.add(const Duration(days: 7));
      }

      for (final offset in [-7, 0, 7]) {
        final start = openTime.add(Duration(days: offset));
        final end = closeTime.add(Duration(days: offset));

        final bool started = !now.isBefore(start);
        final bool notEnded = now.isBefore(end);
        if (started && notEnded) {
          closingTime = end;
          break;
        }
      }
      if (closingTime != null) {
        break;
      }
    }

    if (closingTime != null) {
      final diff = closingTime.difference(now);
      return diff > Duration.zero && diff <= const Duration(hours: 2);
    }

    return false;
  }

  /// Fallback: extract today's hours from weekday_text array
  String? _getTodayHoursFromWeekdayText(Map<String, dynamic> raw) {
    final weekdayText = raw['weekday_text'];
    if (weekdayText is! List || weekdayText.isEmpty) {
      return 'Hours unavailable';
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

    // weekday_text is ordered: Monday=0, Tuesday=1, ..., Sunday=6
    // DateTime.weekday is: Monday=1, ..., Sunday=7
    final now = DateTime.now();
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
          return 'Closed today';
        }
        return hours;
      }
      // If no colon found but text looks like "Open 24 hours" directly
      if (todayText.toLowerCase().contains('open 24')) {
        return 'Open 24 hours';
      }
    }

    return 'Hours unavailable';
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
    final DateTime startOfDay = reference.isUtc
        ? DateTime.utc(reference.year, reference.month, reference.day)
        : DateTime(reference.year, reference.month, reference.day);
    final currentGoogleDay = reference.weekday % 7;
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
    return DateTime.now().toUtc().add(Duration(minutes: offsetMinutes));
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
