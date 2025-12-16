import 'package:flutter/material.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/shared/models/spot_model.dart';

/// 地点卡片组件 - 用于 MyLand 页面展示地点信息
class SpotCard extends StatelessWidget {
  const SpotCard({
    required this.spot,
    required this.onCheckIn,
    required this.isMustGo,
    required this.onToggleMustGo,
    super.key,
  });

  final Spot spot;
  final VoidCallback onCheckIn;
  final bool isMustGo;
  final VoidCallback onToggleMustGo;

  @override
  Widget build(BuildContext context) {
    // 是否已打卡（临时用 tag 标记，后续替换为真实字段）
    final bool isCheckedIn = spot.tags.any(
      (tag) => tag.toLowerCase() == 'visited',
    );
    final String? openingText = _openingInfoText();
    final bool isClosingSoon = _isClosingSoon();
    final String? priceText = _priceInfoText();
    final String? tagsLine = _tagsLine();

    return GestureDetector(
      onTap: () {
        // TODO: 导航到地点详情页
      },
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
                      const Spacer(),
                      Align(
                        alignment: Alignment.bottomRight,
                        child: GestureDetector(
                          onTap: isCheckedIn ? null : onCheckIn,
                          child: AnimatedOpacity(
                            duration: const Duration(milliseconds: 150),
                            opacity: isCheckedIn ? 0.45 : 1,
                            child: Container(
                              width: 48,
                              height: 48,
                              decoration: BoxDecoration(
                                color: isCheckedIn
                                    ? AppTheme.background
                                    : AppTheme.primaryYellow,
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: AppTheme.black,
                                  width: AppTheme.borderMedium,
                                ),
                                boxShadow: isCheckedIn
                                    ? null
                                    : [
                                        BoxShadow(
                                          color: AppTheme.black
                                              .withOpacity(0.15),
                                          offset: const Offset(0, 4),
                                          blurRadius: 12,
                                        ),
                                      ],
                              ),
                              child: Icon(
                                Icons.check,
                                color: AppTheme.black,
                                size: 22,
                              ),
                            ),
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
              ? Image.network(
                  spot.images.first,
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) =>
                      _buildPlaceholder(),
                )
              : _buildPlaceholder(),
        ),
      ),
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
    final utcOffsetMinutes = _extractUtcOffset(raw);
    final List<Map<String, dynamic>>? periods = _parsePeriods(raw?['periods']);
    if (periods == null) {
      return 'Hours unavailable';
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

  String? _tagsLine() {
    if (spot.tags.isEmpty) {
      return null;
    }
    final tags = spot.tags
        .map((tag) => tag.trim())
        .where((tag) => tag.isNotEmpty)
        .map((tag) => '#${tag.replaceAll(RegExp(r'\s+'), '')}')
        .take(3)
        .toList();
    if (tags.isEmpty) {
      return null;
    }
    return tags.join('   ');
  }
}
