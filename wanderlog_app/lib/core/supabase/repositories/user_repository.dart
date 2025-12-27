import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/place_model.dart';
import '../supabase_config.dart';

/// 用户数据仓库 (收藏、打卡等)
class UserRepository {
  final SupabaseClient _client;

  UserRepository([SupabaseClient? client])
      : _client = client ?? SupabaseConfig.client;

  String? get _userId => _client.auth.currentUser?.id;

  void _ensureAuthenticated() {
    if (_userId == null) {
      throw Exception('用户未登录');
    }
  }

  // ==================== 收藏相关 ====================

  /// 获取用户收藏列表
  Future<List<PlaceModel>> getFavorites() async {
    _ensureAuthenticated();

    final response = await _client
        .from('user_favorites')
        .select('*, place:places(*)')
        .eq('user_id', _userId!)
        .order('created_at', ascending: false);

    return (response as List)
        .map((e) => PlaceModel.fromJson(e['place'] as Map<String, dynamic>))
        .toList();
  }

  /// 检查是否已收藏
  Future<bool> isFavorite(String placeId) async {
    if (_userId == null) return false;

    final response = await _client
        .from('user_favorites')
        .select('id')
        .eq('user_id', _userId!)
        .eq('place_id', placeId)
        .maybeSingle();

    return response != null;
  }

  /// 添加收藏
  Future<void> addFavorite(String placeId, {String? notes}) async {
    _ensureAuthenticated();

    await _client.from('user_favorites').insert({
      'user_id': _userId,
      'place_id': placeId,
      'notes': notes,
    });
  }

  /// 移除收藏
  Future<void> removeFavorite(String placeId) async {
    _ensureAuthenticated();

    await _client
        .from('user_favorites')
        .delete()
        .eq('user_id', _userId!)
        .eq('place_id', placeId);
  }

  /// 切换收藏状态
  Future<bool> toggleFavorite(String placeId) async {
    final isFav = await isFavorite(placeId);
    if (isFav) {
      await removeFavorite(placeId);
      return false;
    } else {
      await addFavorite(placeId);
      return true;
    }
  }

  // ==================== 打卡相关 ====================

  /// 获取用户打卡记录
  Future<List<Map<String, dynamic>>> getCheckins() async {
    _ensureAuthenticated();

    final response = await _client
        .from('user_checkins')
        .select('*, place:places(*)')
        .eq('user_id', _userId!)
        .order('visited_at', ascending: false);

    return List<Map<String, dynamic>>.from(response);
  }

  /// 获取某地点的打卡记录
  Future<List<Map<String, dynamic>>> getPlaceCheckins(String placeId) async {
    _ensureAuthenticated();

    final response = await _client
        .from('user_checkins')
        .select()
        .eq('user_id', _userId!)
        .eq('place_id', placeId)
        .order('visited_at', ascending: false);

    return List<Map<String, dynamic>>.from(response);
  }

  /// 打卡
  Future<String> checkin({
    required String placeId,
    int? rating,
    String? notes,
    List<String>? photoUrls,
    bool isPublic = false,
  }) async {
    _ensureAuthenticated();

    final response = await _client.from('user_checkins').insert({
      'user_id': _userId,
      'place_id': placeId,
      'rating': rating,
      'notes': notes,
      'photos': photoUrls ?? [],
      'is_public': isPublic,
    }).select('id').single();

    return response['id'] as String;
  }

  /// 删除打卡记录
  Future<void> deleteCheckin(String checkinId) async {
    _ensureAuthenticated();

    await _client
        .from('user_checkins')
        .delete()
        .eq('id', checkinId)
        .eq('user_id', _userId!);
  }

  // ==================== 合集收藏 ====================

  /// 获取收藏的合集
  Future<List<Map<String, dynamic>>> getFavoriteCollections() async {
    _ensureAuthenticated();

    final response = await _client
        .from('user_collection_favorites')
        .select('*, collection:collections(*)')
        .eq('user_id', _userId!)
        .order('created_at', ascending: false);

    return List<Map<String, dynamic>>.from(response);
  }

  /// 收藏合集
  Future<void> addCollectionFavorite(String collectionId) async {
    _ensureAuthenticated();

    await _client.from('user_collection_favorites').insert({
      'user_id': _userId,
      'collection_id': collectionId,
    });
  }

  /// 取消收藏合集
  Future<void> removeCollectionFavorite(String collectionId) async {
    _ensureAuthenticated();

    await _client
        .from('user_collection_favorites')
        .delete()
        .eq('user_id', _userId!)
        .eq('collection_id', collectionId);
  }

  // ==================== 用户统计 ====================

  /// 获取用户统计信息
  Future<Map<String, dynamic>?> getUserStats() async {
    if (_userId == null) return null;

    final response = await _client
        .from('profiles')
        .select('total_favorites, total_checkins, membership_type')
        .eq('id', _userId!)
        .maybeSingle();

    return response;
  }
}
