import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:wanderlog/features/ai_recognition/data/models/ai_recognition_history.dart';

/// AI识别历史记录存储服务
class AIRecognitionHistoryService {
  static const String _storageKey = 'ai_recognition_history';
  static const int _maxHistoryCount = 50; // 最多保存50条记录

  /// 保存识别历史
  Future<void> saveHistory(AIRecognitionHistory history) async {
    final prefs = await SharedPreferences.getInstance();
    
    // 读取现有历史
    final histories = await getHistories();
    
    // 插入到列表开头
    histories.insert(0, history);
    
    // 限制历史记录数量
    if (histories.length > _maxHistoryCount) {
      histories.removeRange(_maxHistoryCount, histories.length);
    }
    
    // 保存到本地
    final jsonList = histories.map((h) => h.toJson()).toList();
    final jsonString = jsonEncode(jsonList);
    await prefs.setString(_storageKey, jsonString);
  }

  /// 获取所有历史记录
  Future<List<AIRecognitionHistory>> getHistories() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final jsonString = prefs.getString(_storageKey);
      
      if (jsonString == null || jsonString.isEmpty) {
        return [];
      }
      
      final List<dynamic> jsonList = jsonDecode(jsonString) as List<dynamic>;
      return jsonList
          .map((json) => AIRecognitionHistory.fromJson(json as Map<String, dynamic>))
          .toList();
    } catch (e) {
      print('读取历史记录失败: $e');
      return [];
    }
  }

  /// 根据ID获取历史记录
  Future<AIRecognitionHistory?> getHistoryById(String id) async {
    final histories = await getHistories();
    try {
      return histories.firstWhere((h) => h.id == id);
    } catch (e) {
      return null;
    }
  }

  /// 删除指定历史记录
  Future<void> deleteHistory(String id) async {
    final prefs = await SharedPreferences.getInstance();
    final histories = await getHistories();
    
    histories.removeWhere((h) => h.id == id);
    
    final jsonList = histories.map((h) => h.toJson()).toList();
    final jsonString = jsonEncode(jsonList);
    await prefs.setString(_storageKey, jsonString);
  }

  /// 清空所有历史记录
  Future<void> clearAllHistories() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_storageKey);
  }

  /// 获取历史记录数量
  Future<int> getHistoryCount() async {
    final histories = await getHistories();
    return histories.length;
  }
}
