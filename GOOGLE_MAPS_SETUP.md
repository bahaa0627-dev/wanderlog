# Google Maps Flutter 配置指南

## ✅ 已完成的步骤

### 1. 添加依赖 ✓
已在 `pubspec.yaml` 中添加：
```yaml
dependencies:
  google_maps_flutter: ^2.5.0
```

### 2. iOS 配置 ✓
已在 `ios/Runner/Info.plist` 中添加：
```xml
<key>io.flutter.embedded_views_preview</key>
<true/>
<key>GMSApiKey</key>
<string>YOUR_GOOGLE_MAPS_API_KEY</string>
```

## ⚠️ 需要完成的步骤

### 1. 获取 Google Maps API Key

#### 步骤 1：访问 Google Cloud Console
1. 打开 https://console.cloud.google.com/
2. 登录你的 Google 账户
3. 创建新项目或选择现有项目

#### 步骤 2：启用 Maps SDK
1. 在左侧菜单中选择 "APIs & Services" > "Library"
2. 搜索并启用以下 API：
   - **Maps SDK for iOS** (必需)
   - **Maps SDK for Android** (必需)
   - **Places API** (可选，用于地点搜索)
   - **Geocoding API** (可选，用于地址转换)

#### 步骤 3：创建 API Key
1. 在左侧菜单中选择 "APIs & Services" > "Credentials"
2. 点击 "CREATE CREDENTIALS" > "API key"
3. 复制生成的 API key
4. 点击 "RESTRICT KEY" 设置限制：
   - **Application restrictions**: 
     - iOS apps: 添加你的 Bundle ID (如 `com.wanderlog.app`)
     - Android apps: 添加包名和 SHA-1 证书指纹
   - **API restrictions**: 
     - 选择 "Restrict key"
     - 勾选 Maps SDK for iOS 和 Maps SDK for Android

#### 步骤 4：更新配置文件

**iOS (ios/Runner/Info.plist)**:
```xml
<key>GMSApiKey</key>
<string>你的_API_KEY_替换这里</string>
```

**Android (android/app/src/main/AndroidManifest.xml)**:
在 `<application>` 标签内添加：
```xml
<meta-data
    android:name="com.google.android.geo.API_KEY"
    android:value="你的_API_KEY_替换这里"/>
```

### 2. Android 配置

编辑 `android/app/build.gradle`，确保 minSdkVersion >= 21：
```gradle
android {
    defaultConfig {
        minSdkVersion 21  // 至少 21
        targetSdkVersion 34
    }
}
```

编辑 `android/app/src/main/AndroidManifest.xml`：
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- 添加权限 -->
    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
    
    <application
        android:label="wanderlog"
        android:name="${applicationName}"
        android:icon="@mipmap/ic_launcher">
        
        <!-- 添加 Google Maps API Key -->
        <meta-data
            android:name="com.google.android.geo.API_KEY"
            android:value="YOUR_GOOGLE_MAPS_API_KEY"/>
            
        <activity ...>
            ...
        </activity>
    </application>
</manifest>
```

## 🎯 使用示例

### 基础地图组件

```dart
import 'package:google_maps_flutter/google_maps_flutter.dart';

class MyMapPage extends StatefulWidget {
  @override
  State<MyMapPage> createState() => _MyMapPageState();
}

class _MyMapPageState extends State<MyMapPage> {
  final Completer<GoogleMapController> _controller = Completer();
  Set<Marker> _markers = {};

  @override
  Widget build(BuildContext context) {
    return GoogleMap(
      initialCameraPosition: CameraPosition(
        target: LatLng(55.6761, 12.5683), // Copenhagen
        zoom: 13.0,
      ),
      markers: _markers,
      onMapCreated: (GoogleMapController controller) {
        _controller.complete(controller);
      },
      zoomGesturesEnabled: true,    // 双指缩放
      scrollGesturesEnabled: true,   // 拖动
      rotateGesturesEnabled: true,   // 旋转
      tiltGesturesEnabled: true,     // 倾斜
    );
  }
}
```

### 添加自定义标记

```dart
Future<void> _addCustomMarker() async {
  // 使用默认图标
  final marker = Marker(
    markerId: MarkerId('spot-1'),
    position: LatLng(55.6804, 12.5870),
    infoWindow: InfoWindow(title: 'Nyhavn'),
    onTap: () => print('Marker tapped'),
  );

  setState(() {
    _markers.add(marker);
  });
}
```

### 使用自定义图标

```dart
Future<BitmapDescriptor> _createCustomMarker(String text) async {
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  
  // 绘制圆形背景
  final paint = Paint()..color = Colors.yellow;
  canvas.drawCircle(Offset(30, 30), 30, paint);
  
  // 绘制文字
  final textPainter = TextPainter(
    text: TextSpan(
      text: text,
      style: TextStyle(fontSize: 14, color: Colors.black),
    ),
    textDirection: TextDirection.ltr,
  );
  textPainter.layout();
  textPainter.paint(canvas, Offset(20, 20));
  
  // 转换为图片
  final picture = recorder.endRecording();
  final image = await picture.toImage(60, 60);
  final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
  
  return BitmapDescriptor.fromBytes(byteData!.buffer.asUint8List());
}
```

## 📝 关键优势

### Google Maps vs Mapbox

| 特性 | Google Maps | Mapbox |
|-----|------------|--------|
| 原生性能 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 标记流畅度 | 完美同步 | 较好 |
| 手势支持 | 原生完整 | 需配置 |
| 文档/社区 | 非常成熟 | 较新 |
| 免费额度 | 每月 $200 | 有限 |
| 中国地区 | 需特殊配置 | 正常 |

### 为什么选择 Google Maps？

1. **标记不漂移**: 使用原生 `Marker` 而非 Flutter Widget
2. **性能卓越**: 直接由 iOS/Android 原生引擎渲染
3. **手势完美**: 无需额外配置即支持所有手势
4. **生态成熟**: 大量教程和解决方案

## 🚀 下一步

1. **获取 API Key** (最重要！)
2. **更新 Info.plist 和 AndroidManifest.xml**
3. **创建新的地图页面使用 Google Maps**
4. **测试双指缩放和标记流畅度**

## 🔗 相关文档

- [Google Maps Flutter 官方文档](https://pub.dev/packages/google_maps_flutter)
- [获取 API Key 指南](https://developers.google.com/maps/documentation/android-sdk/get-api-key)
- [自定义标记示例](https://github.com/flutter/plugins/tree/main/packages/google_maps_flutter/google_maps_flutter/example)

## ⚠️ 注意事项

1. **API Key 安全**: 
   - 不要将 API Key 提交到 Git
   - 使用环境变量或加密存储
   - 为生产环境和开发环境使用不同的 Key

2. **费用控制**:
   - Google Maps 提供每月 $200 免费额度
   - 超出部分按使用量计费
   - 建议在 Cloud Console 设置预算提醒

3. **中国地区**:
   - Google Maps 在中国大陆受限
   - 如需服务中国用户，考虑使用高德地图或腾讯地图
