// ══════════════════════════════════════════════════════════════════
// هوية فلسي البصرية — نفس ألوان الموقع
//   أخضر المريمية sage-700 #4F7360 (أساسي)، فيروزي الشعار #3CBEA4،
//   خلفية بيج #F4F1EA، نص فحمي #2C3E50 — وخط Cairo المحلي
// ══════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';

class Brand {
  static const sage = Color(0xFF4F7360);
  static const sageDark = Color(0xFF3A5747);
  static const sage50 = Color(0xFFF3F7F4);
  static const sage100 = Color(0xFFE6EFE9);
  static const teal = Color(0xFF3CBEA4);
  static const beige = Color(0xFFF4F1EA);
  static const ink = Color(0xFF2C3E50);
  static const muted = Color(0xFF6B7785);
  static const border = Color(0xFFE4DED2);
  static const peach = Color(0xFFD98880);
  static const success = Color(0xFF2E8B57);
  static const warning = Color(0xFFC77C0E);
  static const danger = Color(0xFFC0392B);
  static const info = Color(0xFF2E86C1);

  // الوضع الليلي
  static const darkBg = Color(0xFF0E1513);
  static const darkSurface = Color(0xFF151F1C);
  static const darkBorder = Color(0xFF26332F);
  static const darkInk = Color(0xFFE7ECEF);
  static const sageLight = Color(0xFF8DB59B);
}

const _fontFallback = ['SaudiRiyal'];

ThemeData buildTheme(Brightness b) {
  final dark = b == Brightness.dark;
  final scheme = ColorScheme(
    brightness: b,
    primary: dark ? Brand.sageLight : Brand.sage,
    onPrimary: Colors.white,
    primaryContainer: dark ? const Color(0xFF233A2F) : Brand.sage100,
    onPrimaryContainer: dark ? Brand.darkInk : Brand.sageDark,
    secondary: Brand.teal,
    onSecondary: Colors.white,
    secondaryContainer: dark ? const Color(0xFF173A33) : const Color(0xFFDDF4EE),
    onSecondaryContainer: dark ? Brand.darkInk : const Color(0xFF0F5547),
    tertiary: Brand.peach,
    onTertiary: Colors.white,
    error: Brand.danger,
    onError: Colors.white,
    surface: dark ? Brand.darkSurface : Colors.white,
    onSurface: dark ? Brand.darkInk : Brand.ink,
    onSurfaceVariant: dark ? const Color(0xFF9AA6AE) : Brand.muted,
    surfaceContainerLowest: dark ? Brand.darkBg : Brand.beige,
    surfaceContainerLow: dark ? const Color(0xFF121B18) : const Color(0xFFF8F6F1),
    surfaceContainer: dark ? const Color(0xFF18231F) : const Color(0xFFF1EDE4),
    surfaceContainerHigh: dark ? const Color(0xFF1D2925) : const Color(0xFFEAE5DA),
    surfaceContainerHighest: dark ? const Color(0xFF22302B) : const Color(0xFFE3DDD0),
    outline: dark ? Brand.darkBorder : Brand.border,
    outlineVariant: dark ? const Color(0xFF1F2B27) : const Color(0xFFEDE8DD),
    shadow: Colors.black,
  );

  final base = ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    brightness: b,
    fontFamily: 'Cairo',
    fontFamilyFallback: _fontFallback,
    scaffoldBackgroundColor: dark ? Brand.darkBg : Brand.beige,
    visualDensity: VisualDensity.standard,
    splashFactory: InkSparkle.splashFactory,
  );
  final text = base.textTheme.apply(
    fontFamily: 'Cairo',
    fontFamilyFallback: _fontFallback,
    bodyColor: scheme.onSurface,
    displayColor: scheme.onSurface,
  );
  final radius = BorderRadius.circular(14);

  return base.copyWith(
    textTheme: text.copyWith(
      titleLarge: text.titleLarge?.copyWith(fontWeight: FontWeight.w900),
      titleMedium: text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
      titleSmall: text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
      labelLarge: text.labelLarge?.copyWith(fontWeight: FontWeight.w700),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: dark ? Brand.darkBg : Brand.beige,
      foregroundColor: scheme.onSurface,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      centerTitle: false,
      titleTextStyle: text.titleLarge?.copyWith(fontWeight: FontWeight.w900, fontSize: 20),
    ),
    cardTheme: CardThemeData(
      color: scheme.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: BorderSide(color: scheme.outline)),
    ),
    dividerTheme: DividerThemeData(color: scheme.outline, thickness: 1, space: 1),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: dark ? const Color(0xFF1A2622) : const Color(0xFFF9F7F2),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: scheme.outline)),
      enabledBorder: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: scheme.outline)),
      focusedBorder: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: scheme.primary, width: 1.6)),
      errorBorder: OutlineInputBorder(borderRadius: radius, borderSide: const BorderSide(color: Brand.danger)),
      labelStyle: TextStyle(color: scheme.onSurfaceVariant),
      hintStyle: TextStyle(color: scheme.onSurfaceVariant.withValues(alpha: 0.7)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(64, 50),
        shape: RoundedRectangleBorder(borderRadius: radius),
        textStyle: const TextStyle(fontFamily: 'Cairo', fontFamilyFallback: _fontFallback, fontWeight: FontWeight.w700, fontSize: 16),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(64, 48),
        shape: RoundedRectangleBorder(borderRadius: radius),
        side: BorderSide(color: scheme.outline),
        textStyle: const TextStyle(fontFamily: 'Cairo', fontFamilyFallback: _fontFallback, fontWeight: FontWeight.w700),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(textStyle: const TextStyle(fontFamily: 'Cairo', fontFamilyFallback: _fontFallback, fontWeight: FontWeight.w700)),
    ),
    chipTheme: ChipThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      side: BorderSide(color: scheme.outline),
      labelStyle: TextStyle(fontFamily: 'Cairo', fontFamilyFallback: _fontFallback, fontWeight: FontWeight.w600, color: scheme.onSurface),
      selectedColor: scheme.primary,
      secondarySelectedColor: scheme.primary,
      showCheckmark: false,
    ),
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: dark ? const Color(0xFF101916) : Brand.ink,
      indicatorColor: Brand.sage,
      selectedIconTheme: const IconThemeData(color: Colors.white),
      unselectedIconTheme: IconThemeData(color: Colors.white.withValues(alpha: 0.7)),
      selectedLabelTextStyle: const TextStyle(fontFamily: 'Cairo', color: Colors.white, fontWeight: FontWeight.w700),
      unselectedLabelTextStyle: TextStyle(fontFamily: 'Cairo', color: Colors.white.withValues(alpha: 0.75)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: scheme.surface,
      indicatorColor: scheme.primaryContainer,
      labelTextStyle: WidgetStateProperty.all(const TextStyle(fontFamily: 'Cairo', fontSize: 12, fontWeight: FontWeight.w700)),
      height: 68,
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: radius),
      contentTextStyle: const TextStyle(fontFamily: 'Cairo', fontFamilyFallback: _fontFallback, fontWeight: FontWeight.w600),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: scheme.surface,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: scheme.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
    ),
    listTileTheme: ListTileThemeData(shape: RoundedRectangleBorder(borderRadius: radius)),
  );
}
