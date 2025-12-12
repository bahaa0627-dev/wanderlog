import 'dart:io';
import 'package:dio/dio.dart';
import 'package:google_generative_ai/google_generative_ai.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:wanderlog/features/ai_recognition/data/models/ai_recognition_result.dart';
import 'dart:convert';

/// HTTP代理覆盖类
class _ProxyHttpOverrides extends HttpOverrides {
  _ProxyHttpOverrides(this.proxyUrl);
  
  final String proxyUrl;

  @override
  HttpClient createHttpClient(SecurityContext? context) {
    final client = super.createHttpClient(context);
    client.findProxy = (uri) {
      final proxy = proxyUrl
          .replaceAll('http://', '')
          .replaceAll('https://', '')
          .replaceAll('socks5://', '');
      return 'PROXY $proxy';
    };
    client.connectionTimeout = const Duration(seconds: 60);
    client.badCertificateCallback = (cert, host, port) => true; // 开发环境可以忽略证书
    return client;
  }
}

/// AI识别服务
class AIRecognitionService {
  AIRecognitionService({required Dio dio}) : _dio = dio;

  final Dio _dio;

  /// 识别图片中的地点
  /// 
  /// 接收最多5张图片，调用Gemini AI识别地点信息
  Future<AIRecognitionResult> recognizeLocations(
    List<File> images,
  ) async {
    if (images.isEmpty) {
      throw ArgumentError('至少需要一张图片');
    }
    if (images.length > 5) {
      throw ArgumentError('最多只能上传5张图片');
    }

    try {
      // 1. 调用Gemini AI分析图片
      final geminiResult = await _analyzeImagesWithGemini(images);
      
      // 2. 解析AI返回的地点信息
      final locations = _parseLocationFromGemini(geminiResult);
      
      // 如果没有识别到地点，返回提示信息
      if (locations.isEmpty) {
        return AIRecognitionResult(
          message: geminiResult['message'] as String? ?? 
            'I couldn\'t identify specific locations in these images. Try uploading clearer images of recognizable landmarks or places.',
          spots: [],
          imageUrls: images.map((f) => f.path).toList(),
        );
      }
      
      // 3. 调用Google Maps API获取详细信息
      final spotsData = await _fetchSpotDetailsFromGoogleMaps(locations);
      
      // 如果Google Maps也没找到结果
      if (spotsData.isEmpty) {
        return AIRecognitionResult(
          message: 'I identified some places but couldn\'t find detailed information for them. The places might be too new or not well-documented on Google Maps.',
          spots: [],
          imageUrls: images.map((f) => f.path).toList(),
        );
      }
      
      // 4. 转换为Spot对象
      final spots = spotsData.map(AIRecognitionResult.spotFromJson).toList();
      
      return AIRecognitionResult(
        message: geminiResult['message'] as String? ?? 'I found these amazing places for you!',
        spots: spots,
        imageUrls: images.map((f) => f.path).toList(),
      );
    } catch (e) {
      print('识别失败详情: $e');
      throw Exception('Recognition failed: $e');
    }
  }

