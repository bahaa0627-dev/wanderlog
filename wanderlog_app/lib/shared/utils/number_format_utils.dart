import 'package:intl/intl.dart';

/// 格式化数字，添加千位分隔符
/// 例如: 24547 -> "24,547"
String formatNumberWithCommas(int number) => NumberFormat('#,###').format(number);

/// 格式化评分人数，添加千位分隔符
/// 例如: 24547 -> "(24,547)"
String formatRatingCount(int? count) {
  if (count == null) return '';
  return '(${formatNumberWithCommas(count)})';
}
