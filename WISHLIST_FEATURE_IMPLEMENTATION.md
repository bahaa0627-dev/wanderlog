# 地点收藏（Wishlist）功能实现说明

## 功能概述
实现了单个地点的收藏功能，用户可以点击"Add to Wishlist"按钮将地点添加到收藏列表。

## 实现的功能

### 1. 前端功能（Flutter）

#### SpotDetailModal 增强
位置：`wanderlog_app/lib/features/map/presentation/pages/map_page_new.dart`

**新增/修改的功能：**
- ✅ "Add to Wishlist" 按钮（已存在，优化了交互）
- ✅ 登录状态检查（使用 `requireAuth()`）
- ✅ 未登录自动跳转到登录页
- ✅ 使用 CustomToast 显示 "added to wishlist" 成功消息
- ✅ 自动创建 destination（如果该城市不存在）

**关键代码逻辑：**
```dart
Future<bool> _handleAddWishlist() async {
  setState(() => _isActionLoading = true);
  try {
    // 1. 检查登录状态
    final authed = await requireAuth(context, ref);
    if (!authed) return false;
    
    // 2. 确保城市的 destination 存在
    final destId = await ensureDestinationForCity(ref, widget.spot.city);
    if (destId == null) {
      _showError('Failed to create destination');
      return false;
    }
    
    // 3. 添加地点到 wishlist
    _destinationId = destId;
    await ref.read(tripRepositoryProvider).manageTripSpot(
      tripId: destId,
      spotId: widget.spot.id,
      status: TripSpotStatus.wishlist,
      spotPayload: _spotPayload(),
    );
    
    // 4. 更新 UI 状态
    if (mounted) {
      setState(() => _isWishlist = true);
    }
    return true;
  } catch (e) {
    _showError('Error: $e');
    return false;
  } finally {
    if (mounted) {
      setState(() => _isActionLoading = false);
    }
  }
}
```

#### 辅助工具函数
位置：`wanderlog_app/lib/shared/utils/destination_utils.dart`

**requireAuth()** - 登录状态检查
```dart
Future<bool> requireAuth(BuildContext context, WidgetRef ref) async {
  final auth = ref.read(authProvider);
  if (auth.isAuthenticated) return true;
  
  // 未登录，跳转到登录页
  final result = await context.push('/login');
  return result == true;
}
```

**ensureDestinationForCity()** - 自动创建或获取 destination
```dart
Future<String?> ensureDestinationForCity(WidgetRef ref, String city) async {
  final normalized = city.trim();
  if (normalized.isEmpty) return null;

  final repo = ref.read(tripRepositoryProvider);
  final trips = await repo.getMyTrips();
  
  // 检查是否已存在该城市的 destination
  Trip? existing;
  for (final t in trips) {
    if ((t.city ?? '').toLowerCase() == normalized.toLowerCase()) {
      existing = t;
      break;
    }
  }

  if (existing != null) {
    return existing.id;
  }

  // 不存在则创建新的 destination
  final created = await repo.createTrip(
    name: normalized,
    city: normalized,
  );
  
  // 刷新缓存
  ref.invalidate(tripsProvider);
  return created.id;
}
```

### 2. 后端功能（Node.js/Express）

#### 地点排序优化
位置：`wanderlog_api/src/controllers/tripController.ts`

**修改内容：**
在 `getTripById` 中添加了排序逻辑，使新添加的地点出现在列表最前面：

```typescript
const trip = await prisma.trip.findUnique({
  where: { id },
  include: {
    tripSpots: {
      include: {
        place: true,
      },
      orderBy: {
        createdAt: 'desc', // 新添加的地点出现在最前面
      },
    },
  },
});
```

## 用户交互流程

```
1. 用户点击地点卡片
   ↓
2. 打开 SpotDetailModal（地点详情弹窗）
   ↓
3. 用户点击 "Add to Wishlist" 按钮
   ↓
4. 系统检查登录状态
   ├─ 未登录 → 跳转到登录页
   │            ↓
   │          用户登录
   │            ↓
   └─ 已登录 → 继续
   ↓
5. 检查该城市是否有 destination
   ├─ 不存在 → 自动创建新 destination（名称=城市名）
   └─ 已存在 → 使用现有 destination
   ↓
6. 添加地点到 destination 的 wishlist
   ↓
7. 显示 CustomToast：
   "added to wishlist" （绿色成功提示）
   ↓
8. 新地点出现在 "My Land - All" 列表的最前面
```

## 数据库模型

### Trip（Destination）
```prisma
model Trip {
  id         String     @id @default(cuid())
  userId     String
  user       User       @relation(fields: [userId], references: [id])
  name       String      // 城市名称
  city       String?     // 城市标识
  startDate  DateTime?
  endDate    DateTime?
  status     String     @default("PLANNING")
  tripSpots  TripSpot[]
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt
}
```

