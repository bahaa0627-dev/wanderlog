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
  /// Evaluate opening hours with optional location context for timezone fallback.
  ///
  /// [raw] - The opening hours data from the API
  /// [country] - Optional country name/code for timezone estimation
  /// [longitude] - Optional longitude for timezone estimation
  static OpeningHoursEvaluation? evaluate(
    Map<String, dynamic>? raw, {
    String? country,
    double? longitude,
  }) {
    if (raw == null) return null;

    final periods = _parsePeriods(raw['periods']);
    final weekdayText = raw['weekday_text'];

    final hasPeriods = periods != null && periods.isNotEmpty;
    final hasWeekdayText = weekdayText is List && weekdayText.isNotEmpty;
    if (!hasPeriods && !hasWeekdayText) return null;

    // Try to get UTC offset from data, then fallback to country, then longitude
    int? utcOffsetMinutes = _extractUtcOffset(raw);
    utcOffsetMinutes ??= getUtcOffsetByCountry(country);
    utcOffsetMinutes ??= estimateUtcOffsetFromLongitude(longitude);

    final now = _nowWallClockUtc(utcOffsetMinutes);

    // 24/7: single period with open 00:00 and no close
    if (hasPeriods && _is24HoursPeriods(periods)) {
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
        periods: periods,
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
  ) =>
      evaluate(raw);

  static String _formatSummary(DateTime now, OpeningHoursComputation computed) {
    if (computed.isOpen && computed.closingTime != null) {
      final diff = computed.closingTime!.difference(now);
      if (diff > Duration.zero && diff < const Duration(hours: 1)) {
        // 不足 1 小时
        final mins = diff.inMinutes.clamp(1, 59);
        return 'Open, ${mins}mins left, Closes ${_formatTime(computed.closingTime!)}';
      }
      if (diff >= const Duration(hours: 1) &&
          diff <= const Duration(hours: 2)) {
        // 1-2 小时
        return 'Open, Closes within 2h, ${_formatTime(computed.closingTime!)}';
      }
      return 'Open, Closes ${_formatTime(computed.closingTime!)}';
    }

    if (!computed.isOpen && computed.nextOpeningTime != null) {
      final timeText = _formatTime(computed.nextOpeningTime!);
      final dayLabel = _weekdayLabel(computed.nextOpeningTime!.weekday);
      // 始终显示星期几
      return 'Closed, Opens $timeText $dayLabel';
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
        closingTime.difference(now) > Duration.zero &&
        closingTime.difference(now) <= const Duration(hours: 2);

    return OpeningHoursComputation(
      isOpen: isOpen,
      closingTime: closingTime,
      nextOpeningTime: nextOpening,
      isClosingSoon: isClosingSoon,
    );
  }

  static OpeningHoursEvaluation? _evaluateFromWeekdayText({
    required List<dynamic> weekdayText,
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

    final hours =
        _sanitizeHoursText(todayText.substring(colonIndex + 1).trim());
    final hoursLower = hours.toLowerCase();
    if (hoursLower.contains('open 24') || hours == '7x24') {
      return OpeningHoursEvaluation(
        now: now,
        isOpen: true,
        summaryText: 'Open 24 hours',
        closingTime: null,
        nextOpeningTime: null,
        isClosingSoon: false,
      );
    }
    if (hoursLower == 'closed') {
      final nextOpenText = _findNextOpeningFromWeekdayText(weekdayText, index);
      return OpeningHoursEvaluation(
        now: now,
        isOpen: false,
        summaryText:
            nextOpenText == null ? 'Closed' : 'Closed, Opens $nextOpenText',
        closingTime: null,
        nextOpeningTime: null,
        isClosingSoon: false,
      );
    }

    // Try to parse "9:00 AM – 5:00 PM" to determine open/closed and next open.
    final parsed = _parseSingleRangeHours(hours);
    if (parsed != null) {
      final currentMinutes =
          now.hour * 60 + now.minute; // Current time in minutes
      final openMinutes = parsed.openMinutes;
      final closeMinutes = parsed.closeMinutes <= openMinutes
          ? parsed.closeMinutes + 24 * 60
          : parsed.closeMinutes;
      // If the business closes after midnight (closeMinutes extended past 24h),
      // map the "after-midnight" current time into the same extended space.
      final currentComparable = currentMinutes < openMinutes
          ? currentMinutes + 24 * 60
          : currentMinutes;

      final bool isOpenNow =
          currentComparable >= openMinutes && currentComparable < closeMinutes;

      if (isOpenNow) {
        final closing = _format12hMinutes(parsed.closeMinutes);
        final minsUntilClose = closeMinutes - currentComparable;
        String summaryText;
        bool isClosingSoon = false;

        if (minsUntilClose < 60) {
          // 不足 1 小时
          summaryText = 'Open, ${minsUntilClose}mins left, Closes $closing';
          isClosingSoon = true;
        } else if (minsUntilClose <= 120) {
          // 1-2 小时
          summaryText = 'Open, Closes within 2h, $closing';
          isClosingSoon = true;
        } else {
          summaryText = 'Open, Closes $closing';
        }

        return OpeningHoursEvaluation(
          now: now,
          isOpen: true,
          summaryText: summaryText,
          closingTime: null,
          nextOpeningTime: null,
          isClosingSoon: isClosingSoon,
        );
      }

      // Closed: if we haven't reached opening time yet today, show today's opening.
      if (currentMinutes < openMinutes) {
        final opening = _format12hMinutes(openMinutes);
        // 获取今天的星期几
        const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        final todayLabel = weekdayLabels[index];
        return OpeningHoursEvaluation(
          now: now,
          isOpen: false,
          summaryText: 'Closed, Opens $opening $todayLabel',
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
        summaryText:
            nextOpenText == null ? 'Closed' : 'Closed, Opens $nextOpenText',
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

  static String _sanitizeHoursText(String input) {
    // Some sources (e.g. AI-generated or loosely-normalized data) can contain
    // stray JSON-like characters or punctuation, e.g. "5:30 to 11PM}".
    // We only strip obvious leading/trailing noise and keep the core text.
    var text = input.trim();
    text = text.replaceAll(RegExp(r'^[\[{(\s]+'), '');
    text = text.replaceAll(RegExp(r'[\]})\s]+$'), '');
    text = text.replaceAll(RegExp(r'\s+'), ' ');
    return text.trim();
  }

  static String? _findNextOpeningFromWeekdayText(
    List<dynamic> weekdayText,
    int startIndex,
  ) {
    // weekday_text 顺序: Monday=0, Tuesday=1, ..., Sunday=6
    const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (int offset = 0; offset < 7; offset++) {
      final index = (startIndex + offset) % weekdayText.length;
      final dayText = weekdayText[index]?.toString() ?? '';
      final colonIndex = dayText.indexOf(':');
      if (colonIndex != -1 && colonIndex < dayText.length - 1) {
        final hours =
            _sanitizeHoursText(dayText.substring(colonIndex + 1).trim());
        final hoursLower = hours.toLowerCase();
        if (hoursLower != 'closed' && !hoursLower.contains('open 24')) {
          final parsed = _parseSingleRangeHours(hours);
          if (parsed != null) {
            final timeText = _format12hMinutes(parsed.openMinutes);
            final dayLabel = weekdayLabels[index];
            return '$timeText $dayLabel';
          }

          // Fallback: try to locate a time with an explicit AM/PM.
          final openingMatch = RegExp(
            r'(\d{1,2}):?(\d{2})?\s*(AM|PM)',
            caseSensitive: false,
          ).firstMatch(hours);
          if (openingMatch != null) {
            final timeText = _formatTimeFromMatch(openingMatch);
            final dayLabel = weekdayLabels[index];
            return '$timeText $dayLabel';
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
    final minuteText =
        minute == 0 ? '' : ':${minute.toString().padLeft(2, '0')}';
    final hourValue = hour % 12 == 0 ? 12 : hour % 12;
    return '$hourValue$minuteText$period';
  }

  static _ParsedHoursRange? _parseSingleRangeHours(String hours) {
    final normalized = _sanitizeHoursText(hours);

    // Support separators: "–" (en-dash), "-", and "to".
    // Also support missing AM/PM on the start time, e.g. "5:30 to 11PM".
    final match = RegExp(
      r'(\d{1,2}):?(\d{2})?\s*(AM|PM)?\s*(?:–|-|to)\s*(\d{1,2}):?(\d{2})?\s*(AM|PM)',
      caseSensitive: false,
    ).firstMatch(normalized);
    if (match == null) return null;

    try {
      final openHour = int.parse(match.group(1)!);
      final openMinute = int.tryParse(match.group(2) ?? '0') ?? 0;
      final startPeriodRaw = match.group(3);
      final closeHour = int.parse(match.group(4)!);
      final closeMinute = int.tryParse(match.group(5) ?? '0') ?? 0;
      final closePm = match.group(6)!.toUpperCase() == 'PM';

      // If the start time doesn't specify AM/PM, assume it matches the end.
      final openPm =
          (startPeriodRaw?.toUpperCase() ?? (closePm ? 'PM' : 'AM')) == 'PM';

      final openMinutes = _to24hMinutes(openHour, openMinute, isPm: openPm);
      final closeMinutes = _to24hMinutes(closeHour, closeMinute, isPm: closePm);
      return _ParsedHoursRange(
          openMinutes: openMinutes, closeMinutes: closeMinutes,);
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
    final minuteText =
        minute == 0 ? '' : ':${minute.toString().padLeft(2, '0')}';
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

  /// 根据经度估算 UTC 偏移（分钟）
  /// 这是一个粗略估算，每 15 度经度约等于 1 小时时差
  /// 用于没有 utc_offset_minutes 数据时的回退方案
  static int? estimateUtcOffsetFromLongitude(double? longitude) {
    if (longitude == null) return null;
    // 每 15 度经度 = 1 小时 = 60 分钟
    // 四舍五入到最近的 30 分钟
    final rawMinutes = (longitude / 15 * 60).round();
    return (rawMinutes / 30).round() * 30;
  }

  /// 根据国家代码获取典型的 UTC 偏移（分钟）
  /// 用于没有 utc_offset_minutes 数据时的回退方案
  static int? getUtcOffsetByCountry(String? country) {
    if (country == null || country.isEmpty) return null;
    final c = country.toLowerCase();
    // 常见国家的典型时区偏移
    const countryOffsets = <String, int>{
      'japan': 540, // UTC+9
      'jp': 540,
      '日本': 540,
      'china': 480, // UTC+8
      'cn': 480,
      '中国': 480,
      'south korea': 540, // UTC+9
      'korea': 540,
      'kr': 540,
      '韩国': 540,
      'taiwan': 480, // UTC+8
      'tw': 480,
      '台湾': 480,
      'singapore': 480, // UTC+8
      'sg': 480,
      'hong kong': 480, // UTC+8
      'hk': 480,
      'thailand': 420, // UTC+7
      'th': 420,
      'vietnam': 420, // UTC+7
      'vn': 420,
      'indonesia': 420, // UTC+7 (WIB)
      'id': 420,
      'malaysia': 480, // UTC+8
      'my': 480,
      'philippines': 480, // UTC+8
      'ph': 480,
      'australia': 600, // UTC+10 (AEST)
      'au': 600,
      'new zealand': 720, // UTC+12
      'nz': 720,
      'india': 330, // UTC+5:30
      'in': 330,
      'united states': -300, // UTC-5 (EST)
      'usa': -300,
      'us': -300,
      'canada': -300, // UTC-5 (EST)
      'ca': -300,
      'united kingdom': 0, // UTC+0
      'uk': 0,
      'gb': 0,
      'france': 60, // UTC+1
      'fr': 60,
      'germany': 60, // UTC+1
      'de': 60,
      'italy': 60, // UTC+1
      'it': 60,
      'spain': 60, // UTC+1
      'es': 60,
      'netherlands': 60, // UTC+1
      'nl': 60,
      'belgium': 60, // UTC+1
      'be': 60,
      'switzerland': 60, // UTC+1
      'ch': 60,
      'austria': 60, // UTC+1
      'at': 60,
      'portugal': 0, // UTC+0
      'pt': 0,
      'greece': 120, // UTC+2
      'gr': 120,
      'turkey': 180, // UTC+3
      'tr': 180,
      'russia': 180, // UTC+3 (Moscow)
      'ru': 180,
      'uae': 240, // UTC+4
      'ae': 240,
      'dubai': 240,
      'brazil': -180, // UTC-3
      'br': -180,
      'mexico': -360, // UTC-6
      'mx': -360,
      'argentina': -180, // UTC-3
      'ar': -180,
    };
    return countryOffsets[c];
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

    final startOfDay =
        DateTime.utc(reference.year, reference.month, reference.day);
    final refIndex = numbering == _DayNumbering.sunday0
        ? _toSunday0(reference)
        : _toMonday0(reference);

    final delta = dayIndex - refIndex;
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

  // ignore: unused_element
  static String _formatClosingCountdown(Duration diff) {
    if (diff >= const Duration(hours: 2)) return 'in 2h';
    if (diff >= const Duration(hours: 1)) return 'in 1h';
    final minutes = diff.inMinutes.clamp(1, 59);
    return 'in ${minutes}mins';
  }

  // ignore: unused_element
  static bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  // ignore: unused_element
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
