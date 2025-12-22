import 'package:flutter/foundation.dart';

/// Utilities for evaluating a place's opening hours **in the place's local time**.
///
/// Notes:
/// - Data in this repo is not fully consistent: some `periods[].open.day` use
///   Google convention (Sunday=0), while others use Monday=0 (see seed data).
/// - We support both. If `open_now` exists, we choose the convention that
///   matches it.
/// - We compute "place local now" from UTC + `utc_offset_minutes` and then
///   keep calculations in a "wall-clock UTC" space (DateTime.utc with place
///   local components) so device timezone doesn't affect results.
class OpeningHoursUtils {
  static OpeningHoursEvaluation? evaluate(Map<String, dynamic>? raw) {
    if (raw == null) return null;

    final periods = _parsePeriods(raw['periods']);
    final weekdayText = raw['weekday_text'];

    final hasPeriods = periods != null && periods.isNotEmpty;
    final hasWeekdayText = weekdayText is List && weekdayText.isNotEmpty;
    if (!hasPeriods && !hasWeekdayText) return null;

    final utcOffsetMinutes = _extractUtcOffset(raw);
    final now = _nowWallClockUtc(utcOffsetMinutes);

    // 24/7: single period with open 00:00 and no close
    if (hasPeriods && _is24HoursPeriods(periods!)) {
      return OpeningHoursEvaluation(
        now: now,
        isOpen: true,
        summaryText: 'Open 24 hours',
        closingTime: null,
        nextOpeningTime: null,
        isClosingSoon: false,
      );
    }

    if (hasPeriods) {
      final openNowFlag = raw['open_now'];
      final bool? openNow = openNowFlag is bool ? openNowFlag : null;

      final googleEval = _evaluateFromPeriods(
        periods: periods!,
        now: now,
        numbering: _DayNumbering.sunday0,
      );
      final mondayEval = _evaluateFromPeriods(
        periods: periods,
        now: now,
        numbering: _DayNumbering.monday0,
      );

      OpeningHoursComputation computed;
      if (openNow != null) {
        // Prefer the convention that matches open_now.
        if (googleEval.isOpen == openNow && mondayEval.isOpen != openNow) {
          computed = googleEval;
        } else if (mondayEval.isOpen == openNow &&
            googleEval.isOpen != openNow) {
          computed = mondayEval;
        } else {
          // Tie or both mismatch: default to Google convention.
          computed = googleEval;
        }
      } else {
        computed = googleEval;
      }

      final summary = _formatSummary(now, computed);
      return OpeningHoursEvaluation(
        now: now,
        isOpen: computed.isOpen,
        summaryText: summary,
        closingTime: computed.closingTime,
        nextOpeningTime: computed.nextOpeningTime,
        isClosingSoon: computed.isClosingSoon,
      );
    }

    // Fallback: weekday_text-only
    final weekdayEval = _evaluateFromWeekdayText(
      weekdayText: weekdayText as List,
      now: now,
    );
    return weekdayEval;
  }

  /// Compatibility helper: some call sites want to force a timezone.
  ///
  /// Current implementation still relies on `utc_offset_minutes` embedded in
  /// the openingHours payload (preferred) and will fall back to device time if
  /// absent. The [timezoneId] is accepted to keep call sites stable.
  static OpeningHoursEvaluation? evaluateWithTimezone(
    Map<String, dynamic>? raw,
    String timezoneId,
  ) {
    return evaluate(raw);
  }