  /// 使用Gemini AI分析图片
  Future<Map<String, dynamic>> _analyzeImagesWithGemini(
    List<File> images,
  ) async {
    final apiKey = dotenv.env['GEMINI_API_KEY'] ?? '';
    if (apiKey.isEmpty) {
      throw Exception('GEMINI_API_KEY not configured');
    }

    // 设置系统代理（如果配置了）
    final proxyUrl = dotenv.env['HTTP_PROXY'] ?? '';
    if (proxyUrl.isNotEmpty) {
      print('检测到代理配置: $proxyUrl');
      print('请确保系统已设置代理环境变量 HTTP_PROXY 和 HTTPS_PROXY');
      // 设置环境变量供HttpClient使用
      HttpOverrides.global = _ProxyHttpOverrides(proxyUrl);
    }

    final model = GenerativeModel(
      model: 'gemini-2.5-flash',
      apiKey: apiKey,
    );

    // 准备图片数据
    final imageParts = <DataPart>[];
    for (final image in images) {
      final bytes = await image.readAsBytes();
      imageParts.add(DataPart('image/jpeg', bytes));
    }

    // 构建提示词
    const prompt = '''
Analyze these images and identify the tourist attractions, landmarks, restaurants, or places shown in them.
Please be very specific and accurate. Only identify places that you can clearly see or recognize in the images.

For each place you identify, provide:
1. The exact name of the place/landmark/attraction
2. The city where it's located
3. The country
4. The type (restaurant, museum, landmark, park, waterfall, monument, etc.)
5. 2-3 relevant tags

Return the result in JSON format:
{
  "message": "A brief, friendly introduction about the places found (max 50 words)",
  "locations": [
    {
      "name": "Exact place name",
      "city": "City name",
      "country": "Country name",
      "type": "Place type",
      "tags": ["tag1", "tag2", "tag3"]
    }
  ]
}

Important rules:
- Only identify places you can actually see or clearly recognize in the images
- If you cannot identify specific places, return an empty locations array
- Be precise with place names - don't make up or guess locations
- If the image shows nature (waterfall, mountain, etc.), try to identify the specific natural landmark
''';

    // 调用Gemini API
    final content = [
      Content.multi([
        TextPart(prompt),
        ...imageParts,
      ]),
    ];

    final response = await model.generateContent(content);
    final text = response.text ?? '';
    
    print('Gemini响应: $text');
    
    // 解析JSON响应
    try {
      // 提取JSON部分（可能包含markdown代码块）
      var jsonText = text.trim();
      
      // 移除可能的markdown代码块标记
      if (jsonText.contains('```json')) {
        final start = jsonText.indexOf('```json') + 7;
        final end = jsonText.lastIndexOf('```');
        if (end > start) {
          jsonText = jsonText.substring(start, end).trim();
        }
      } else if (jsonText.contains('```')) {
        final start = jsonText.indexOf('```') + 3;
        final end = jsonText.lastIndexOf('```');
        if (end > start) {
          jsonText = jsonText.substring(start, end).trim();
        }
      }
      
      // 尝试找到JSON对象的开始和结束
      final jsonStart = jsonText.indexOf('{');
      final jsonEnd = jsonText.lastIndexOf('}');
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
      }
      
      print('解析的JSON: $jsonText');
      
      final parsed = jsonDecode(jsonText) as Map<String, dynamic>;
      print('解析成功: ${parsed['locations']?.length ?? 0} 个地点');
      return parsed;
    } catch (e) {
      print('JSON解析失败: $e');
      // 如果解析失败，返回默认结构
      return {
        'message': 'I analyzed the images but couldn\'t identify specific locations. The images might show general scenery or landmarks I don\'t recognize.',
        'locations': <Map<String, dynamic>>[],
      };
    }
  }

  /// 从Gemini结果中解析地点信息
  List<Map<String, dynamic>> _parseLocationFromGemini(
    Map<String, dynamic> geminiResult,
  ) {
    final locations = geminiResult['locations'] as List?;
    if (locations == null || locations.isEmpty) {
      return [];
    }
    
    return locations
        .map((loc) => loc as Map<String, dynamic>)
        .toList();
  }

  /// 调用Google Maps API获取地点详细信息
  Future<List<Map<String, dynamic>>> _fetchSpotDetailsFromGoogleMaps(
    List<Map<String, dynamic>> locations,
  ) async {
    final apiKey = dotenv.env['GOOGLE_MAPS_API_KEY'] ?? '';
    if (apiKey.isEmpty || locations.isEmpty) {
      return [];
    }

    final spots = <Map<String, dynamic>>[];

    for (final location in locations) {
      try {
        final name = location['name'] as String;
        final city = location['city'] as String? ?? '';
        
        // 使用Google Places API搜索地点
        final searchQuery = '$name ${city.isNotEmpty ? city : ''}';
        final response = await _dio.get<Map<String, dynamic>>(
          'https://maps.googleapis.com/maps/api/place/findplacefromtext/json',
          queryParameters: {
            'input': searchQuery,
            'inputtype': 'textquery',
            'fields': 'place_id,name,formatted_address,geometry,rating,user_ratings_total,photos,types',
            'key': apiKey,
          },
        );

        final candidates = response.data?['candidates'] as List?;
        if (candidates == null || candidates.isEmpty) continue;

        final place = candidates.first as Map<String, dynamic>;
        
        // 获取地点详情
        final placeId = place['place_id'] as String;
        final detailsResponse = await _dio.get<Map<String, dynamic>>(
          'https://maps.googleapis.com/maps/api/place/details/json',
          queryParameters: {
            'place_id': placeId,
            'fields': 'name,formatted_address,geometry,rating,user_ratings_total,photos,types,editorial_summary',
            'key': apiKey,
          },
        );

        final result = detailsResponse.data?['result'] as Map<String, dynamic>?;
        if (result == null) continue;

        // 获取照片URL
        final photos = result['photos'] as List?;
        final photoUrls = <String>[];
        if (photos != null && photos.isNotEmpty) {
          for (final photo in photos.take(5)) {
            final photoRef = photo['photo_reference'] as String?;
            if (photoRef != null) {
              photoUrls.add(
                'https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=$photoRef&key=$apiKey',
              );
            }
          }
        }

        final geometry = result['geometry'] as Map<String, dynamic>?;
        final locationData = geometry?['location'] as Map<String, dynamic>?;

        spots.add({
          'id': placeId,
          'name': result['name'] as String,
          'city': city,
          'category': location['type'] as String? ?? 'Place',
          'latitude': locationData?['lat'] as double? ?? 0.0,
          'longitude': locationData?['lng'] as double? ?? 0.0,
          'rating': (result['rating'] as num?)?.toDouble() ?? 0.0,
          'ratingCount': result['user_ratings_total'] as int? ?? 0,
          'coverImage': photoUrls.isNotEmpty ? photoUrls.first : '',
          'images': photoUrls,
          'tags': (location['tags'] as List?)?.map((e) => e.toString()).toList() ?? [],
          'aiSummary': result['editorial_summary']?['overview'] as String?,
        });
      } catch (e) {
        print('获取地点详情失败: $e');
        continue;
      }
    }

    return spots;
  }

  /// Mock方法：用于测试，返回模拟数据
  Future<AIRecognitionResult> recognizeLocationsMock(
    List<File> images,
  ) async {
    // 模拟网络延迟
    await Future<void>.delayed(const Duration(seconds: 2));

    // 返回模拟数据
    return AIRecognitionResult.fromJson({
      'message': '我为您找到了这些精彩的地点！这些都是小红书上很受欢迎的打卡地，每个都有独特的魅力和故事。',
      'imageUrls': images.map((f) => f.path).toList(),
      'spots': [
        {
          'id': 'mock_spot_1',
          'name': 'Noma Restaurant',
          'city': 'Copenhagen',
          'category': 'Restaurant',
          'latitude': 55.6880,
          'longitude': 12.6000,
          'rating': 4.8,
          'ratingCount': 1250,
          'coverImage':
              'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
          'images': [
            'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
          ],
          'tags': ['Restaurant', 'Fine Dining', 'Michelin'],
          'aiSummary': '世界顶级餐厅，北欧料理的标杆',
        },
        {
          'id': 'mock_spot_2',
          'name': 'Tivoli Gardens',
          'city': 'Copenhagen',
          'category': 'Park',
          'latitude': 55.6739,
          'longitude': 12.5681,
          'rating': 4.6,
          'ratingCount': 3420,
          'coverImage':
              'https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?w=800',
          'images': [
            'https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?w=800',
          ],
          'tags': ['Amusement Park', 'Gardens', 'Family'],
          'aiSummary': '历史悠久的游乐园，充满童话色彩',
        },
        {
          'id': 'mock_spot_3',
          'name': 'The Little Mermaid',
          'city': 'Copenhagen',
          'category': 'Landmark',
          'latitude': 55.6929,
          'longitude': 12.5993,
          'rating': 4.2,
          'ratingCount': 5600,
          'coverImage':
              'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800',
          'images': [
            'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800',
          ],
          'tags': ['Landmark', 'Sculpture', 'Photo Spot'],
          'aiSummary': '哥本哈根的标志性雕塑',
        },
      ],
    });
  }
}
