import 'package:flutter/material.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/shared/models/spot_model.dart';

/// Check-in 对话框 - 用户打卡时填写信息
class CheckInDialog extends StatefulWidget {
  const CheckInDialog({
    required this.spot,
    required this.onCheckIn,
    this.initialVisitDate,
    this.initialRating,
    this.initialNotes,
    this.isEditMode = false,
    super.key,
  });

  final Spot spot;
  final Future<void> Function(DateTime visitDate, double rating, String? notes) onCheckIn;
  final DateTime? initialVisitDate;
  final double? initialRating;
  final String? initialNotes;
  final bool isEditMode;

  @override
  State<CheckInDialog> createState() => _CheckInDialogState();
}

class _CheckInDialogState extends State<CheckInDialog> {
  late DateTime _selectedDate;
  late TimeOfDay _selectedTime;
  late double _rating;
  late final TextEditingController _notesController;

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
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: AppTheme.primaryYellow,
              onPrimary: AppTheme.black,
            ),
          ),
          child: child!,
        );
      },
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
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: AppTheme.primaryYellow,
              onPrimary: AppTheme.black,
            ),
          ),
          child: child!,
        );
      },
    );
    if (picked != null && picked != _selectedTime) {
      setState(() {
        _selectedTime = picked;
      });
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
    await widget.onCheckIn(
      visitDateTime,
      _rating,
      notes.isEmpty ? null : notes,
    );
    if (mounted) {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: AppTheme.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
        side: const BorderSide(
          color: AppTheme.black,
          width: AppTheme.borderMedium,
        ),
      ),
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
              
              // 上传照片按钮
              GestureDetector(
                onTap: () {
                  // TODO: 实现照片上传
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Photo upload coming soon')),
                  );
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryYellow.withOpacity(0.3),
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
                        'Upload photos',
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
                          'PREMIUM',
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
  }

  Widget _buildDateTimeButton({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
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
  }

  String _formatDate(DateTime date) {
    return '${date.month}/${date.day}/${date.year}';
  }

  String _getRatingLabel(double rating) {
    if (rating >= 5.0) return 'Amazing!';
    if (rating >= 4.0) return 'Great';
    if (rating >= 3.0) return 'Good';
    if (rating >= 2.0) return 'Ok';
    return 'Not good';
  }
}
