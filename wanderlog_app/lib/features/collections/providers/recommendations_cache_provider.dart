import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/features/collections/providers/collection_providers.dart';

/// Recommendations 缓存状态
class RecommendationsCacheState {
  const RecommendationsCacheState({
    this.recommendations = const [],
    this.isLoading = false,
    this.error,
    this.lastLoadedAt,
  });

  final List<Map<String, dynamic>> recommendations;
  final bool isLoading;
  final String? error;
  final DateTime? lastLoadedAt;

  RecommendationsCacheState copyWith({
    List<Map<String, dynamic>>? recommendations,
    bool? isLoading,
    String? error,
    DateTime? lastLoadedAt,
  }) =>
      RecommendationsCacheState(
        recommendations: recommendations ?? this.recommendations,
        isLoading: isLoading ?? this.isLoading,
        error: error,
        lastLoadedAt: lastLoadedAt ?? this.lastLoadedAt,
      );

  bool get hasData => recommendations.isNotEmpty;

  /// 检查缓存是否过期（30分钟）
  bool get isStale {
    if (lastLoadedAt == null) return true;
    return DateTime.now().difference(lastLoadedAt!).inMinutes > 30;
  }
}

/// Recommendations 缓存 Notifier
class RecommendationsCacheNotifier
    extends StateNotifier<RecommendationsCacheState> {
  RecommendationsCacheNotifier(this._ref)
      : super(const RecommendationsCacheState());

  final Ref _ref;

  /// 加载 recommendations（带缓存）
  Future<List<Map<String, dynamic>>> loadRecommendations({
    bool forceRefresh = false,
  }) async {
    // 如果有缓存且未过期，直接返回
    if (!forceRefresh && state.hasData && !state.isStale) {
      print(
          '✅ [RecommendationsCache] Using cached data (${state.recommendations.length} items)',);
      return state.recommendations;
    }

    // 如果正在加载，等待
    if (state.isLoading) {
      print('⏳ [RecommendationsCache] Already loading, waiting...');
      // 等待加载完成
      while (state.isLoading) {
        await Future.delayed(const Duration(milliseconds: 100));
      }
      return state.recommendations;
    }

    state = state.copyWith(isLoading: true, error: null);

    try {
      print('🔄 [RecommendationsCache] Loading from Supabase (fast)...');

      // 优先使用 Supabase 直接查询（快速、轻量级）
      final supabaseRepo = _ref.read(supabaseCollectionRepositoryProvider);
      final data = await supabaseRepo.listRecommendations();

      print(
          '✅ [RecommendationsCache] Loaded ${data.length} recommendations from Supabase',);

      state = RecommendationsCacheState(
        recommendations: data,
        isLoading: false,
        lastLoadedAt: DateTime.now(),
      );

      return data;
    } catch (e) {
      print('❌ [RecommendationsCache] Error loading: $e');

      // 如果有旧缓存，返回旧缓存
      if (state.hasData) {
        print('⚠️ [RecommendationsCache] Returning stale cache data');
        state = state.copyWith(isLoading: false);
        return state.recommendations;
      }

      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
      rethrow;
    }
  }

  /// 清除缓存
  void clearCache() {
    print('🗑️ [RecommendationsCache] Clearing cache');
    state = const RecommendationsCacheState();
  }

  /// 手动更新缓存
  void updateCache(List<Map<String, dynamic>> recommendations) {
    print(
        '📝 [RecommendationsCache] Updating cache with ${recommendations.length} items',);
    state = RecommendationsCacheState(
      recommendations: recommendations,
      isLoading: false,
      lastLoadedAt: DateTime.now(),
    );
  }
}

/// Recommendations 缓存 Provider
final recommendationsCacheProvider = StateNotifierProvider<
    RecommendationsCacheNotifier, RecommendationsCacheState>(
  (ref) => RecommendationsCacheNotifier(ref),
);
