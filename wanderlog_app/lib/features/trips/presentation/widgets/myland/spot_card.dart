import 'package:flutter/material.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/shared/models/spot_model.dart';

/// 地点卡片组件 - 用于 MyLand 页面展示地点信息
class SpotCard extends StatelessWidget {
  const SpotCard({
    required this.spot,
    required this.onCheckIn,
    super.key,
  });

  final Spot spot;
  final VoidCallback onCheckIn;

  @override
  Widget build(BuildContext context) {
    // 是否已打卡（临时用 tag 标记，后续替换为真实字段）
    final bool isCheckedIn = spot.tags.any(
      (tag) => tag.toLowerCase() == 'visited',
    );

    return GestureDetector(
      onTap: () {
        // TODO: 导航到地点详情页
      },
      child: Container(
        decoration: BoxDecoration(
          color: AppTheme.white,
          borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
          border: Border.all(
            color: AppTheme.black,
            width: AppTheme.borderMedium,
          ),
          boxShadow: AppTheme.cardShadow,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 封面图和星标
            Stack(
              children: [
                // 封面图
                ClipRRect(
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(AppTheme.radiusMedium - 2),
                  ),
                  child: AspectRatio(
                    aspectRatio: 16 / 9,
                    child: spot.images.isNotEmpty
                        ? Image.network(
                            spot.images.first,
                            fit: BoxFit.cover,
                            errorBuilder: (context, error, stackTrace) =>
                                _buildPlaceholder(),
                          )
                        : _buildPlaceholder(),
                  ),
                ),
                
                // 星标按钮（右上角）
                Positioned(
                  top: 8,
                  right: 8,
                  child: GestureDetector(
                    onTap: () {
                      // TODO: 切换星标状态
                    },
                    child: Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        color: AppTheme.white,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: AppTheme.black,
                          width: AppTheme.borderThin,
                        ),
                      ),
                      child: const Icon(
                        Icons.star_outline,
                        size: 18,
                        color: AppTheme.black,
                      ),
                    ),
                  ),
                ),
              ],
            ),

            // 地点信息
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // 地名
                  Text(
                    spot.name,
                    style: AppTheme.bodyLarge(context).copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 8),

                  // 评分和评分人数
                  if (spot.rating != null)
                    Row(
                      children: [
                        const Icon(
                          Icons.star,
                          size: 16,
                          color: AppTheme.primaryYellow,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          spot.rating!.toStringAsFixed(1),
                          style: AppTheme.labelMedium(context).copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(width: 4),
                        Text(
                          '(1.2k)', // TODO: 从数据源获取评分人数
                          style: AppTheme.labelSmall(context).copyWith(
                            color: AppTheme.black.withOpacity(0.6),
                          ),
                        ),
                      ],
                    ),
                  const SizedBox(height: 8),

                  // 营业时间状态和门票价格
                  Row(
                    children: [
                      // 营业时间状态
                      _buildOpeningStatus(context),
                      
                      const SizedBox(width: 8),
                      
                      // 门票价格
                      if (spot.priceLevel != null && spot.priceLevel! > 0)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: AppTheme.primaryYellow.withOpacity(0.2),
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
                                Icons.confirmation_number_outlined,
                                size: 12,
                                color: AppTheme.black,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                '\$${spot.priceLevel! * 10}', // 简化的价格显示
                                style: AppTheme.labelSmall(context).copyWith(
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),

                  // 标签
                  if (spot.tags.isNotEmpty)
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: spot.tags.take(3).map((tag) {
                        return Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: AppTheme.background,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: AppTheme.black,
                              width: AppTheme.borderThin,
                            ),
                          ),
                          child: Text(
                            tag,
                            style: AppTheme.labelSmall(context),
                          ),
                        );
                      }).toList(),
                    ),

                  const SizedBox(height: 12),

                  // Check-in 按钮
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: isCheckedIn ? null : onCheckIn,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: isCheckedIn
                            ? AppTheme.background
                            : AppTheme.primaryYellow,
                        foregroundColor: AppTheme.black,
                        elevation: 0,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                          side: BorderSide(
                            color: AppTheme.black,
                            width: AppTheme.borderMedium,
                          ),
                        ),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            isCheckedIn
                                ? Icons.check_circle
                                : Icons.check_circle_outline,
                            size: 18,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            isCheckedIn ? 'Checked in' : 'Check-in',
                            style: AppTheme.labelMedium(context).copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPlaceholder() {
    return Container(
      color: AppTheme.background,
      child: const Center(
        child: Icon(
          Icons.image_outlined,
          size: 40,
          color: Colors.grey,
        ),
      ),
    );
  }

  Widget _buildOpeningStatus(BuildContext context) {
    // TODO: 根据实际营业时间计算状态
    const String statusText = 'Open now';
    const Color statusColor = Colors.green;

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 8,
        vertical: 4,
      ),
      decoration: BoxDecoration(
        color: statusColor.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: statusColor,
          width: AppTheme.borderThin,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: statusColor,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 4),
          Text(
            statusText,
            style: AppTheme.labelSmall(context).copyWith(
              color: statusColor,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}
