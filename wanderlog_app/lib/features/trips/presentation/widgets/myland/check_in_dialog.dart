import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/core/utils/dialog_utils.dart';
import 'package:wanderlog/core/l10n/app_localizations.dart';
import 'package:wanderlog/shared/models/spot_model.dart';

/// Check-in 对话框 - 用户打卡时填写信息
class CheckInDialog extends StatefulWidget {
  const CheckInDialog({
    required this.spot,
    required this.onCheckIn,
    this.initialVisitDate,
    this.initialRating,
    this.initialNotes,
    this.initialPhotos,
    this.isEditMode = false,
    super.key,
  });

  final Spot spot;
  /// Callback with visitDate, rating, notes, newImages (local files), existingPhotos (URLs to keep)
  final Future<void> Function(
    DateTime visitDate, 
    double rating, 
    String? notes,
    {List<File>? newImages,
    List<String>? existingPhotos,}
  ) onCheckIn;
  final DateTime? initialVisitDate;
  final double? initialRating;
  final String? initialNotes;
  final List<String>? initialPhotos; // 已有的图片 URL
  final bool isEditMode;

  @override
  State<CheckInDialog> createState() => _CheckInDialogState();
}

class _CheckInDialogState extends State<CheckInDialog> {
  late DateTime _selectedDate;
  late TimeOfDay _selectedTime;
  late double _rating;
  late final TextEditingController _notesController;
  final List<File> _newImages = []; // 新选择的本地图片
  final List<String> _existingPhotos = []; // 已有的网络图片 URL
  final ImagePicker _imagePicker = ImagePicker();
  static const int _maxImages = 3;
  static const int _maxImageSizeKB = 2048; // 2MB per image

  int get _totalImageCount => _existingPhotos.length + _newImages.length;

