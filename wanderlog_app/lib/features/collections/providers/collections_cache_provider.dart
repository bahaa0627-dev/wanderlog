import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/features/collections/providers/collection_providers.dart';

/// 合集数据缓存状态
class CollectionsCacheState {
  final Map<String, Map<String, dynamic>> collectionsById;
  final bool isLoading;
  final String? error;
  final DateTime? lastLoadedAt;

  const CollectionsCacheState({
    this.collectionsById = const {},
    this.isLoading = false,
    this.error,
    this.lastLoadedAt,
  });

  CollectionsCacheState copyWith({
    Map<String, Map<String, dynamic>>? collectionsById,
    bool? isLoading,
    String? error,
    DateTime? lastLoadedAt,
  }) {
    return CollectionsCacheState(
      collectionsById: collectionsById ?? this.collectionsById,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      lastLoadedAt: lastLoadedAt ?? this.lastLoadedAt,
    );
  }

  bool get hasData => collectionsById.isNotEmpty;
  
  /// 检查缓存是否过期（10分钟）
  bool get isStale {
    if (lastLoadedAt == null) return true;
    return DateTime.now().difference(lastLoadedAt!).inMinutes > 10;
  }
}

/// 合集数据缓存 Notifier
class CollectionsCacheNotifier extends StateNotifier<CollectionsCacheState> {
  final Ref _ref;

  CollectionsCacheNotifier(this._ref) : super(const CollectionsCacheState());

  /// 预加载所有合集数据（含地点）
  Future<void> preloadCollections({bool force = false}) async {
    if (state.isLoading) return;
    if (!force && state.hasData && !state.isStale) return;

    state = state.copyWith(isLoading: true, error: null);

    try {
      final repository = _ref.read(collectionRepositoryProvider);
      
      // 获取所有合集列表
      final collections = await repository.listCollections();
      
      // 并行加载所有合集详情（含地点）
      final Map<String, Map<String, dynamic>> collectionsById = {};
      
      await Future.wait(
        collections.map((col) async {
          final id = col['id']?.toString();
          if (id == null) return;
          
          try {
            final detail = await repository.getCollection(id);
            collectionsById[id] = detail;
          } catch (e) {
            print('⚠️ Failed to load collection $id: $e');
          }
        }),
      );

      state = state.copyWith(
        collectionsById: collectionsById,
        isLoading: false,
        lastLoadedAt: DateTime.now(),
      );
      
      print('✅ Preloaded ${collectionsById.length} collections with spots');
    } catch (e) {
      print('❌ Error preloading collections: $e');
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
  }

  /// 获取缓存的合集详情
  Map<String, dynamic>? getCollection(String id) {
    return state.collectionsById[id];
  }

  /// 刷新数据
  Future<void> refresh() => preloadCollections(force: true);
}

/// 全局合集缓存 Provider
final collectionsCacheProvider = StateNotifierProvider<CollectionsCacheNotifier, CollectionsCacheState>((ref) {
  return CollectionsCacheNotifier(ref);
});