### TripSpot
```prisma
model TripSpot {
  id         String    @id @default(cuid())
  tripId     String
  trip       Trip      @relation(fields: [tripId], references: [id])
  placeId    String
  place      Place     @relation(fields: [placeId], references: [id])
  status     String    @default("WISHLIST")  // 默认为 WISHLIST
  priority   String    @default("OPTIONAL")
  createdAt  DateTime  @default(now())       // 用于排序
  updatedAt  DateTime  @updatedAt
  
  @@unique([tripId, placeId])
}
```

## 测试场景

### 场景 1：未登录用户添加收藏
1. 以未登录状态打开应用
2. 浏览地图，点击任意地点
3. 在地点详情弹窗中点击 "Add to Wishlist"
4. **预期结果**：自动跳转到登录页

### 场景 2：已登录用户添加新城市的地点
1. 以已登录状态打开应用
2. 点击一个之前未收藏过的城市的地点（如巴黎的埃菲尔铁塔）
3. 点击 "Add to Wishlist"
4. **预期结果**：
   - 显示 toast："added to wishlist"
   - 自动创建名为 "Paris" 的 destination
   - 该地点添加到新 destination 的 wishlist

### 场景 3：已登录用户添加已有城市的地点
1. 已经有 "Tokyo" 的 destination
2. 点击东京的另一个地点
3. 点击 "Add to Wishlist"
4. **预期结果**：
   - 显示 toast："added to wishlist"
   - 地点添加到现有的 "Tokyo" destination
   - 不创建新的 destination

### 场景 4：验证地点排序
1. 添加多个地点到同一个 destination
2. 打开 "My Land - All" 或该 destination 的详情页
3. **预期结果**：最新添加的地点出现在列表最前面

### 场景 5：重复添加处理
1. 添加一个地点到 wishlist
2. 再次点击同一地点的 "Add to Wishlist"
3. **预期结果**：
   - 按钮文本变为 "Added"
   - 不会创建重复的记录（数据库约束 `@@unique([tripId, placeId])`）

## API 端点

### 添加地点到 Trip/Destination
```
PUT /api/destinations/:id/spots
```

**请求体：**
```json
{
  "spotId": "place_id_123",
  "status": "WISHLIST",
  "spot": {
    "name": "Eiffel Tower",
    "city": "Paris",
    "latitude": 48.8584,
    "longitude": 2.2945,
    "rating": 4.7,
    "images": ["url1", "url2"],
    "category": "landmark",
    "tags": ["iconic", "must-visit"]
  }
}
```

**响应：**
```json
{
  "id": "tripspot_id_456",
  "tripId": "trip_id_789",
  "placeId": "place_id_123",
  "status": "WISHLIST",
  "priority": "OPTIONAL",
  "createdAt": "2025-12-18T10:30:00Z",
  "place": { ... }
}
```

## 依赖关系

### 前端依赖
- `flutter_riverpod` - 状态管理
- `go_router` - 路由导航
- `dio` - HTTP 请求

### 后端依赖
- `prisma` - ORM
- `express` - Web 框架
- `JWT` - 认证

## 相关文件

### 前端文件
```
wanderlog_app/
├── lib/
│   ├── features/
│   │   ├── map/presentation/pages/
│   │   │   └── map_page_new.dart          # SpotDetailModal
│   │   ├── auth/providers/
│   │   │   └── auth_provider.dart         # 认证状态管理
│   │   └── trips/
│   │       ├── data/
│   │       │   └── trip_repository.dart   # Trip API 调用
│   │       └── providers/
│   │           └── trips_provider.dart    # Trip 状态管理
│   └── shared/
│       ├── utils/
│       │   └── destination_utils.dart     # 辅助工具函数
│       └── widgets/
│           └── custom_toast.dart          # Toast 组件
```

### 后端文件
```
wanderlog_api/
├── src/
│   ├── controllers/
│   │   └── tripController.ts             # Trip 控制器
│   ├── routes/
│   │   └── tripRoutes.ts                 # Trip 路由
│   └── middleware/
│       └── auth.ts                        # 认证中间件
└── prisma/
    └── schema.prisma                      # 数据库模型
```

## 注意事项

1. **登录状态持久化**：使用 `StorageService` 保存 token
2. **错误处理**：所有异常都会显示 CustomToast 错误提示
3. **网络请求**：使用 Dio 拦截器自动添加 Authorization header
4. **数据同步**：添加成功后自动刷新 trips 缓存（`ref.invalidate(tripsProvider)`）
5. **UI 反馈**：loading 状态下按钮禁用，防止重复提交

## 未来优化建议

1. **离线支持**：使用本地数据库缓存 wishlist
2. **批量操作**：支持一次添加多个地点
3. **智能推荐**：根据已收藏的地点推荐相似地点
4. **分享功能**：分享 wishlist 给朋友
5. **排序选项**：支持按评分、距离等排序

