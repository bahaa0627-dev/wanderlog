# 🔧 Google 登录闪退问题修复

## 问题原因

URL Scheme 配置错误导致 Google 登录回调失败，应用闪退。

### 之前的错误配置
```xml
<string>apps.googleusercontent.com.791447495976-rd5pp61vq7t61hp8sn2i3421kq7b18qi.</string>
```

### 修复后的正确配置
```xml
<string>com.googleusercontent.apps.791447495976-o3akd7jtc96q0bfc0otb261jl4kn44vo</string>
```

## ✅ 已修复内容

1. **URL Scheme 格式修正**
   - 正确的格式：`com.googleusercontent.apps.[client-id]`
   - Client ID 与 GIDClientID 保持一致

2. **Info.plist 配置已更新**
   - GIDClientID：`791447495976-o3akd7jtc96q0bfc0otb261jl4kn44vo.apps.googleusercontent.com`
   - CFBundleURLSchemes：`com.googleusercontent.apps.791447495976-o3akd7jtc96q0bfc0otb261jl4kn44vo`

3. **应用已重新构建**
   - ✅ flutter clean
   - ✅ flutter pub get
   - ✅ pod install
   - ✅ 重新运行应用

## 🧪 测试步骤

1. **确认应用正在运行**
   ```
   应用应该已经在模拟器中启动
   ```

2. **导航到登录页面**
   - 点击右上角的用户图标
   - 或者从主页进入登录

3. **点击 Google 登录**
   - 点击 "Continue with Google" 按钮
   - 应该弹出 Google 账号选择器
   - **不应该闪退**

4. **完成登录**
   - 选择 Google 账号
   - 授权应用
   - 应该成功跳转回应用并完成登录

## 🔍 如果还是闪退

### 检查 1: 验证配置
```bash
/Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/check_ios_google_config.sh
```

### 检查 2: 查看 Xcode 控制台日志
1. 打开 Xcode
2. Window → Devices and Simulators
3. 选择你的设备
4. 点击 "Open Console"
5. 点击 Google 登录，查看错误信息

### 检查 3: Client ID 是否正确
确认 Google Cloud Console 中：
- OAuth 2.0 客户端类型：**iOS**
- Bundle ID：`com.example.wanderlog`
- Client ID 与配置文件一致

### 检查 4: 重新创建 iOS Client ID

如果当前的 Client ID (`791447495976-o3akd7jtc96q0bfc0otb261jl4kn44vo`) 不是为 iOS 创建的：

1. 访问 [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. 创建新的 OAuth 2.0 客户端 ID
3. 类型选择：**iOS**
4. Bundle ID：`com.example.wanderlog`
5. 记下新的 Client ID
6. 更新 `.env` 和 `Info.plist`
7. 重新运行应用

## 📝 重要提示

### URL Scheme 格式规则

**正确格式**：
```
com.googleusercontent.apps.[CLIENT_ID_WITHOUT_SUFFIX]
```

**示例**：
如果 Client ID 是：
```
123456-abc123.apps.googleusercontent.com
```

那么 URL Scheme 应该是：
```
com.googleusercontent.apps.123456-abc123
```

### 常见错误

❌ **错误 1**：反转整个字符串
```
moc.resutelggeoooG.sppa.123456-cba
```

❌ **错误 2**：包含多余的点和后缀
```
apps.googleusercontent.com.123456-abc.
```

✅ **正确**：
```
com.googleusercontent.apps.123456-abc
```

## 🎯 当前配置总结

- **Bundle ID**: `com.example.wanderlog`
- **Client ID**: `791447495976-o3akd7jtc96q0bfc0otb261jl4kn44vo.apps.googleusercontent.com`
- **URL Scheme**: `com.googleusercontent.apps.791447495976-o3akd7jtc96q0bfc0otb261jl4kn44vo`
- **配置文件**: 
  - `wanderlog_app/.env`
  - `wanderlog_app/ios/Runner/Info.plist`

## 🚀 下一步

现在应用已重新构建，请：
1. 等待应用完全加载
2. 进入登录页面
3. 点击 Google 登录按钮测试

**不应该再闪退了！** 🎉

---

如果还有问题，请查看 Xcode 控制台的详细错误日志。
