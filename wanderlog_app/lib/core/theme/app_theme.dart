import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  // 主题色 - 明亮黄色系列
  static const Color primaryYellow = Color(0xFFFFF200); // 更新为更亮的黄色
  static const Color lightYellow = Color(0xFFFFF4D6);
  static const Color darkYellow = Color(0xFFA29A00);
  
  // 中性色
  static const Color black = Color(0xFF1A1A1A);
  static const Color darkGray = Color(0xFF4A4A4A);
  static const Color mediumGray = Color(0xFF9E9E9E);
  static const Color lightGray = Color(0xFFE0E0E0);
  static const Color background = Color(0xFFFAFAFA);
  static const Color white = Color(0xFFFFFFFF);
  
  // 强调色
  static const Color accentPink = Color(0xFFFF6B9D);
  static const Color accentBlue = Color(0xFF4A90E2);
  static const Color accentGreen = Color(0xFF50C878);
  
  // 文字大小
  static const double textXLarge = 32.0;
  static const double textLarge = 24.0;
  static const double textMedium = 18.0;
  static const double textRegular = 16.0;
  static const double textSmall = 14.0;
  static const double textXSmall = 12.0;
  
  // 圆角
  static const double radiusXLarge = 32.0;
  static const double radiusLarge = 24.0;
  static const double radiusMedium = 16.0;
  static const double radiusSmall = 12.0;
  
  // 边框
  static const double borderThick = 1.0;
  static const double borderMedium = 1.0;
  static const double borderThin = 1.0;
  
  // 阴影
  static List<BoxShadow> cardShadow = [
    BoxShadow(
      color: black.withOpacity(0.1),
      blurRadius: 8,
      offset: const Offset(0, 4),
    ),
  ];
  
  static List<BoxShadow> strongShadow = [
    BoxShadow(
      color: black.withOpacity(0.2),
      blurRadius: 12,
      offset: const Offset(0, 6),
    ),
  ];
  
  // 字体样式
  static TextStyle displayLarge(BuildContext context) => GoogleFonts.nanumPenScript(
    fontSize: textXLarge,
    fontWeight: FontWeight.bold,
    color: black,
    height: 1.2,
  );
  
  static TextStyle displayMedium(BuildContext context) => GoogleFonts.nanumPenScript(
    fontSize: textLarge,
    fontWeight: FontWeight.bold,
    color: black,
    height: 1.3,
  );
  
  static TextStyle headlineLarge(BuildContext context) => GoogleFonts.nanumPenScript(
    fontSize: textLarge,
    fontWeight: FontWeight.w600,
    color: black,
    height: 1.3,
  );
  
  static TextStyle headlineMedium(BuildContext context) => GoogleFonts.nanumPenScript(
    fontSize: 20,
    fontWeight: FontWeight.w600,
    color: black,
    height: 1.3,
  );
  
  static TextStyle bodyLarge(BuildContext context) => GoogleFonts.nanumPenScript(
    fontSize: textMedium,
    fontWeight: FontWeight.normal,
    color: darkGray,
    height: 1.4,
  );
  
  static TextStyle bodyMedium(BuildContext context) => GoogleFonts.nanumPenScript(
    fontSize: textRegular,
    fontWeight: FontWeight.normal,
    color: darkGray,
    height: 1.4,
  );
  
  static TextStyle bodySmall(BuildContext context) => GoogleFonts.nanumPenScript(
    fontSize: textSmall,
    fontWeight: FontWeight.normal,
    color: mediumGray,
    height: 1.4,
  );
  
  static TextStyle labelLarge(BuildContext context) => GoogleFonts.nanumPenScript(
    fontSize: textRegular,
    fontWeight: FontWeight.w600,
    color: black,
    height: 1.2,
  );
  
  static TextStyle labelMedium(BuildContext context) => GoogleFonts.nanumPenScript(
    fontSize: textSmall,
    fontWeight: FontWeight.w600,
    color: darkGray,
    height: 1.2,
  );
  
  static TextStyle labelSmall(BuildContext context) => GoogleFonts.nanumPenScript(
    fontSize: textXSmall,
    fontWeight: FontWeight.normal,
    color: mediumGray,
    height: 1.2,
  );
  
  // 主题数据
  static ThemeData get themeData => ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.light(
      primary: primaryYellow,
      secondary: accentPink,
      surface: white,
      background: background,
      error: Colors.red.shade400,
      onPrimary: black,
      onSecondary: white,
      onSurface: black,
      onBackground: black,
    ),
    scaffoldBackgroundColor: background,
    appBarTheme: AppBarTheme(
      backgroundColor: white,
      elevation: 0,
      iconTheme: const IconThemeData(color: black),
      titleTextStyle: GoogleFonts.nanumPenScript(
        fontSize: textLarge,
        fontWeight: FontWeight.bold,
        color: black,
      ),
    ),
  );
}