  static String _formatSummary(DateTime now, OpeningHoursComputation computed) {
    if (computed.isOpen && computed.closingTime != null) {
      final diff = computed.closingTime!.difference(now);
      if (diff > Duration.zero && diff <= const Duration(hours: 2)) {
        return 'Open, Closes ${_formatClosingCountdown(diff)}, ${_formatTime(computed.closingTime!)}';
      }
      return 'Open, Closes ${_formatTime(computed.closingTime!)}';
    }

    if (!computed.isOpen && computed.nextOpeningTime != null) {
      final timeText = _formatTime(computed.nextOpeningTime!);
      if (_isSameDay(computed.nextOpeningTime!, now) ||
          _isTomorrow(computed.nextOpeningTime!, now)) {
        return 'Closed, Open $timeText';
      }
      return 'Closed, Open ${_weekdayLabel(computed.nextOpeningTime!.weekday)} $timeText';
    }

    return computed.isOpen ? 'Open' : 'Closed';
  }

  static OpeningHoursComputation _evaluateFromPeriods({
    required List<Map<String, dynamic>> periods,
    required DateTime now,
    required _DayNumbering numbering,
  }) {
    bool isOpen = false;
    DateTime? closingTime;
    DateTime? nextOpening;

    for (final period in periods) {
      final openInfo = period['open'];
      if (openInfo is! Map<String, dynamic>) continue;

      final openDay = _normalizeDay(openInfo['day']);
      final openTime = _buildDateTimeForDay(
        reference: now,
        dayIndex: openDay,
        rawTime: openInfo['time'],
        numbering: numbering,
      );
      if (openTime == null) continue;

      final closeInfo = period['close'];
      DateTime? closeTime;
      if (closeInfo is Map<String, dynamic>) {
        final closeDay = _normalizeDay(closeInfo['day']) ?? openDay;
        closeTime = _buildDateTimeForDay(
          reference: now,
          dayIndex: closeDay,
          rawTime: closeInfo['time'],
          numbering: numbering,
        );
      }
      closeTime ??= openTime.add(const Duration(hours: 24));
      if (closeTime.isBefore(openTime)) {
        closeTime = closeTime.add(const Duration(days: 7));
      }

      for (final offset in const [-7, 0, 7]) {
        final start = openTime.add(Duration(days: offset));
        final end = closeTime.add(Duration(days: offset));

        final started = !now.isBefore(start);
        final notEnded = now.isBefore(end);
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

    final isClosingSoon = isOpen &&
        closingTime != null &&
        closingTime!.difference(now) > Duration.zero &&
        closingTime!.difference(now) <= const Duration(hours: 2);

    return OpeningHoursComputation(
      isOpen: isOpen,
      closingTime: closingTime,
      nextOpeningTime: nextOpening,
      isClosingSoon: isClosingSoon,
    );
  }

  static OpeningHoursEvaluation? _evaluateFromWeekdayText({
    required List weekdayText,
    required DateTime now,
  }) {
    if (weekdayText.isEmpty) return null;

    // 24/7 indicators
    for (final item in weekdayText) {
      final text = item?.toString().toLowerCase() ?? '';
      if (text == '7x24' ||
          text == '24/7' ||
          text.contains('open 24 hours') ||
          text.contains('always open')) {
        return OpeningHoursEvaluation(
          now: now,
          isOpen: true,
          summaryText: 'Open 24 hours',
          closingTime: null,
          nextOpeningTime: null,
          isClosingSoon: false,
        );
      }
    }

    // weekday_text: Monday=0 ... Sunday=6 (Google)
    final dartWeekday = now.weekday; // Mon=1..Sun=7
    final index = dartWeekday == 7 ? 6 : dartWeekday - 1;
    if (index < 0 || index >= weekdayText.length) return null;

    final todayText = weekdayText[index]?.toString() ?? '';
    final colonIndex = todayText.indexOf(':');
    if (colonIndex == -1 || colonIndex >= todayText.length - 1) {
      if (todayText.toLowerCase().contains('open 24')) {
        return OpeningHoursEvaluation(
          now: now,
          isOpen: true,
          summaryText: 'Open 24 hours',
          closingTime: null,
          nextOpeningTime: null,
          isClosingSoon: false,
        );
      }
      return null;
    }

    final hours = todayText.substring(colonIndex + 1).trim();
    if (hours.toLowerCase().contains('open 24') || hours == '7x24') {
      return OpeningHoursEvaluation(
        now: now,
        isOpen: true,
        summaryText: 'Open 24 hours',
        closingTime: null,
        nextOpeningTime: null,
        isClosingSoon: false,
      );
    }
    if (hours.toLowerCase() == 'closed') {
      final nextOpenText = _findNextOpeningFromWeekdayText(weekdayText, index);
      return OpeningHoursEvaluation(
        now: now,
        isOpen: false,
        summaryText: nextOpenText == null ? 'Closed' : 'Closed, Open $nextOpenText',
        closingTime: null,
        nextOpeningTime: null,
        isClosingSoon: false,
      );
    }

    // Try to parse "9:00 AM – 5:00 PM" to determine open/closed and next open.
    final parsed = _parseSingleRangeHours(hours);
    if (parsed != null) {
      final currentMinutes = now.hour * 60 + now.minute;
      final openMinutes = parsed.openMinutes;
      final closeMinutes = parsed.closeMinutes <= openMinutes
          ? parsed.closeMinutes + 24 * 60
          : parsed.closeMinutes;
      final currentComparable = currentMinutes < openMinutes
          ? currentMinutes
          : currentMinutes;

      final bool isOpenNow = currentComparable >= openMinutes &&
          currentComparable < closeMinutes;

      if (isOpenNow) {
        final closing = _format12hMinutes(parsed.closeMinutes);
        return OpeningHoursEvaluation(
          now: now,
          isOpen: true,
          summaryText: 'Open, Closes $closing',
          closingTime: null,
          nextOpeningTime: null,
          isClosingSoon: false,
        );
      }

      // Closed: if we haven't reached opening time yet today, show today's opening.
      if (currentMinutes < openMinutes) {
        final opening = _format12hMinutes(openMinutes);
        return OpeningHoursEvaluation(
          now: now,
          isOpen: false,
          summaryText: 'Closed, Open $opening',
          closingTime: null,
          nextOpeningTime: null,
          isClosingSoon: false,
        );
      }

      // Otherwise show next opening from future days.
      // After closing time, search from tomorrow to avoid returning today's
      // already-passed opening time.
      final nextOpenText = _findNextOpeningFromWeekdayText(
        weekdayText,
        (index + 1) % weekdayText.length,
      );
      return OpeningHoursEvaluation(
        now: now,
        isOpen: false,
        summaryText: nextOpenText == null ? 'Closed' : 'Closed, Open $nextOpenText',
        closingTime: null,
        nextOpeningTime: null,
        isClosingSoon: false,
      );
    }

    // If hours format isn't recognized, show raw hours.
    return OpeningHoursEvaluation(
      now: now,
      isOpen: false,
      summaryText: hours,
      closingTime: null,
      nextOpeningTime: null,
      isClosingSoon: false,
    );
  }

  static String? _findNextOpeningFromWeekdayText(List weekdayText, int currentIndex) {
    for (int offset = 0; offset < 7; offset++) {
      final index = (currentIndex + offset) % weekdayText.length;
      final dayText = weekdayText[index]?.toString() ?? '';
      final colonIndex = dayText.indexOf(':');
      if (colonIndex != -1 && colonIndex < dayText.length - 1) {
        final hours = dayText.substring(colonIndex + 1).trim();
        if (hours.toLowerCase() != 'closed' &&
            !hours.toLowerCase().contains('open 24')) {
          final openingMatch = RegExp(
            r'(\d{1,2}):?(\d{2})?\s*(AM|PM)',
            caseSensitive: false,
          ).firstMatch(hours);
          if (openingMatch != null) {
            return _formatTimeFromMatch(openingMatch);
          }
        }
      }
    }
    return null;
  }

  static String _formatTimeFromMatch(RegExpMatch match) {
    final hour = int.parse(match.group(1)!);
    final minute = int.tryParse(match.group(2) ?? '0') ?? 0;
    final period = match.group(3)!.toUpperCase() == 'PM' ? 'p.m' : 'a.m';
    final minuteText = minute == 0 ? '' : ':${minute.toString().padLeft(2, '0')}';
    final hourValue = hour % 12 == 0 ? 12 : hour % 12;
    return '$hourValue$minuteText$period';
  }

  static _ParsedHoursRange? _parseSingleRangeHours(String hours) {
    final match = RegExp(
      r'(\d{1,2}):?(\d{2})?\s*(AM|PM)\s*–\s*(\d{1,2}):?(\d{2})?\s*(AM|PM)',
      caseSensitive: false,
    ).firstMatch(hours);
    if (match == null) return null;

    try {
      final openHour = int.parse(match.group(1)!);
      final openMinute = int.tryParse(match.group(2) ?? '0') ?? 0;
      final openPm = match.group(3)!.toUpperCase() == 'PM';
      final closeHour = int.parse(match.group(4)!);
      final closeMinute = int.tryParse(match.group(5) ?? '0') ?? 0;
      final closePm = match.group(6)!.toUpperCase() == 'PM';

      final openMinutes = _to24hMinutes(openHour, openMinute, isPm: openPm);
      final closeMinutes = _to24hMinutes(closeHour, closeMinute, isPm: closePm);
      return _ParsedHoursRange(openMinutes: openMinutes, closeMinutes: closeMinutes);
    } catch (_) {
      return null;
    }
  }

  static int _to24hMinutes(int hour12, int minute, {required bool isPm}) {
    var h = hour12 % 12;
    if (isPm) h += 12;
    return h * 60 + minute;
  }

  static String _format12hMinutes(int minutes) {
    final m = minutes % (24 * 60);
    final hour24 = m ~/ 60;
    final minute = m % 60;
    final hour12 = hour24 % 12 == 0 ? 12 : hour24 % 12;
    final minuteText = minute == 0 ? '' : ':${minute.toString().padLeft(2, '0')}';
    final period = hour24 >= 12 ? 'p.m' : 'a.m';
    return '$hour12$minuteText$period';
  }

  static bool _is24HoursPeriods(List<Map<String, dynamic>> periods) {
    if (periods.length != 1) return false;
    final period = periods.first;
    final openInfo = period['open'];
    if (openInfo is! Map<String, dynamic>) return false;
    final time = _normalizeTime(openInfo['time']);
    final hasClose = period['close'] != null;
    return time == '0000' && !hasClose;
  }

  static List<Map<String, dynamic>>? _parsePeriods(dynamic value) {
    if (value is! List) return null;
    final list = <Map<String, dynamic>>[];
    for (final entry in value) {
      if (entry is Map<String, dynamic>) list.add(entry);
    }
    return list.isEmpty ? null : list;
  }

  static int? _extractUtcOffset(Map<String, dynamic> value) {
    final candidate = value['utc_offset_minutes'] ?? value['utcOffsetMinutes'];
    if (candidate is int) return candidate;
    if (candidate is String) return int.tryParse(candidate);
    return null;
  }

  static DateTime _nowWallClockUtc(int? offsetMinutes) {
    // Compute place local "wall clock" and store as DateTime.utc to avoid device TZ.
    final utcNow = DateTime.now().toUtc();
    if (offsetMinutes == null) {
      return DateTime.utc(
        utcNow.year,
        utcNow.month,
        utcNow.day,
        utcNow.hour,
        utcNow.minute,
        utcNow.second,
        utcNow.millisecond,
        utcNow.microsecond,
      );
    }
    final local = utcNow.add(Duration(minutes: offsetMinutes));
    return DateTime.utc(
      local.year,
      local.month,
      local.day,
      local.hour,
      local.minute,
      local.second,
      local.millisecond,
      local.microsecond,
    );
  }

  static int? _normalizeDay(dynamic value) {
    if (value is int) return value % 7;
    if (value is String) {
      final parsed = int.tryParse(value);
      return parsed == null ? null : parsed % 7;
    }
    return null;
  }

  static String? _normalizeTime(dynamic value) {
    if (value == null) return null;
    var text = value.toString().replaceAll(':', '');
    if (text.length == 3) text = '0$text';
    if (text.length != 4) return null;
    return text;
  }

  static DateTime? _buildDateTimeForDay({
    required DateTime reference,
    required int? dayIndex,
    required dynamic rawTime,
    required _DayNumbering numbering,
  }) {
    if (dayIndex == null) return null;
    final normalizedTime = _normalizeTime(rawTime);
    if (normalizedTime == null) return null;

    final hours = int.tryParse(normalizedTime.substring(0, 2));
    final minutes = int.tryParse(normalizedTime.substring(2, 4));
    if (hours == null || minutes == null) return null;

    final startOfDay = DateTime.utc(reference.year, reference.month, reference.day);
    final refIndex = numbering == _DayNumbering.sunday0
        ? _toSunday0(reference)
        : _toMonday0(reference);

    var delta = dayIndex - refIndex;
    var candidate = startOfDay.add(Duration(days: delta));
    candidate = candidate.add(Duration(hours: hours, minutes: minutes));
    return candidate;
  }

  static int _toSunday0(DateTime date) {
    // Dart weekday: Mon=1..Sun=7 -> Sunday0: Sun=0, Mon=1..Sat=6
    return date.weekday == 7 ? 0 : date.weekday;
  }

  static int _toMonday0(DateTime date) {
    // Dart weekday: Mon=1..Sun=7 -> Monday0: Mon=0..Sun=6
    return date.weekday - 1;
  }

  static String _weekdayLabel(int weekday) {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var index = weekday - 1;
    if (index < 0 || index >= labels.length) index = 0;
    return labels[index];
  }

  static String _formatTime(DateTime date) {
    final hourValue = date.hour % 12 == 0 ? 12 : date.hour % 12;
    final minuteValue = date.minute;
    final minuteText =
        minuteValue == 0 ? '' : ':${minuteValue.toString().padLeft(2, '0')}';
    final period = date.hour >= 12 ? 'p.m' : 'a.m';
    return '$hourValue$minuteText$period';
  }

  static String _formatClosingCountdown(Duration diff) {
    if (diff >= const Duration(hours: 2)) return 'in 2h';
    if (diff >= const Duration(hours: 1)) return 'in 1h';
    final minutes = diff.inMinutes.clamp(1, 59);
    return 'in ${minutes}mins';
  }

  static bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  static bool _isTomorrow(DateTime target, DateTime reference) {
    final tomorrow = reference.add(const Duration(days: 1));
    return target.year == tomorrow.year &&
        target.month == tomorrow.month &&
        target.day == tomorrow.day;
  }
}

@immutable
class OpeningHoursEvaluation {
  const OpeningHoursEvaluation({
    required this.now,
    required this.isOpen,
    required this.summaryText,
    required this.closingTime,
    required this.nextOpeningTime,
    required this.isClosingSoon,
  });

  final DateTime now;
  final bool isOpen;
  final String summaryText;
  final DateTime? closingTime;
  final DateTime? nextOpeningTime;
  final bool isClosingSoon;
}

@immutable
class OpeningHoursComputation {
  const OpeningHoursComputation({
    required this.isOpen,
    required this.closingTime,
    required this.nextOpeningTime,
    required this.isClosingSoon,
  });

  final bool isOpen;
  final DateTime? closingTime;
  final DateTime? nextOpeningTime;
  final bool isClosingSoon;
}

enum _DayNumbering {
  sunday0,
  monday0,
}

@immutable
class _ParsedHoursRange {
  const _ParsedHoursRange({
    required this.openMinutes,
    required this.closeMinutes,
  });

  final int openMinutes;
  final int closeMinutes;
}


