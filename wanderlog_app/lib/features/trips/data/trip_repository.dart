import 'package:dio/dio.dart';
import 'package:wanderlog/shared/models/trip_model.dart';
import 'package:wanderlog/shared/models/trip_spot_model.dart';

class TripRepository {
  TripRepository(this._dio);
  final Dio _dio;

  Future<List<Trip>> getMyTrips() async {
    try {
      print('🚀 [TripRepository] Starting API request to /destinations...');
      final apiStartTime = DateTime.now();

      final response = await _dio.get<List<dynamic>>('/destinations');
      print(
        '🚀 [TripRepository] Response status: ${response.statusCode}, type: ${response.data.runtimeType}',
      );
      final apiDuration =
          DateTime.now().difference(apiStartTime).inMilliseconds;
      print('🚀 [TripRepository] API request completed in ${apiDuration}ms');

      final parseStartTime = DateTime.now();
      final List<dynamic> data = response.data as List<dynamic>;
      if (data.isNotEmpty) {
        final first = data.first;
        if (first is Map<String, dynamic>) {
          print('🚀 [TripRepository] First trip keys: ${first.keys.toList()}');
          final tripSpots = first['tripSpots'];
          final spotCount = tripSpots is List ? tripSpots.length : 0;
          print('🚀 [TripRepository] First trip tripSpots: $spotCount');
        }
      }
      final trips = data
          .map((json) => Trip.fromJson(json as Map<String, dynamic>))
          .toList();
      final parseDuration =
          DateTime.now().difference(parseStartTime).inMilliseconds;

      print(
        '🚀 [TripRepository] Parsed ${trips.length} trips in ${parseDuration}ms',
      );
      print('🚀 [TripRepository] Total time: ${apiDuration + parseDuration}ms');

      return trips;
    } on DioException catch (e) {
      print('❌ [TripRepository] API error: ${e.message}');
      throw _handleError(e);
    }
  }

  Future<Trip> getTripById(String id) async {
    try {
      final response =
          await _dio.get<Map<String, dynamic>>('/destinations/$id');
      return Trip.fromJson(response.data!);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  Future<Trip> createTrip({
    required String name,
    String? city,
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/destinations',
        data: {
          'name': name,
          'city': city,
          'startDate': startDate?.toIso8601String(),
          'endDate': endDate?.toIso8601String(),
        },
      );
      return Trip.fromJson(response.data!);
    } on DioException catch (e) {
      throw _handleError(e);
    }
  }

  /// 管理 trip spot - 使用新的布尔字段
  Future<TripSpot?> manageTripSpot({
    required String tripId,
    required String spotId,
    // 新的布尔字段
    bool? isSaved,
    bool? isVisited,
    bool? isMustGo,
    bool? isTodaysPlan,
    // 其他字段
    DateTime? visitDate,
    int? userRating,
    String? userNotes,
    List<String>? userPhotos,
    Map<String, dynamic>? spotPayload,
    bool remove = false,
    // 旧字段（兼容，将被废弃）
    @Deprecated('Use isSaved/isVisited/isTodaysPlan instead')
    TripSpotStatus? status,
    @Deprecated('Use isMustGo instead') SpotPriority? priority,
  }) async {
    try {
      final Map<String, dynamic> data = {
        'spotId': spotId,
      };

      if (remove) {
        data['remove'] = true;
      }

      // 新的布尔字段
      if (isSaved != null) data['isSaved'] = isSaved;
      if (isVisited != null) data['isVisited'] = isVisited;
      if (isMustGo != null) data['isMustGo'] = isMustGo;
      if (isTodaysPlan != null) data['isTodaysPlan'] = isTodaysPlan;

      // 旧字段（兼容）
      // ignore: deprecated_member_use_from_same_package
      if (status != null) data['status'] = _statusToServer(status);
      // ignore: deprecated_member_use_from_same_package
      if (priority != null) data['priority'] = _priorityToServer(priority);

      if (visitDate != null) data['visitDate'] = visitDate.toIso8601String();
      if (userRating != null) data['userRating'] = userRating;
      if (userNotes != null) data['userNotes'] = userNotes;
      if (userPhotos != null) data['userPhotos'] = userPhotos;
      if (spotPayload != null) data['spot'] = spotPayload;

      print('🌐 [TripRepository] PUT /destinations/$tripId/spots');
      print('🌐 [TripRepository] Request data: $data');

      final response = await _dio.put<Map<String, dynamic>>(
        '/destinations/$tripId/spots',
        data: data,
      );

      print('🌐 [TripRepository] Response status: ${response.statusCode}');
      print('🌐 [TripRepository] Response data: ${response.data}');

      if (remove) return null;
      return TripSpot.fromJson(response.data!);
    } on DioException catch (e) {
      print('❌ [TripRepository] DioException: ${e.message}');
      print('❌ [TripRepository] Response: ${e.response?.data}');
      throw _handleError(e);
    }
  }

  String _statusToServer(TripSpotStatus status) {
    switch (status) {
      case TripSpotStatus.wishlist:
        return 'WISHLIST';
      case TripSpotStatus.todaysPlan:
        return 'TODAYS_PLAN';
      case TripSpotStatus.visited:
        return 'VISITED';
    }
  }

  String _priorityToServer(SpotPriority priority) {
    switch (priority) {
      case SpotPriority.mustGo:
        return 'MUST_GO';
      case SpotPriority.optional:
        return 'OPTIONAL';
    }
  }

  String _handleError(DioException e) {
    if (e.response != null) {
      final message = e.response?.data['message'];
      if (message != null) return message as String;
    }
    return e.message ?? 'An error occurred';
  }
}
