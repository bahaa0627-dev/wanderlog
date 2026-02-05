import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:image_picker/image_picker.dart';
import 'package:image_gallery_saver/image_gallery_saver.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/shared/widgets/custom_toast.dart';

/// 合拍编辑器页面 - 上方剧照，下方用户照片，竖向 4:3 比例
class PhotoCompareEditorPage extends StatefulWidget {
  const PhotoCompareEditorPage({
    required this.stillImageUrl,
    required this.movieName,
    required this.placeName,
    super.key,
  });

  final String stillImageUrl;
  final String movieName;
  final String placeName;

  @override
  State<PhotoCompareEditorPage> createState() => _PhotoCompareEditorPageState();
}

class _PhotoCompareEditorPageState extends State<PhotoCompareEditorPage> {
  final GlobalKey _repaintBoundaryKey = GlobalKey();
  final GlobalKey _exportBoundaryKey = GlobalKey(); // 用于导出的无边框版本
  final ImagePicker _picker = ImagePicker();
  
  File? _userPhoto;
  bool _isSaving = false;

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    // 竖向 4:3 比例，宽度为屏幕宽度减去边距
    final editorWidth = screenWidth - 48;
    final editorHeight = editorWidth * 4 / 3;
    // 减去 border (2*2=4) 和分隔线 (2)
    final halfHeight = (editorHeight - 4 - 2) / 2;
    // 导出用的高度（无边框无分隔线）
    final exportHalfHeight = editorHeight / 2;

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: _buildAppBar(),
      body: Stack(
        children: [
          // 主内容
          SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                // 显示用的编辑器（带圆角和边框）
                Container(
                  width: editorWidth,
                  height: editorHeight,
                  decoration: BoxDecoration(
                    color: AppTheme.white,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppTheme.black, width: 2),
                    boxShadow: AppTheme.cardShadow,
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(14),
                    child: Column(
                      children: [
                        // 上半部分：剧照
                        SizedBox(
                          width: editorWidth,
                          height: halfHeight,
                          child: Image.network(
                            widget.stillImageUrl,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => ColoredBox(
                              color: AppTheme.lightGray,
                              child: const Center(
                                child: Icon(
                                  Icons.broken_image_outlined,
                                  color: AppTheme.mediumGray,
                                  size: 48,
                                ),
                              ),
                            ),
                          ),
                        ),
                        // 分隔线
                        Container(height: 2, color: AppTheme.black),
                        // 下半部分：用户照片或上传提示
                        SizedBox(
                          width: editorWidth,
                          height: halfHeight,
                          child: _userPhoto != null
                              ? _buildUserPhotoSection()
                              : _buildUploadPlaceholder(),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                // 操作按钮
                if (_userPhoto == null)
                  _buildAddPhotoButtons()
                else
                  _buildActionButtons(),
              ],
            ),
          ),
          // 隐藏的导出用版本（无边框、无圆角、无分隔线，带水印）
          if (_userPhoto != null)
            Positioned(
              left: -9999, // 移出屏幕
              child: RepaintBoundary(
                key: _exportBoundaryKey,
                child: SizedBox(
                  width: editorWidth,
                  height: editorHeight,
                  child: Stack(
                    children: [
                      Column(
                        children: [
                          // 上半部分：剧照
                          SizedBox(
                            width: editorWidth,
                            height: exportHalfHeight,
                            child: Image.network(
                              widget.stillImageUrl,
                              fit: BoxFit.cover,
                            ),
                          ),
                          // 下半部分：用户照片
                          SizedBox(
                            width: editorWidth,
                            height: exportHalfHeight,
                            child: Image.file(_userPhoto!, fit: BoxFit.cover),
                          ),
                        ],
                      ),
                      // VAGO 水印 - 右下角
                      Positioned(
                        right: 12,
                        bottom: 12,
                        child: Text(
                          'VAGO',
                          style: TextStyle(
                            fontFamily: 'Reem Kufi',
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Colors.white.withOpacity(0.6),
                            shadows: [
                              Shadow(
                                color: Colors.black.withOpacity(0.3),
                                blurRadius: 4,
                                offset: const Offset(1, 1),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  PreferredSizeWidget _buildAppBar() => AppBar(
      backgroundColor: AppTheme.white,
      elevation: 0,
      leading: IconButton(
        icon: const Icon(Icons.arrow_back, color: AppTheme.black),
        onPressed: () => Navigator.pop(context),
      ),
      title: Text(
        'Photo Collage',
        style: AppTheme.headlineMedium(context).copyWith(
          fontWeight: FontWeight.bold,
        ),
      ),
      centerTitle: true,
    );

  Widget _buildUserPhotoSection() => Image.file(_userPhoto!, fit: BoxFit.cover);

  Widget _buildUploadPlaceholder() => Container(
      color: AppTheme.lightGray,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.white,
              shape: BoxShape.circle,
              border: Border.all(color: AppTheme.black, width: 2),
            ),
            child: const Icon(Icons.add_a_photo, size: 32, color: AppTheme.black),
          ),
          const SizedBox(height: 12),
          Text(
            'Add your photo',
            style: AppTheme.labelLarge(context).copyWith(
              color: AppTheme.darkGray,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Text(
              'Take a photo at the same location to create your memory',
              style: AppTheme.bodySmall(context).copyWith(
                color: AppTheme.mediumGray,
              ),
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    );

  /// 两个按钮：拍照 和 相册（普通黑色边框样式）
  Widget _buildAddPhotoButtons() => Row(
      children: [
        // 拍照按钮
        Expanded(
          child: GestureDetector(
            onTap: _takePhoto,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 16),
              decoration: BoxDecoration(
                color: AppTheme.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppTheme.black, width: 2),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.camera_alt, color: AppTheme.black, size: 22),
                  const SizedBox(width: 8),
                  Text(
                    'Take Photo',
                    style: AppTheme.labelLarge(context).copyWith(
                      fontWeight: FontWeight.bold,
                      color: AppTheme.black,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        // 相册按钮
        Expanded(
          child: GestureDetector(
            onTap: _pickFromGallery,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 16),
              decoration: BoxDecoration(
                color: AppTheme.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppTheme.black, width: 2),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.photo_library, color: AppTheme.black, size: 22),
                  const SizedBox(width: 8),
                  Text(
                    'Gallery',
                    style: AppTheme.labelLarge(context).copyWith(
                      fontWeight: FontWeight.bold,
                      color: AppTheme.black,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );

  Widget _buildActionButtons() => Row(
      children: [
        // 重新选择按钮
        Expanded(
          child: GestureDetector(
            onTap: _showPhotoSourceDialog,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 16),
              decoration: BoxDecoration(
                color: AppTheme.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppTheme.black, width: 2),
                boxShadow: AppTheme.cardShadow,
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.refresh, color: AppTheme.black, size: 20),
                  const SizedBox(width: 8),
                  Text(
                    'Change',
                    style: AppTheme.labelLarge(context).copyWith(
                      fontWeight: FontWeight.bold,
                      color: AppTheme.black,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        // 保存按钮
        Expanded(
          flex: 2,
          child: GestureDetector(
            onTap: _isSaving ? null : _saveToGallery,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 16),
              decoration: BoxDecoration(
                color: _isSaving ? AppTheme.lightGray : AppTheme.primaryYellow,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppTheme.black, width: 2),
                boxShadow: AppTheme.cardShadow,
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (_isSaving)
                    const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.black),
                    )
                  else
                    const Icon(Icons.download, color: AppTheme.black, size: 20),
                  const SizedBox(width: 8),
                  Text(
                    _isSaving ? 'Saving...' : 'Save to Gallery',
                    style: AppTheme.labelLarge(context).copyWith(
                      fontWeight: FontWeight.bold,
                      color: AppTheme.black,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );

  void _showPhotoSourceDialog() {
    showModalBottomSheet<void>(
      context: context,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.camera_alt),
                title: const Text('Camera'),
                onTap: () {
                  Navigator.pop(context);
                  _takePhoto();
                },
              ),
              ListTile(
                leading: const Icon(Icons.photo_library),
                title: const Text('Photo Library'),
                onTap: () {
                  Navigator.pop(context);
                  _pickFromGallery();
                },
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _takePhoto() async {
    try {
      final XFile? image = await _picker.pickImage(
        source: ImageSource.camera,
        maxWidth: 1920,
        maxHeight: 1920,
        imageQuality: 90,
      );
      if (image != null && mounted) {
        setState(() => _userPhoto = File(image.path));
      }
    } catch (e) {
      if (mounted) {
        CustomToast.showError(context, 'Failed to take photo');
      }
    }
  }

  Future<void> _pickFromGallery() async {
    try {
      final XFile? image = await _picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1920,
        maxHeight: 1920,
        imageQuality: 90,
      );
      if (image != null && mounted) {
        setState(() => _userPhoto = File(image.path));
      }
    } catch (e) {
      if (mounted) {
        CustomToast.showError(context, 'Failed to pick image');
      }
    }
  }

  Future<void> _saveToGallery() async {
    if (_userPhoto == null) return;
    
    try {
      // 请求存储权限 - iOS 14+ 使用 photosAddOnly 保存图片
      PermissionStatus status;
      if (Platform.isIOS) {
        // 先尝试 photosAddOnly（仅添加权限，iOS 14+）
        status = await Permission.photosAddOnly.request();
        // 模拟器上权限可能返回 denied，但实际可以保存，所以继续尝试
      } else {
        status = await Permission.storage.request();
        // Android 权限被拒绝，显示引导弹窗
        if (!status.isGranted) {
          if (mounted) {
            await _showPermissionDialog();
          }
          return;
        }
      }
      
      // 开始保存（显示加载状态）
      setState(() => _isSaving = true);
      
      // 等待一帧确保导出视图已渲染
      await Future<void>.delayed(const Duration(milliseconds: 100));
      
      // 捕获合成图片（使用导出用的无边框版本）
      final boundary = _exportBoundaryKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
      if (boundary == null) throw Exception('Failed to capture image');
      
      final image = await boundary.toImage(pixelRatio: 3.0);
      final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
      if (byteData == null) throw Exception('Failed to convert image');
      
      final pngBytes = byteData.buffer.asUint8List();
      
      // 保存到相册
      final result = await ImageGallerySaver.saveImage(
        Uint8List.fromList(pngBytes),
        quality: 100,
        name: 'photo_collage_${DateTime.now().millisecondsSinceEpoch}',
      );
      
      if (result['isSuccess'] == true) {
        if (mounted) CustomToast.showSuccess(context, 'Saved successfully');
      } else {
        // iOS 上保存失败可能是权限问题
        if (Platform.isIOS && mounted) {
          setState(() => _isSaving = false);
          await _showPermissionDialog();
        } else {
          throw Exception('Failed to save image');
        }
      }
    } catch (e) {
      if (mounted) {
        // 如果是权限相关错误，显示权限弹窗
        if (e.toString().contains('permission') || e.toString().contains('denied')) {
          setState(() => _isSaving = false);
          await _showPermissionDialog();
        } else {
          CustomToast.showError(context, 'Failed to save');
        }
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  Future<void> _showPermissionDialog() async {
    final shouldOpenSettings = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppTheme.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppTheme.black, width: 2),
        ),
        title: Text(
          'Permission Required',
          style: AppTheme.headlineMedium(context).copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Text(
          'Photo library access is required to save your photo collage. Please enable it in Settings.',
          style: AppTheme.bodyMedium(context),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(
              'Cancel',
              style: AppTheme.labelLarge(context).copyWith(
                color: AppTheme.mediumGray,
              ),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(
              'Open Settings',
              style: AppTheme.labelLarge(context).copyWith(
                color: AppTheme.accentBlue,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
    );
    
    if (shouldOpenSettings ?? false) {
      await openAppSettings();
    }
  }
}
