import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:wanderlog/core/theme/app_theme.dart';
import 'package:wanderlog/features/ai_recognition/presentation/pages/ai_assistant_page.dart';

const String _kAIIntroShownKey = 'ai_intro_shown';

/// AI识别引导底部弹窗 - 仅首次显示
class AIRecognitionIntroSheet extends StatelessWidget {
  const AIRecognitionIntroSheet({super.key});

  /// 检查是否需要显示引导弹窗，首次显示弹窗，后续直接跳转到 AI 对话页面
  static Future<void> showOrOpenAI(BuildContext context) async {
    final prefs = await SharedPreferences.getInstance();
    final hasShown = prefs.getBool(_kAIIntroShownKey) ?? false;
    
    if (!context.mounted) return;
    
    if (hasShown) {
      // 已经显示过，直接跳转到 AI 对话页面
      await _openAIAssistantPage(context);
    } else {
      // 首次显示引导弹窗
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (context) => const AIRecognitionIntroSheet(),
      );
      // 标记已显示
      await prefs.setBool(_kAIIntroShownKey, true);
    }
  }

  /// 直接跳转到 AI Assistant 页面
  static Future<void> _openAIAssistantPage(BuildContext context) async {
    if (!context.mounted) return;
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (context) => const AIAssistantPage(),
      ),
    );
  }

  /// 直接跳转到 AI Assistant 页面（不再检查首次显示）
  static Future<void> show(BuildContext context) async {
    if (!context.mounted) return;
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (context) => const AIAssistantPage(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Container(
        height: MediaQuery.of(context).size.height * 0.65,
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            // 拖拽指示器
            Container(
              margin: const EdgeInsets.only(top: 12),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppTheme.lightGray,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 24),
            // 标题
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'AI recognize and add spots\nto your wishlist',
                  textAlign: TextAlign.left,
                  style: AppTheme.headlineMedium(context),
                ),
              ),
            ),
            const SizedBox(height: 12),
            // 描述
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'You can upload screenshots from Xiaohongshu,\nother platforms or take picture directly',
                  textAlign: TextAlign.left,
                  style: AppTheme.bodyMedium(context).copyWith(
                    color: AppTheme.mediumGray,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 24),
            // 引导示意图
            Expanded(
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 24),
                decoration: BoxDecoration(
                  color: AppTheme.background,
                  borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                  border: Border.all(
                    color: AppTheme.black,
                    width: AppTheme.borderMedium,
                  ),
                ),
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.image_outlined,
                        size: 80,
                        color: AppTheme.mediumGray.withValues(alpha: 0.5),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        '📱 → ✨ → 📍',
                        style: TextStyle(
                          fontSize: 32,
                          color: AppTheme.mediumGray.withValues(alpha: 0.8),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Upload → AI Recognize → Add to Wishlist',
                        style: AppTheme.bodySmall(context).copyWith(
                          color: AppTheme.mediumGray,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 24),
            // 大按钮 - To find your own interest
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: () => _handleFindInterest(context),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryYellow,
                    foregroundColor: AppTheme.black,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppTheme.radiusMedium),
                      side: const BorderSide(
                        color: AppTheme.black,
                        width: AppTheme.borderMedium,
                      ),
                    ),
                    elevation: 0,
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Text('✨', style: TextStyle(fontSize: 20)),
                      const SizedBox(width: 8),
                      Text(
                        'To find your own interest',
                        style: AppTheme.labelLarge(context).copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            SizedBox(height: MediaQuery.of(context).padding.bottom + 24),
          ],
        ),
      );

  Future<void> _handleFindInterest(BuildContext context) async {
    Navigator.pop(context);
    await _openAIAssistantPage(context);
  }
}
