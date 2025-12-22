import 'package:flutter/material.dart';

class AppTheme {
    // 自定义灰色和文字色
    static const Color markerGray = Color(0xFFCCCCCC); // #cccccc
    static const Color markerLabelGray = Color(0xFF8D8D8D); // #8d8d8d
  // 主题色 - 明亮黄色系列
  static const Color primaryYellow = Color(0xFFFFF200); // 用于实心按钮、tab、标签等
  static const Color borderYellow = Color(0xFFC7BD00); // 用于边框和文字按钮
  static const Color lightYellow = Color(0xFFFFF4D6);
  static const Color darkYellow = Color(0xFF8E8600);
  
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
  
  // 阴影 - Neo Brutalism 风格
  static List<BoxShadow> cardShadow = [
    const BoxShadow(
      color: Color(0xFF000000),
      offset: Offset(2, 3),
      blurRadius: 0,
      spreadRadius: 0,
    ),
  ];
  
  static List<BoxShadow> searchBoxShadow = [
    const BoxShadow(
      color: Color(0xFF000000),
      offset: Offset(1, 2),
      blurRadius: 0,
      spreadRadius: 0,
    ),
  ];
  
  static List<BoxShadow> strongShadow = [
    const BoxShadow(
      color: Color(0xFF000000),
      offset: Offset(2, 4),
      blurRadius: 0,
      spreadRadius: 0,
    ),
  ];

  // 兼容旧代码：用于 const Widget 里
  static const Color textSecondary = mediumGray;
  static const Color border = lightGray;
  static const Color error = Color(0xFFEF5350); // 接近 red400
  static TextStyle titleMedium(BuildContext context) => labelLarge(context);
  
  
  // 字体样式
  static TextStyle displayLarge(BuildContext context) => const TextStyle(
    fontFamily: 'ReemKufi',
    fontSize: textXLarge,
    fontWeight: FontWeight.bold,
    color: black,
    height: 1.2,
  );
  
  static TextStyle displayMedium(BuildContext context) => const TextStyle(
    fontFamily: 'ReemKufi',
    fontSize: textLarge,
    fontWeight: FontWeight.bold,
    color: black,
    height: 1.3,
  );
  
  static TextStyle headlineLarge(BuildContext context) => const TextStyle(
    fontFamily: 'ReemKufi',
    fontSize: textLarge,
    fontWeight: FontWeight.w600,
    color: black,
    height: 1.3,
  );
  
  static TextStyle headlineMedium(BuildContext context) => const TextStyle(
    fontFamily: 'ReemKufi',
    fontSize: 20,
    fontWeight: FontWeight.w600,
    color: black,
    height: 1.3,
  );
  
  static TextStyle bodyLarge(BuildContext context) => const TextStyle(
    fontFamily: 'ReemKufi',
    fontSize: textMedium,
    fontWeight: FontWeight.normal,
    color: darkGray,
    height: 1.4,
  );
  
  static TextStyle bodyMedium(BuildContext context) => const TextStyle(
    fontFamily: 'ReemKufi',
    fontSize: textRegular,
    fontWeight: FontWeight.normal,
    color: darkGray,
    height: 1.4,
  );
  
  static TextStyle bodySmall(BuildContext context) => const TextStyle(
    fontFamily: 'ReemKufi',
    fontSize: textSmall,
    fontWeight: FontWeight.normal,
    color: mediumGray,
    height: 1.4,
  );
  
  static TextStyle labelLarge(BuildContext context) => const TextStyle(
    fontFamily: 'ReemKufi',
    fontSize: textRegular,
    fontWeight: FontWeight.w600,
    color: black,
    height: 1.2,
  );
  
  static TextStyle labelMedium(BuildContext context) => const TextStyle(
    fontFamily: 'ReemKufi',
    fontSize: textSmall,
    fontWeight: FontWeight.w600,
    color: darkGray,
    height: 1.2,
  );
  
  static TextStyle labelSmall(BuildContext context) => const TextStyle(
    fontFamily: 'ReemKufi',
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
      error: Colors.red.shade400,
      onPrimary: black,
      onSecondary: white,
      onSurface: black,
    ),
    scaffoldBackgroundColor: background,
    appBarTheme: const AppBarTheme(
      backgroundColor: white,
      elevation: 0,
      iconTheme: IconThemeData(color: black),
      titleTextStyle: TextStyle(
        fontFamily: 'ReemKufi',
        fontSize: textLarge,
        fontWeight: FontWeight.bold,
        color: black,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: borderYellow, // 文字按钮使用暗黄色
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: primaryYellow, // 实心按钮使用亮黄色
        foregroundColor: black,
      ),
    ),
  );
}
