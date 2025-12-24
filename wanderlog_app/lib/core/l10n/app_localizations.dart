/// 简单的本地化支持
class AppLocalizations {
  AppLocalizations(this.languageCode);
  
  final String languageCode;
  
  bool get isEnglish => languageCode == 'en';
  bool get isChinese => languageCode == 'zh';

  // Settings 页面
  String get settingsTitle => isEnglish ? 'Settings' : '设置';
  
  // Account
  String get accountTitle => isEnglish ? 'Account' : '账户';
  String get accountNotLoggedIn => isEnglish 
      ? "Let's vago into the world together" 
      : '让我们一起 vago 探索世界';
  String get tapToLogin => isEnglish ? 'Tap to sign in' : '点击登录';
  String get logoutTitle => isEnglish ? 'Log out' : '退出登录';
  String get logoutConfirm => isEnglish 
      ? 'Are you sure you want to log out?' 
      : '确定要退出登录吗？';
  String get cancel => isEnglish ? 'Cancel' : '取消';
  String get confirm => isEnglish ? 'Confirm' : '确定';
  String get logoutSuccess => isEnglish ? 'Logged out successfully' : '已退出登录';
  
  // Membership
  String get membershipTitle => isEnglish ? 'Membership' : '会员';
  String get membershipFree => isEnglish ? 'Plain - Free' : '普通 - 免费';
  String get membershipComingSoon => isEnglish ? 'To be launched' : '即将上线';
  
  // Language
  String get languageTitle => isEnglish ? 'Language' : '语言';
  String get languageEnglish => 'English';
  String get languageChinese => '中文';
  
  // Feedback
  String get feedbackTitle => isEnglish ? 'Feedback' : '反馈';
  String get feedbackDescription => isEnglish 
      ? 'Talk everything with me' 
      : '和我聊聊一切';
  String get feedbackDialogTitle => isEnglish ? 'Feedback' : '反馈';
  String get feedbackDialogDescription => isEnglish 
      ? 'Scan the QR code, welcome to the VAGO world' 
      : '扫描二维码，欢迎来到 VAGO 的世界';
  String get saveToAlbum => isEnglish ? 'Save to Album' : '保存到相册';
  String get saveSuccess => isEnglish ? 'Saved to album' : '已保存到相册';
  String get saveFailed => isEnglish ? 'Failed to save' : '保存失败';
  String get permissionDenied => isEnglish 
      ? 'Please allow photo access in settings' 
      : '请在设置中允许访问相册';
}
