# Mine 页面更新

## 需要的修改

### 1. Loading 状态 - 整页居中显示

**文件**: `wanderlog_app/lib/features/profile/presentation/pages/mine_page.dart`

**位置**: `_buildLoadingState` 方法（约第82-140行）

**修改前**: 两个独立的 loading skeleton（地图和照片墙）

**修改后**: 整页居中显示 "Try to find your memories..."

```dart
Widget _buildLoadingState(BuildContext context) {
  return CustomScrollView(
    controller: _scrollController,
    slivers: [
      // Header
      SliverToBoxAdapter(
        child: _buildHeader(context),
      ),
      // Centered loading indicator
      SliverFillRemaining(
        hasScrollBody: false,
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const CircularProgressIndicator(),
              const SizedBox(height: 16),
              Text(
                'Try to find your memories...',
                style: TextStyle(
                  color: AppTheme.mediumGray,
                  fontSize: 16,
                ),
              ),
            ],
          ),
        ),
      ),
    ],
  );
}
```

### 2. 空照片墙状态 - 使用 photo wall.png

**当前状态**: 使用 `no_photo_wall.png`（已经是正确的）

**文件**: `wanderlog_app/lib/features/profile/presentation/widgets/photo_wall.dart`

**位置**: 第64行

已经正确使用:
```dart
Image.asset(
  'assets/images/no_photo_wall.png',
  fit: BoxFit.contain,
),
```

**action required**: 
1. 将 `/Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/photo wall.png` 复制为 `no_photo_wall.png`（如果还没有）
2. 确保在 `pubspec.yaml` 中已注册

### 实施步骤

1. **修改 mine_page.dart 的 _buildLoadingState 方法**
   - 删除地图和照片墙的独立 skeleton
   - 使用 SliverFillRemaining 居中显示 loading 提示

2. **检查 assets**
   ```bash
   # 确认 photo wall.png 已复制到 assets/images/
   ls -la wanderlog_app/assets/images/no_photo_wall.png
   ```

3. **热重载 Flutter app**
   - 按 `r` 键热重载
   - 测试 loading 状态显示

### 预期效果

**Loading 状态**:
- 整个页面居中显示转圈动画
- 下方显示 "Try to find your memories..."
- 简洁清爽，不会有分块的 skeleton

**空照片墙**:
- 显示 photo wall.png 图片
- 文案: "No photos yet"
- 提示: "Check in to places to see your photos here"