  @override
  void initState() {
    super.initState();
    if (widget.initialVisitDate != null) {
      _selectedDate = widget.initialVisitDate!;
      _selectedTime = TimeOfDay.fromDateTime(widget.initialVisitDate!);
    } else {
      _selectedDate = DateTime.now();
      _selectedTime = TimeOfDay.now();
    }
    _rating = widget.initialRating ?? 3.0;
    _notesController = TextEditingController(text: widget.initialNotes ?? '');
    // 加载已有图片
    if (widget.initialPhotos != null) {
      _existingPhotos.addAll(widget.initialPhotos!);
    }
  }

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _selectDate(BuildContext context) async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
      builder: (context, child) => Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: AppTheme.primaryYellow,
              onPrimary: AppTheme.black,
            ),
          ),
          child: child!,
        ),
    );
    if (picked != null && picked != _selectedDate) {
      setState(() {
        _selectedDate = picked;
      });
    }
  }

  Future<void> _selectTime(BuildContext context) async {
    final TimeOfDay? picked = await showTimePicker(
      context: context,
      initialTime: _selectedTime,
      builder: (context, child) => Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: AppTheme.primaryYellow,
              onPrimary: AppTheme.black,
            ),
          ),
          child: child!,
        ),
    );
    if (picked != null && picked != _selectedTime) {
      setState(() {
        _selectedTime = picked;
      });
    }
  }

  Future<void> _pickImages() async {
    if (_totalImageCount >= _maxImages) {
      if (mounted) {
        DialogUtils.showInfoSnackBar(
          context,
          'Maximum $_maxImages photos allowed',
        );
      }
      return;
    }

    try {
      final remainingSlots = _maxImages - _totalImageCount;
      final List<XFile> images = await _imagePicker.pickMultiImage(
        imageQuality: 85,
        limit: remainingSlots,
      );

      if (images.isEmpty) return;

      final imagesToAdd = images.take(remainingSlots).toList();

      for (final image in imagesToAdd) {
        final compressedFile = await _compressImage(File(image.path));
        if (compressedFile != null) {
          setState(() {
            _newImages.add(compressedFile);
          });
        }
      }
    } catch (e) {
      if (mounted) {
        DialogUtils.showInfoSnackBar(
          context,
          'Failed to pick images: $e',
        );
      }
    }
  }

  Future<File?> _compressImage(File file) async {
    try {
      final fileSizeKB = await file.length() ~/ 1024;
      
      if (fileSizeKB <= _maxImageSizeKB) {
        return file;
      }

      final compressedBytes = await FlutterImageCompress.compressWithFile(
        file.absolute.path,
        minWidth: 1920,
        minHeight: 1920,
        quality: 85,
      );

      if (compressedBytes == null) return file;

      final compressedFile = File('${file.path}_compressed.jpg');
      await compressedFile.writeAsBytes(compressedBytes);

      return compressedFile;
    } catch (e) {
      debugPrint('Image compression failed: $e');
      return file;
    }
  }

  void _removeImage(int index) {
    setState(() {
      _newImages.removeAt(index);
    });
  }

  void _removeExistingPhoto(int index) {
    setState(() {
      _existingPhotos.removeAt(index);
    });
  }

  void _viewImageFullScreen(File image) {
    showDialog(
      context: context,
      builder: (context) => Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: EdgeInsets.zero,
        child: Stack(
          children: [
            GestureDetector(
              onTap: () => Navigator.pop(context),
              child: ColoredBox(
                color: Colors.black87,
                child: Center(
                  child: InteractiveViewer(
                    child: Image.file(image),
                  ),
                ),
              ),
            ),
            Positioned(
              top: 40,
              right: 20,
              child: IconButton(
                icon: const Icon(
                  Icons.close,
                  color: Colors.white,
                  size: 32,
                ),
                onPressed: () => Navigator.pop(context),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _viewNetworkImageFullScreen(String imageUrl) {
    showDialog(
      context: context,
      builder: (context) => Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: EdgeInsets.zero,
        child: Stack(
          children: [
            GestureDetector(
              onTap: () => Navigator.pop(context),
              child: ColoredBox(
                color: Colors.black87,
                child: Center(
                  child: InteractiveViewer(
                    child: imageUrl.startsWith('data:')
                        ? Image.memory(_decodeBase64Image(imageUrl)!)
                        : CachedNetworkImage(
                            imageUrl: imageUrl,
                            fit: BoxFit.contain,
                            placeholder: (context, url) => const CircularProgressIndicator(),
                            errorWidget: (context, url, error) => const Icon(Icons.error, color: Colors.white),
                          ),
                  ),
                ),
              ),
            ),
            Positioned(
              top: 40,
              right: 20,
              child: IconButton(
                icon: const Icon(
                  Icons.close,
                  color: Colors.white,
                  size: 32,
                ),
                onPressed: () => Navigator.pop(context),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Uint8List? _decodeBase64Image(String dataUrl) {
    try {
      final base64String = dataUrl.split(',').last;
      return base64Decode(base64String);
    } catch (e) {
      return null;
    }
  }

  Future<void> _submitCheckIn() async {
    final visitDateTime = DateTime(
      _selectedDate.year,
      _selectedDate.month,
      _selectedDate.day,
      _selectedTime.hour,
      _selectedTime.minute,
    );

    final notes = _notesController.text.trim();
    
    // 先关闭对话框，让用户立即看到详情页更新
    if (mounted) {
      Navigator.of(context).pop();
    }
    
    // 然后执行 check-in 操作（详情页会通过 setState 更新）
    await widget.onCheckIn(
      visitDateTime,
      _rating,
      notes.isEmpty ? null : notes,
      newImages: _newImages.isNotEmpty ? _newImages : null,
      existingPhotos: _existingPhotos.isNotEmpty ? _existingPhotos : null,
    );
  }

  @override
  Widget build(BuildContext context) => Dialog(
      backgroundColor: AppTheme.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
        side: const BorderSide(
          color: AppTheme.black,
          width: AppTheme.borderMedium,
        ),
      ),
      insetPadding: const EdgeInsets.symmetric(horizontal: 24),
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 标题
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppTheme.primaryYellow,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: AppTheme.black,
                        width: AppTheme.borderMedium,
                      ),
                    ),
                    child: const Icon(
                      Icons.check_circle,
                      size: 24,
                      color: AppTheme.black,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.isEditMode ? 'Edit Check-in' : 'Check-in Spot',
                          style: AppTheme.headlineMedium(context).copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          widget.spot.name,
                          style: AppTheme.labelMedium(context).copyWith(
                            color: AppTheme.black.withOpacity(0.6),
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // 日期和时间选择
              Text(
                'Visit Date & Time *',
                style: AppTheme.labelMedium(context).copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: _buildDateTimeButton(
                      icon: Icons.calendar_today,
                      label: _formatDate(_selectedDate),
                      onTap: () => _selectDate(context),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _buildDateTimeButton(
                      icon: Icons.access_time,
                      label: _selectedTime.format(context),
                      onTap: () => _selectTime(context),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // 星级评分
              Text(
                'Your Rating *',
                style: AppTheme.labelMedium(context).copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: AppTheme.background,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: AppTheme.black,
                    width: AppTheme.borderThin,
                  ),
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(5, (index) {
                        final starValue = index + 1.0;
                        return GestureDetector(
                          onTap: () {
                            setState(() {
                              _rating = starValue;
                            });
                          },
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 4),
                            child: Icon(
                              _rating >= starValue
                                  ? Icons.star
                                  : Icons.star_border,
                              color: AppTheme.primaryYellow,
                              size: 36,
                            ),
                          ),
                        );
                      }),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _getRatingLabel(_rating),
                      style: AppTheme.bodyMedium(context).copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              // 备注（可选）
              Text(
                'Keep your feeling',
                style: AppTheme.labelMedium(context).copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _notesController,
                maxLines: 3,
                decoration: InputDecoration(
                  hintText: 'How about the vibe? Would you come back here again? Leave your thinking here~',
                  hintStyle: AppTheme.bodySmall(context).copyWith(
                    color: AppTheme.black.withOpacity(0.4),
                  ),
                  filled: true,
                  fillColor: AppTheme.background,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(
                      color: AppTheme.black,
                      width: AppTheme.borderThin,
                    ),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(
                      color: AppTheme.black,
                      width: AppTheme.borderThin,
                    ),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(
                      color: AppTheme.black,
                      width: AppTheme.borderMedium,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              
              // 上传照片按钮和预览
              GestureDetector(
                onTap: _totalImageCount >= _maxImages ? null : _pickImages,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: AppTheme.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: AppTheme.black,
                      width: AppTheme.borderThin,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.add_photo_alternate_outlined,
                        size: 16,
                        color: AppTheme.black,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Upload photos (≤3)',
                        style: AppTheme.labelSmall(context).copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: AppTheme.primaryYellow,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          'TEST',
                          style: AppTheme.labelSmall(context).copyWith(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              
              // 图片预览网格（已有图片 + 新图片）
              if (_existingPhotos.isNotEmpty || _newImages.isNotEmpty) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    // 已有的网络图片
                    ..._existingPhotos.asMap().entries.map((entry) {
                      final index = entry.key;
                      final url = entry.value;
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: _buildExistingPhotoPreview(url, index),
                      );
                    }),
                    // 新选择的本地图片
                    ..._newImages.asMap().entries.map((entry) {
                      final index = entry.key;
                      final image = entry.value;
                      return Padding(
                        padding: EdgeInsets.only(right: index < _newImages.length - 1 ? 8 : 0),
                        child: _buildImagePreview(image, index),
                      );
                    }),
                  ],
                ),
              ],
              const SizedBox(height: 24),

              // 按钮
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppTheme.black,
                        side: const BorderSide(
                          color: AppTheme.black,
                          width: AppTheme.borderMedium,
                        ),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: Text(
                        'Cancel',
                        style: AppTheme.labelLarge(context).copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton(
                      onPressed: _submitCheckIn,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primaryYellow,
                        foregroundColor: AppTheme.black,
                        elevation: 0,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                          side: const BorderSide(
                            color: AppTheme.black,
                            width: AppTheme.borderMedium,
                          ),
                        ),
                      ),
                      child: Text(
                        widget.isEditMode ? 'Save' : 'Check in',
                        style: AppTheme.labelLarge(context).copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );

  Widget _buildDateTimeButton({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) => GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: AppTheme.background,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: AppTheme.black,
            width: AppTheme.borderThin,
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 18, color: AppTheme.black),
            const SizedBox(width: 8),
            Text(
              label,
              style: AppTheme.labelMedium(context).copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      ),
    );

  String _formatDate(DateTime date) => '${date.month}/${date.day}/${date.year}';

  String _getRatingLabel(double rating) {
    if (rating >= 5.0) return 'Amazing!';
    if (rating >= 4.0) return 'Great';
    if (rating >= 3.0) return 'Good';
    if (rating >= 2.0) return 'Ok';
    return 'Not good';
  }

  Widget _buildImagePreview(File image, int index) => Stack(
      children: [
        GestureDetector(
          onTap: () => _viewImageFullScreen(image),
          child: Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: AppTheme.black,
                width: AppTheme.borderMedium,
              ),
              image: DecorationImage(
                image: FileImage(image),
                fit: BoxFit.cover,
              ),
            ),
          ),
        ),
        Positioned(
          top: 4,
          right: 4,
          child: GestureDetector(
            onTap: () => _removeImage(index),
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: AppTheme.black.withOpacity(0.7),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.close,
                size: 14,
                color: AppTheme.white,
              ),
            ),
          ),
        ),
      ],
    );

  Widget _buildExistingPhotoPreview(String imageUrl, int index) => Stack(
      children: [
        GestureDetector(
          onTap: () => _viewNetworkImageFullScreen(imageUrl),
          child: Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: AppTheme.black,
                width: AppTheme.borderMedium,
              ),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: imageUrl.startsWith('data:')
                  ? Image.memory(_decodeBase64Image(imageUrl)!, fit: BoxFit.cover)
                  : CachedNetworkImage(
                      imageUrl: imageUrl,
                      fit: BoxFit.cover,
                      placeholder: (context, url) => const Center(
                        child: SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                      errorWidget: (context, url, error) => const Icon(Icons.error),
                    ),
            ),
          ),
        ),
        Positioned(
          top: 4,
          right: 4,
          child: GestureDetector(
            onTap: () => _removeExistingPhoto(index),
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: AppTheme.black.withOpacity(0.7),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.close,
                size: 14,
                color: AppTheme.white,
              ),
            ),
          ),
        ),
      ],
    );
}
