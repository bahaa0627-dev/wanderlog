# Check-in 照片上传功能实现指南

## 功能概述

Check-in 弹窗现在支持上传最多 3 张照片，包含完整的交互体验：
- 图片选择和上传
- 自动压缩（限制 2MB/张）
- 点击放大查看
- 删除功能
- Premium 标签改为 TEST

## 已实现的功能

### 1. 图片选择
- 点击 "Upload photos" 按钮选择图片
- 支持多选（最多 3 张）
- 自动限制数量，超出时显示提示

### 2. 图片压缩
- 每张图片自动压缩到 2MB 以内
- 使用 `flutter_image_compress` 包
- 保持图片质量（85% quality）
- 最大尺寸：1920x1920

### 3. 图片预览
- 100x100 的缩略图网格显示
- Neo-brutalism 风格边框
- 右上角显示删除按钮

### 4. 交互功能
- **点击图片**：全屏查看，支持缩放（InteractiveViewer）
- **点击删除按钮**：移除图片
- **点击背景**：关闭全屏视图

## 关于 R2 费用

### Cloudflare R2 定价
- **存储费用**：$0.015/GB/月
- **上传**：免费
- **下载**：免费（无出站费用）

### 成本估算
假设：
- 每张图片压缩后 1.5MB
- 每个用户平均上传 10 次 check-in，每次 2 张图片
- 1000 个活跃用户

计算：
```
1000 用户 × 10 次 × 2 张 × 1.5MB = 30,000MB = 30GB
30GB × $0.015 = $0.45/月
```

### 成本控制建议
1. ✅ **已实现**：限制每张图片 2MB
2. ✅ **已实现**：限制每次 check-in 最多 3 张
3. 🔄 **建议**：考虑限制每个用户总上传量（如 100MB）
4. 🔄 **建议**：定期清理未使用的图片
5. 🔄 **建议**：对免费用户限制更严格（如 1 张/次）

## 代码修改

### 文件：`check_in_dialog.dart`

#### 新增依赖
```dart
import 'dart:io';
import 'package:image_picker/image_picker.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
```

#### 新增状态变量
```dart
final List<File> _selectedImages = [];
final ImagePicker _imagePicker = ImagePicker();
static const int _maxImages = 3;
static const int _maxImageSizeKB = 2048; // 2MB
```

#### 核心方法
1. `_pickImages()` - 选择图片
2. `_compressImage()` - 压缩图片
3. `_removeImage()` - 删除图片
4. `_viewImageFullScreen()` - 全屏查看
5. `_buildImagePreview()` - 构建预览组件

## 下一步工作

### 1. 后端集成（必需）
需要实现图片上传到 R2 的功能：

```dart
// 在 _submitCheckIn 方法中
Future<void> _submitCheckIn() async {
  // 上传图片到 R2
  final imageUrls = <String>[];
  for (final image in _selectedImages) {
    final url = await _uploadImageToR2(image);
    if (url != null) {
      imageUrls.add(url);
    }
  }
  
  // 保存 check-in 数据（包含图片 URLs）
  await widget.onCheckIn(
    visitDateTime,
    _rating,
    notes.isEmpty ? null : notes,
    imageUrls, // 新增参数
  );
}
```

### 2. 数据库更新
需要在 check-in 表中添加字段存储图片 URLs：

```sql
ALTER TABLE check_ins 
ADD COLUMN images TEXT[]; -- 存储图片 URL 数组
```

### 3. 显示已上传的图片
在 spot 详情页显示 check-in 的图片。

### 4. 编辑模式支持
编辑 check-in 时加载已有图片。

## 测试步骤

1. 运行 `flutter pub get` 安装依赖
2. 重启应用
3. 打开任意 spot 的 check-in 弹窗
4. 点击 "Upload photos" 按钮
5. 选择 1-3 张图片
6. 验证：
   - 图片显示为缩略图
   - 点击图片可全屏查看
   - 点击删除按钮可移除
   - 最多只能选 3 张
   - TEST 标签显示正确

## 权限配置

### iOS (已配置)
`Info.plist` 中已包含：
- `NSPhotoLibraryUsageDescription`
- `NSCameraUsageDescription`

### Android
`image_picker` 包会自动处理权限。

## 注意事项

1. **图片压缩是异步的**，大图片可能需要几秒钟
2. **内存管理**：选择大量图片时注意内存使用
3. **网络上传**：实际上传到 R2 时需要显示进度
4. **错误处理**：网络失败时的重试机制
5. **离线支持**：考虑本地缓存未上传的图片
