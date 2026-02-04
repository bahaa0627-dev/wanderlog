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
  
  // Recommend Place
  String get recommendPlaceTitle => isEnglish ? 'Recommend a Place' : '推荐新地点';
  String get recommendPlaceDescription => isEnglish 
      ? 'Help us build the database together' 
      : '帮助我们共建数据库';
  String get countryLabel => isEnglish ? 'Country' : '国家';
  String get cityLabel => isEnglish ? 'City' : '城市';
  String get placeNameLabel => isEnglish ? 'Place Name' : '地点名称';
  String get uploadImageOptional => isEnglish ? 'Upload Image (Optional)' : '上传图片（选填）';
  String get tapToUploadImage => isEnglish ? 'Tap to upload a signature photo' : '点击上传标志性图片';
  String get submit => isEnglish ? 'Submit' : '提交';
  String get submitting => isEnglish ? 'Submitting...' : '提交中...';
  String get submitSuccess => isEnglish ? 'Thanks for your recommendation!' : '感谢您的推荐！';
  String get submitFailed => isEnglish ? 'Submit failed, please try again' : '提交失败，请重试';
  String get pleaseEnterCountry => isEnglish ? 'Please enter country' : '请输入国家';
  String get pleaseEnterCity => isEnglish ? 'Please enter city' : '请输入城市';
  String get pleaseEnterPlaceName => isEnglish ? 'Please enter place name' : '请输入地点名称';
  
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

  // Toast messages - Collection
  String get collectionSaved => isEnglish ? 'Saved to collection' : '收藏成功';
  String get collectionRemoved => isEnglish ? 'Removed from collection' : '取消收藏';
  String get operationFailed => isEnglish ? 'Operation failed, please try again' : '操作失败，请重试';
  
  // Toast messages - General
  String get copySuccess => isEnglish ? 'Copied' : '复制成功';
  String get cannotOpenLink => isEnglish ? 'Cannot open link' : '无法打开链接';
  String get invalidLinkFormat => isEnglish ? 'Invalid link format' : '链接格式错误';
  String get shareComingSoon => isEnglish ? 'Share feature coming soon' : '分享功能即将上线';
  String get photoUploadComingSoon => isEnglish ? 'Photo upload coming soon' : '照片上传功能即将上线';
  
  // Toast messages - Wishlist & Check-in
  String get addedToWishlist => isEnglish ? 'Added to wishlist' : '已添加到心愿单';
  String get statusUpdated => isEnglish ? 'Status updated' : '状态已更新';
  String get checkInSuccess => isEnglish ? 'Check-in successful!' : '打卡成功！';
  String checkedIn(String name) => isEnglish ? 'Checked in to $name' : '已打卡 $name';
  String operationFailedWith(String error) => isEnglish ? 'Operation failed: $error' : '操作失败: $error';
  
  // Toast messages - Trip
  String get tripCreated => isEnglish ? 'Trip created!' : '行程创建成功！';
  String createFailed(String error) => isEnglish ? 'Create failed: $error' : '创建失败: $error';
  
  // Toast messages - Image selection
  String get maxImagesReached => isEnglish ? 'Maximum 5 images allowed' : '最多只能选择5张图片';
  String get noImageSelected => isEnglish ? 'No image selected' : '未选择图片';
  String selectImageFailed(String error) => isEnglish ? 'Failed to select image: $error' : '选择图片失败: $error';
  
  // Toast messages - Location
  String get enableLocationService => isEnglish ? 'Please enable location service in device settings' : '请在设备设置中开启定位服务';
  String get locationPermissionRequired => isEnglish ? 'Location permission required, please enable in settings' : '需要定位权限，请在设置中开启';
  
  // Toast messages - Reset password
  String retryAfterSeconds(int seconds) => isEnglish ? 'Try again in $seconds seconds' : '$seconds 秒后再试';
  
  // Toast messages - Opening link
  String opening(String url) => isEnglish ? 'Opening: $url' : '打开: $url';
}
