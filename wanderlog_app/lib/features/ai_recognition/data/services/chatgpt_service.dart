import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

/// ChatGPT服务 - 用于处理纯文本对话
class ChatGPTService {
  ChatGPTService({required Dio dio}) : _dio = dio;

  final Dio _dio;

  /// 发送文本消息到ChatGPT并获取回复
  ///
  /// 使用GPT-4模型进行对话
  Future<String> sendMessage(
    String message, {
    List<Map<String, String>>? conversationHistory,
  }) async {
    final apiKey = dotenv.env['OPENAI_API_KEY'] ?? '';
    if (apiKey.isEmpty) {
      throw Exception('OPENAI_API_KEY not configured');
    }

    try {
      // 构建消息历史
      final messages = <Map<String, String>>[
        {
          'role': 'system',
          'content': 'You are a helpful travel assistant. You provide friendly, '
              'informative responses about travel destinations, tips, and recommendations. '
              'Keep your responses concise and engaging.',
        },
        // 添加历史对话（如果有）
        if (conversationHistory != null) ...conversationHistory,
        // 添加当前消息
        {
          'role': 'user',
          'content': message,
        },
      ];

      // 调用OpenAI API
      final response = await _dio.post<Map<String, dynamic>>(
        'https://api.openai.com/v1/chat/completions',
        options: Options(
          headers: {
            'Authorization': 'Bearer $apiKey',
            'Content-Type': 'application/json',
          },
        ),
        data: {
          'model': 'gpt-4', // 使用GPT-4
          'messages': messages,
          'temperature': 0.7,
          'max_tokens': 500,
        },
      );

      if (response.data == null) {
        throw Exception('Empty response from OpenAI API');
      }

      final choices = response.data!['choices'] as List?;
      if (choices == null || choices.isEmpty) {
        throw Exception('No response choices from OpenAI API');
      }

      final firstChoice = choices.first as Map<String, dynamic>;
      final messageData = firstChoice['message'] as Map<String, dynamic>?;
      final content = messageData?['content'] as String?;

      if (content == null || content.isEmpty) {
        throw Exception('Empty content in response');
      }

      return content.trim();
    } on DioException catch (e) {
      print('ChatGPT API error: ${e.response?.data}');
      if (e.response?.statusCode == 401) {
        throw Exception('Invalid API key');
      } else if (e.response?.statusCode == 429) {
        throw Exception('Rate limit exceeded. Please try again later.');
      } else {
        throw Exception('Failed to communicate with ChatGPT: ${e.message}');
      }
    } catch (e) {
      print('ChatGPT service error: $e');
      throw Exception('Failed to get response from ChatGPT: $e');
    }
  }

  /// Mock方法：用于测试，返回模拟回复
  Future<String> sendMessageMock(String message) async {
    // 模拟网络延迟
    await Future<void>.delayed(const Duration(seconds: 1));

    // 根据消息内容返回不同的模拟回复
    if (message.toLowerCase().contains('copenhagen') ||
        message.toLowerCase().contains('哥本哈根')) {
      return '哥本哈根是丹麦的首都，也是一座充满童话色彩的城市！这里有美丽的新港(Nyhavn)彩色房屋、'
          '著名的小美人鱼雕像、还有世界上最古老的游乐园之一——蒂沃利公园。'
          '城市非常适合骑自行车游览，建议您租一辆自行车探索这座城市的魅力。';
    } else if (message.toLowerCase().contains('restaurant') ||
        message.toLowerCase().contains('food') ||
        message.toLowerCase().contains('餐厅') ||
        message.toLowerCase().contains('美食')) {
      return '如果您在寻找美食，我推荐尝试当地的北欧料理！Noma餐厅虽然很贵但绝对值得体验。'
          '如果想要经济实惠的选择，可以试试Torvehallerne食品市场，那里有各种美食摊位。'
          '别忘了尝试丹麦的开放式三明治(Smørrebrød)和传统糕点！';
    } else if (message.toLowerCase().contains('hotel') ||
        message.toLowerCase().contains('accommodation') ||
        message.toLowerCase().contains('住宿') ||
        message.toLowerCase().contains('酒店')) {
      return '住宿方面，我建议您选择市中心或Nørrebro区域，交通便利且氛围很好。'
          'Hotel d\'Angleterre是经典的五星级选择，Generator Copenhagen是性价比很高的青年旅舍。'
          '提前预订通常能获得更好的价格！';
    } else if (message.toLowerCase().contains('weather') ||
        message.toLowerCase().contains('天气')) {
      return '哥本哈根的天气比较多变，建议随身携带雨伞或防水外套。'
          '夏季(6-8月)是最佳旅游季节，气温舒适，白天时间很长。'
          '冬季虽然寒冷，但如果您想体验北欧的圣诞氛围，12月也是不错的选择！';
    } else if (message.toLowerCase().contains('transport') ||
        message.toLowerCase().contains('交通')) {
      return '哥本哈根的公共交通非常发达！我推荐购买Copenhagen Card，'
          '可以无限次乘坐公交、地铁和火车，还包含很多景点的免费门票。'
          '自行车也是很好的选择，城市有完善的自行车道系统。';
    } else {
      return '感谢您的提问！作为您的旅行助手，我很乐意帮助您规划行程、推荐景点、'
          '提供美食建议或解答任何旅行相关的问题。请随时告诉我您想了解什么！';
    }
  }
}
