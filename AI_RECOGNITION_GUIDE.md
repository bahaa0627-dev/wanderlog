# AI Recognition Feature - Setup Guide

## ✅ 已完成的优化

### 1. 真实AI识别
- 已切换到真实的Gemini AI调用
- 不再使用Mock数据
- 优化了提示词，提高识别准确度

### 2. 测试图片导入
- ✅ 成功导入23张欧洲城市地标图片到iOS模拟器
- 包含：Copenhagen (6张)、Paris (10张)、Berlin (7张)
- 图片位置：模拟器的Photos应用

### 3. 改进的AI提示词
- 要求AI只识别能明确看到的地点
- 不允许AI猜测或编造地点
- 返回结构化的JSON数据
- 包含详细的地点信息（名称、城市、国家、类型、标签）

### 4. 增强的错误处理
- 更好的JSON解析逻辑
- 处理markdown代码块
- 当无法识别时给出友好提示
- 详细的日志输出便于调试

## 🔑 API密钥配置

### 1. 获取Gemini API密钥
1. 访问 https://makersuite.google.com/app/apikey
2. 登录Google账号
3. 点击"Create API Key"
4. 复制生成的API密钥

### 2. 获取Google Maps API密钥
1. 访问 https://console.cloud.google.com/
2. 创建新项目或选择现有项目
3. 启用以下API：
   - Places API
   - Places API (New)
   - Geocoding API
4. 在"Credentials"页面创建API密钥
5. 复制API密钥

### 3. 配置环境变量

编辑 `wanderlog_app/.env` 文件：

```env
# Google Gemini API Key
GEMINI_API_KEY=你的Gemini密钥

# Google Maps API Key
GOOGLE_MAPS_API_KEY=你的Google_Maps密钥
```

⚠️ **重要**：不要将API密钥提交到git仓库！

## 📱 使用方法

### 1. 启动应用
```bash
cd wanderlog_app
flutter run
```

### 2. 测试AI识别
1. 点击首页搜索框右侧的相册图标
2. 点击"Open Album"
3. 从模拟器相册选择1-5张图片
4. 等待AI识别（通常需要5-15秒）
5. 查看识别结果和地点卡片

### 3. 查看识别日志

在控制台中可以看到详细日志：
- `开始选择图片...`
- `调用AI服务识别 X 张图片`
- `Gemini响应: ...`
- `解析的JSON: ...`
- `识别完成，找到 X 个地点`

## 🧪 测试建议

### 好的测试图片特征：
- ✅ 包含著名地标或景点
- ✅ 图片清晰，地标明显
- ✅ 最好是白天拍摄的照片
- ✅ 包含建筑或独特的自然景观

### 不适合的图片：
- ❌ 纯风景照（如天空、海滩等）
- ❌ 模糊或角度奇怪的照片
- ❌ 纯人物照
- ❌ 室内一般场景

### 推荐测试流程：
1. 先用1张著名地标测试（如埃菲尔铁塔）
2. 再用2-3张同城市不同地点测试
3. 最后尝试5张不同城市的混合测试

## 🐛 常见问题

### Q: AI识别返回空结果
**A**: 可能原因：
1. 图片中没有可识别的地标
2. Gemini API密钥未配置或无效
3. 图片质量太低
4. 地点太小众，AI无法识别

**解决方案**：
- 检查`.env`文件中的`GEMINI_API_KEY`
- 使用更清晰、更著名的地标图片
- 查看控制台日志了解详细错误

### Q: Google Maps找不到地点详情
**A**: 可能原因：
1. Google Maps API密钥未配置
2. API配额已用完
3. 地点名称AI识别不准确
4. 地点太新或未收录

**解决方案**：
- 检查`.env`文件中的`GOOGLE_MAPS_API_KEY`
- 确保启用了Places API
- 检查Google Cloud Console的API配额

### Q: 图片上传后一直加载
**A**: 可能原因：
1. 网络连接问题
2. API响应慢
3. 图片太大

**解决方案**：
- 检查网络连接
- 等待更长时间（Gemini处理多图片可能需要15-30秒）
- 减少图片数量或降低图片质量

## 📊 性能优化建议

1. **图片数量**：建议一次上传1-3张，识别速度更快
2. **图片大小**：已自动压缩到1920px，质量85%
3. **API调用**：Gemini + Google Maps两次调用，总耗时约10-20秒

## 🔄 未来改进计划

- [ ] 添加识别进度显示
- [ ] 支持从URL导入图片
- [ ] 缓存已识别的地点
- [ ] 支持批量添加到trip
- [ ] 离线识别缓存
- [ ] 多语言支持
