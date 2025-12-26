import 'package:supabase_flutter/supabase_flutter.dart';
import '../supabase_config.dart';

/// 配额状态模型
class QuotaStatus {
  final String? userId;
  final DateTime quotaDate;
  final int deepSearchCount;
  final int detailViewCount;
  final int deepSearchRemaining;
  final int detailViewRemaining;
  final DateTime resetTime;

  QuotaStatus({
    this.userId,
    required this.quotaDate,
    required this.deepSearchCount,
    required this.detailViewCount,
    required this.deepSearchRemaining,
    required this.detailViewRemaining,
    required this.resetTime,
  });

  /// 是否可以进行深度搜索
  bool get canDeepSearch => deepSearchRemaining > 0;

  /// 是否可以查看详情
  bool get canViewDetail => detailViewRemaining > 0;

  /// 深度搜索配额是否低（≤2）
  bool get isDeepSearchLow => deepSearchRemaining <= 2;

  /// 详情查看配额是否低（≤2）
  bool get isDetailViewLow => detailViewRemaining <= 2;

  factory QuotaStatus.fromJson(Map<String, dynamic> json) {
    final deepSearchCount = json['deep_search_count'] as int? ?? 0;
    final detailViewCount = json['detail_view_count'] as int? ?? 0;

    return QuotaStatus(
      userId: json['user_id'] as String?,
      quotaDate: DateTime.tryParse(json['quota_date'] as String? ?? '') ?? DateTime.now(),
      deepSearchCount: deepSearchCount,
      detailViewCount: detailViewCount,
      deepSearchRemaining: QuotaService.deepSearchLimit - deepSearchCount,
      detailViewRemaining: QuotaService.detailViewLimit - detailViewCount,
      resetTime: _calculateResetTime(),
    );
  }

  /// 计算下次重置时间（UTC 00:00）
  static DateTime _calculateResetTime() {
    final now = DateTime.now().toUtc();
    return DateTime.utc(now.year, now.month, now.day + 1);
  }

  /// 默认配额状态（未登录或新用户）
  factory QuotaStatus.defaultStatus() {
    return QuotaStatus(
      quotaDate: DateTime.now(),
      deepSearchCount: 0,
      detailViewCount: 0,
      deepSearchRemaining: QuotaService.deepSearchLimit,
      detailViewRemaining: QuotaService.detailViewLimit,
      resetTime: _calculateResetTime(),
    );
  }
}

/// 配额服务 - 管理 AI 搜索配额
class QuotaService {
  final SupabaseClient _client;

  QuotaService([SupabaseClient? client])
      : _client = client ?? SupabaseConfig.client;

  /// 深度搜索每日限制
  static const int deepSearchLimit = 10;

  /// 详情查看每日限制
  static const int detailViewLimit = 20;

  /// 获取当前用户 ID
  String? get _currentUserId => _client.auth.currentUser?.id;

  /// 获取配额状态
  Future<QuotaStatus> getQuotaStatus([String? userId]) async {
    final uid = userId ?? _currentUserId;
    if (uid == null) {
      return QuotaStatus.defaultStatus();
    }

    try {
      // 调用数据库函数获取或创建今日配额
      final response = await _client.rpc(
        'get_or_create_today_quota',
        params: {'p_user_id': uid},
      );

      if (response != null) {
        return QuotaStatus.fromJson(response as Map<String, dynamic>);
      }
      return QuotaStatus.defaultStatus();
    } catch (e) {
      print('❌ Failed to get quota status: $e');
      return QuotaStatus.defaultStatus();
    }
  }

  /// 检查是否可以进行深度搜索
  Future<bool> canDeepSearch([String? userId]) async {
    final status = await getQuotaStatus(userId);
    return status.canDeepSearch;
  }

  /// 检查是否可以查看详情
  Future<bool> canViewDetail([String? userId]) async {
    final status = await getQuotaStatus(userId);
    return status.canViewDetail;
  }

  /// 消耗深度搜索配额
  /// 返回更新后的配额状态
  Future<QuotaStatus> consumeDeepSearch([String? userId]) async {
    final uid = userId ?? _currentUserId;
    if (uid == null) {
      return QuotaStatus.defaultStatus();
    }

    try {
      final response = await _client.rpc(
        'consume_deep_search_quota',
        params: {'p_user_id': uid},
      );

      if (response != null) {
        return QuotaStatus.fromJson(response as Map<String, dynamic>);
      }
      return QuotaStatus.defaultStatus();
    } catch (e) {
      print('❌ Failed to consume deep search quota: $e');
      return QuotaStatus.defaultStatus();
    }
  }

  /// 消耗详情查看配额
  /// 返回更新后的配额状态
  Future<QuotaStatus> consumeDetailView([String? userId]) async {
    final uid = userId ?? _currentUserId;
    if (uid == null) {
      return QuotaStatus.defaultStatus();
    }

    try {
      final response = await _client.rpc(
        'consume_detail_view_quota',
        params: {'p_user_id': uid},
      );

      if (response != null) {
        return QuotaStatus.fromJson(response as Map<String, dynamic>);
      }
      return QuotaStatus.defaultStatus();
    } catch (e) {
      print('❌ Failed to consume detail view quota: $e');
      return QuotaStatus.defaultStatus();
    }
  }

  /// 获取剩余深度搜索次数
  Future<int> getRemainingDeepSearches([String? userId]) async {
    final status = await getQuotaStatus(userId);
    return status.deepSearchRemaining;
  }

  /// 获取剩余详情查看次数
  Future<int> getRemainingDetailViews([String? userId]) async {
    final status = await getQuotaStatus(userId);
    return status.detailViewRemaining;
  }

  /// 格式化重置时间为可读字符串
  String formatResetTime(DateTime resetTime) {
    final now = DateTime.now().toUtc();
    final diff = resetTime.difference(now);
    
    if (diff.inHours > 0) {
      return '${diff.inHours}h ${diff.inMinutes % 60}m';
    } else if (diff.inMinutes > 0) {
      return '${diff.inMinutes}m';
    } else {
      return 'Soon';
    }
  }
}
