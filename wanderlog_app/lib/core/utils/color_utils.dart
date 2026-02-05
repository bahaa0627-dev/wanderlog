import 'package:flutter/material.dart';
import 'package:palette_generator/palette_generator.dart';

/// 颜色工具类 - 用于图片取色等功能
class ColorUtils {
  ColorUtils._();

  /// 判断颜色是否为浅色（白色或接近白色）
  /// 使用 HSL 亮度值来判断，亮度 > 0.85 认为是浅色
  static bool isLightColor(Color color) {
    final hsl = HSLColor.fromColor(color);
    // 亮度大于 0.85 认为是浅色（白色或接近白色）
    // 同时饱和度较低的高亮度颜色也被认为是浅色
    return hsl.lightness > 0.85 ||
        (hsl.lightness > 0.7 && hsl.saturation < 0.15);
  }

  /// 从 PaletteGenerator 中获取适合作为渐变背景的颜色
  /// 优先使用较深的颜色，排除白色和接近白色的颜色
  ///
  /// 优先级：
  /// 1. dominantColor（如果不是浅色）
  /// 2. darkVibrantColor
  /// 3. darkMutedColor
  /// 4. vibrantColor（如果不是浅色）
  /// 5. mutedColor（如果不是浅色）
  /// 6. 遍历所有颜色找第一个深色
  /// 7. 默认黑色
  static Color getDarkDominantColor(
    PaletteGenerator paletteGenerator, {
    Color fallback = Colors.black,
  }) {
    // 优先使用 dominantColor，但要确保它不是浅色
    final dominantColor = paletteGenerator.dominantColor?.color;
    if (dominantColor != null && !isLightColor(dominantColor)) {
      return dominantColor;
    }

    // 尝试 darkVibrantColor
    final darkVibrant = paletteGenerator.darkVibrantColor?.color;
    if (darkVibrant != null) {
      return darkVibrant;
    }

    // 尝试 darkMutedColor
    final darkMuted = paletteGenerator.darkMutedColor?.color;
    if (darkMuted != null) {
      return darkMuted;
    }

    // 尝试 vibrantColor（如果不是浅色）
    final vibrant = paletteGenerator.vibrantColor?.color;
    if (vibrant != null && !isLightColor(vibrant)) {
      return vibrant;
    }

    // 尝试 mutedColor（如果不是浅色）
    final muted = paletteGenerator.mutedColor?.color;
    if (muted != null && !isLightColor(muted)) {
      return muted;
    }

    // 遍历所有颜色，找第一个非浅色
    for (final paletteColor in paletteGenerator.paletteColors) {
      if (!isLightColor(paletteColor.color)) {
        return paletteColor.color;
      }
    }

    // 所有颜色都是浅色，返回默认值
    return fallback;
  }
}
