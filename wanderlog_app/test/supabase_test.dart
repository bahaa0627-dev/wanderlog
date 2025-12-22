// 简单的 Supabase 连接测试
// 运行: flutter test test/supabase_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

void main() {
  const supabaseUrl = 'https://bpygtpeawkxlgjhqorzi.supabase.co';
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJweWd0cGVhd2t4bGdqaHFvcnppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTM1NjQsImV4cCI6MjA4MTk4OTU2NH0.6_2dRSlPs54Q25RtKP07eIv-7t0yDFOkibAt05Bp_RQ';

  group('Supabase API Tests', () {
    test('获取地点列表', () async {
      final response = await http.get(
        Uri.parse('$supabaseUrl/rest/v1/places?limit=5'),
        headers: {
          'apikey': anonKey,
          'Content-Type': 'application/json',
        },
      );

      expect(response.statusCode, 200);
      final data = jsonDecode(response.body) as List;
      expect(data.isNotEmpty, true);
      print('✅ 获取到 ${data.length} 个地点');
      for (var place in data) {
        print('  - ${place['name']} (${place['city']})');
      }
    });

    test('获取合集列表', () async {
      final response = await http.get(
        Uri.parse('$supabaseUrl/rest/v1/collections?is_published=eq.true&limit=5'),
        headers: {
          'apikey': anonKey,
          'Content-Type': 'application/json',
        },
      );

      expect(response.statusCode, 200);
      final data = jsonDecode(response.body) as List;
      expect(data.isNotEmpty, true);
      print('✅ 获取到 ${data.length} 个合集');
      for (var collection in data) {
        print('  - ${collection['name']}');
      }
    });

    test('搜索地点', () async {
      final response = await http.get(
        Uri.parse('$supabaseUrl/rest/v1/places?name=ilike.*Paris*&limit=5'),
        headers: {
          'apikey': anonKey,
          'Content-Type': 'application/json',
        },
      );

      expect(response.statusCode, 200);
      final data = jsonDecode(response.body) as List;
      print('✅ 搜索 "Paris" 找到 ${data.length} 个结果');
    });
  });
}
