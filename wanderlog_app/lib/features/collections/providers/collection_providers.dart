import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:wanderlog/features/collections/data/hybrid_collection_repository.dart';
import 'package:wanderlog/features/collections/data/supabase_collection_repository.dart';
import 'package:wanderlog/core/providers/dio_provider.dart';

// Supabase Collection Repository Provider
final supabaseCollectionRepositoryProvider =
    Provider<SupabaseCollectionRepository>((ref) {
  return SupabaseCollectionRepository();
});

// 使用混合 Repository：
// - 推荐列表使用 API（返回完整的 spotCount 数据）
// - 其他功能使用 Supabase（直接查询）
final collectionRepositoryProvider =
    Provider<HybridCollectionRepository>((ref) {
  final dio = ref.watch(dioProvider);
  return HybridCollectionRepository(dio);
});
