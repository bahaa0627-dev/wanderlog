# ✅ iOS Google 登录配置完成

## 已配置项目

### 1. Bundle ID
- **值**: `com.example.wanderlog`
- **位置**: `ios/Runner.xcodeproj/project.pbxproj`

### 2. 前端配置 (.env)
- ✅ `GOOGLE_CLIENT_ID=791447495976-o3akd7jtc96q0bfc0otb261jl4kn44vo.apps.googleusercontent.com`
- **位置**: `wanderlog_app/.env`

### 3. iOS 配置 (Info.plist)
- ✅ `GIDClientID` 已添加
- ✅ `CFBundleURLSchemes` 已添加
- **位置**: `wanderlog_app/ios/Runner/Info.plist`

## 🎯 下一步：重新构建应用

由于修改了 iOS 配置文件，需要重新构建应用：

### 方法 1: 完整清理重建（推荐）

```bash
cd wanderlog_app

# 1. 清理 Flutter 构建缓存
flutter clean

# 2. 重新安装 CocoaPods
cd ios
pod install
cd ..

# 3. 重新运行应用
flutter run
```

### 方法 2: 快速命令

```bash
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_app && \
flutter clean && \
cd ios && pod install && cd .. && \
flutter run
```

## 🧪 测试 Google 登录

1. **等待应用启动**
   - 应用会重新编译（首次需要较长时间）

2. **导航到登录页面**
   - 点击顶部的用户图标
   - 或直接访问登录页面

3. **点击 Google 登录按钮**
   - 应该会弹出 Google 账号选择界面
   - 选择你的 Google 账号
   - 授权应用访问基本信息

4. **验证登录成功**
   - 应该看到 "Google 登录成功" 的提示
   - 自动跳转到主页
   - 用户信息已保存

## 🔍 故障排查

### 问题 1: 点击 Google 登录没有反应

**解决方案：**
```bash
# 确保已重新构建
cd wanderlog_app
flutter clean
cd ios && pod install && cd ..
flutter run
```

### 问题 2: 出现 "客户端 ID 不匹配" 错误

**检查：**
1. Info.plist 中的 GIDClientID 与 .env 中的 GOOGLE_CLIENT_ID 是否一致
2. Bundle ID 是否为 `com.example.wanderlog`

### 问题 3: Google 登录后没有跳转回应用

**检查：**
1. CFBundleURLSchemes 是否正确配置
2. URL Scheme 格式：`com.googleusercontent.apps.791447495976-o3akd7jtc96q0bfc0otb261jl4kn44vo`

### 问题 4: 后端返回 "Invalid Google token"

**原因：**
- 后端使用的 Client ID 与前端不匹配

**解决：**
编辑 `wanderlog_api/.env`，确保使用 Web Client ID（不是 iOS Client ID）

## 📋 配置清单

- [x] Bundle ID: `com.example.wanderlog`
- [x] 前端 GOOGLE_CLIENT_ID 已配置
- [x] Info.plist GIDClientID 已添加
- [x] Info.plist CFBundleURLSchemes 已添加
- [ ] 重新构建应用（`flutter clean && pod install && flutter run`）
- [ ] 测试 Google 登录功能

## 🎉 完成！

iOS Google 登录已配置完成！现在只需要：

1. **重新构建应用**（上面的命令）
2. **测试登录**
3. **享受一键登录的便利**！

---

## 📚 补充说明

### 关于 Client ID

你当前使用的 Client ID 是：
```
791447495976-o3akd7jtc96q0bfc0otb261jl4kn44vo.apps.googleusercontent.com
```

这个 Client ID 需要在 Google Cloud Console 中配置为 iOS 类型，并关联到 Bundle ID `com.example.wanderlog`。

### 如果需要创建新的 Client ID

如果这个 Client ID 不是为 iOS 配置的，你需要：

1. 访问 [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. 创建新的 OAuth 2.0 客户端 ID
3. 选择 **iOS** 类型
4. 输入 Bundle ID: `com.example.wanderlog`
5. 获取新的 Client ID
6. 更新 `.env` 和 `Info.plist`

详细步骤请查看：[IOS_GOOGLE_LOGIN_SETUP.md](./IOS_GOOGLE_LOGIN_SETUP.md)
