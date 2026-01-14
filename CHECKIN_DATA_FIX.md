# Check-in 数据丢失问题修复

## 问题描述

在之前的优化中，为了提升 VAGO 页面的加载速度，我添加了一个逻辑：如果已有完整的 check-in 数据，就跳过 `_loadWishlistStatus()` 调用。

但这导致了一个问题：
- 如果从其他页面（如地图页）打开详情页，没有传递初始数据
- 或者初始数据不完整（例如只有 `initialIsSaved` 但没有 `initialIsVisited`）
- 那么 `_loadWishlistStatus()` 可能不会被调用
- 导致 check-in 数据无法显示

## 根本原因

之前的逻辑：
```dart
final hasCompleteCheckInData = _isVisited && _visitDate != null;
if (!hasCompleteCheckInData) {
  _loadWishlistStatus();
}
```

这个逻辑有问题：
- 如果 `_isVisited = false`（初始值），但实际上这个地点已经被 check in 过
- 那么 `hasCompleteCheckInData = false`，会调用 `_loadWishlistStatus()`
- 但如果 `_isVisited = false` 且 `_visitDate = null`，`hasCompleteCheckInData = false`，也会调用
- 看起来逻辑是对的，但实际上可能有边界情况

## 解决方案

**新的策略**：总是在后台加载最新数据，但如果有初始数据就先显示

```dart
@override
void initState() {
  super.initState();
  if (widget.initialIsSaved != null) {
    // 立即使用初始数据（用户看到快速响应）
    _isWishlist = widget.initialIsSaved!;
    _isMustGo = widget.initialIsMustGo ?? false;
    _isTodaysPlan = widget.initialIsTodaysPlan ?? false;
    _isVisited = widget.initialIsVisited ?? false;
    _visitDate = widget.initialVisitDate;
    _userRating = widget.initialUserRating;
    _userNotes = widget.initialUserNotes;
    _userPhotos = widget.initialUserPhotos ?? [];
    _destinationId = widget.initialDestinationId;
    
    // 即使有初始数据，也在后台加载最新数据（但不阻塞 UI）
    // 这样可以确保数据是最新的，同时用户立即看到初始数据
    _loadWishlistStatus();
  } else {
    // 先从缓存同步读取收藏状态，避免闪烁
    _loadWishlistStatusFromCache();
    // 异步加载详细状态
    _loadWishlistStatus();
  }
  // ...
}
```

## 优势

### 1. 数据准确性
- 总是加载最新数据，确保显示的是服务器上的最新状态
- 避免因为初始数据过期导致的显示错误

### 2. 用户体验
- 如果有初始数据，用户立即看到内容（0ms 延迟）
- 后台加载完成后，如果数据有变化会自动更新
- 如果数据没变化，用户不会感知到任何变化

### 3. 兼容性
- 从 VAGO 页面打开：有初始数据，立即显示，后台验证
- 从地图页打开：没有初始数据，先从缓存读取，然后加载
- 从搜索页打开：没有初始数据，先从缓存读取，然后加载

## 性能影响

### VAGO 页面
- **优化前**：打开详情页后等待 500-2000ms
- **优化后（有问题的版本）**：立即显示，但可能数据不准确
- **优化后（修复版本）**：立即显示初始数据，后台加载最新数据

**网络请求**：
- 仍然会发起网络请求，但不阻塞 UI
- 用户看到的是立即响应，体验良好
- 如果数据有变化，会自动更新（例如其他设备修改了 check-in）

### 其他页面
- 没有变化，仍然是先从缓存读取，然后异步加载

## 测试步骤

### 测试 1: VAGO Visited 页面
1. 打开 VAGO → Visited
2. 点击已签到的地点
3. **预期结果**:
   - 立即显示 "Checked in" 和 "Your Visit" 内容
   - 无延迟，无闪烁

### 测试 2: 地图页打开详情页
1. 打开地图页
2. 点击已签到的地点
3. **预期结果**:
   - 显示 "Checked in" 按钮
   - 显示 "Your Visit" 内容
   - 可能有短暂延迟（正常，因为需要加载数据）

### 测试 3: 数据同步
1. 在设备 A 上修改 check-in（例如修改评分）
2. 在设备 B 上打开同一个地点的详情页
3. **预期结果**:
   - 设备 B 显示最新的评分
   - 数据是同步的

### 测试 4: MustGo 和 Today's Plan
1. 打开地图页
2. 点击一个地点，勾选 MustGo 和 Today's Plan
3. 关闭详情页，重新打开
4. **预期结果**:
   - MustGo 和 Today's Plan 仍然是勾选状态
   - 数据没有丢失

## 相关文件

- `wanderlog_app/lib/shared/widgets/unified_spot_detail_modal.dart` - 详情页组件

## 注意事项

1. **网络请求频率**: 每次打开详情页都会发起网络请求，但这是必要的，以确保数据准确性

2. **缓存策略**: 仍然使用 `WishlistStatusCache` 进行同步缓存，确保快速响应

3. **数据一致性**: 如果后台加载的数据与初始数据不同，会自动更新 UI

4. **性能优化**: 虽然会发起网络请求，但不阻塞 UI，用户体验仍然很好

## 后续优化建议

1. **智能刷新**: 只在数据可能过期时才刷新（例如超过 5 分钟）

2. **WebSocket**: 使用 WebSocket 实时同步数据变化，减少轮询

3. **离线支持**: 缓存完整的 check-in 数据到本地，支持离线查看

4. **增量更新**: 只更新变化的字段，减少网络流量
