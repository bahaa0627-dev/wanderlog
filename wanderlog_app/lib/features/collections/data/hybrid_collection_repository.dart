import 'package:dio/dio.dart';
import 'package:wanderlog/features/collections/data/collection_repository.dart';
import 'package:wanderlog/features/collections/data/supabase_collection_repository.dart';

/// 混合 Repository：
/// - 推荐列表使用 API（返回完整的 spotCount 数据）
/// - 其他功能使用 Supabase（直接查询）
class HybridCollectionRepository {

  HybridCollectionRepository(Dio dio)
      : _apiRepository = CollectionRepository(dio),
        _supabaseRepository = SupabaseCollectionRepository();
  final CollectionRepository _apiRepository;
  final SupabaseCollectionRepository _supabaseRepository;

  // 使用 API 的方法（返回完整数据including spotCount）
  Future<List<Map<String, dynamic>>> listRecommendations() => _apiRepository.listRecommendations();
  Future<Map<String, dynamic>> getRecommendation(String id) => _apiRepository.getRecommendation(id);
  
  // 使用 Supabase 的方法
  Future<List<Map<String, dynamic>>> listCollections({bool includeAll = false}) => 
      _supabaseRepository.listCollections(includeAll: includeAll);
  Future<Map<String, dynamic>> getCollection(String id) => _supabaseRepository.getCollection(id);
  Future<void> favoriteCollection(String id) => _supabaseRepository.favoriteCollection(id);
  Future<void> unfavoriteCollection(String id) => _supabaseRepository.unfavoriteCollection(id);
  Future<List<Map<String, dynamic>>> getCollectionsForPlace(String placeId) => 
      _supabaseRepository.getCollectionsForPlace(placeId);
}
