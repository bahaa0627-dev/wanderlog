#!/bin/bash

# iOS 设备连接验证脚本

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║        📱 iOS 设备连接验证                                    ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

cd "$(dirname "$0")"

# 1. 检查 Flutter 环境
echo "1️⃣ 检查 Flutter 环境..."
if ! command -v flutter &> /dev/null; then
    echo -e "${RED}❌ Flutter 未安装或不在 PATH 中${NC}"
    exit 1
fi

FLUTTER_VERSION=$(flutter --version | head -1)
echo -e "${GREEN}✅ $FLUTTER_VERSION${NC}"
echo ""

# 2. 检查设备连接
echo "2️⃣ 扫描连接的设备..."
echo ""

DEVICES_OUTPUT=$(flutter devices 2>&1)
echo "$DEVICES_OUTPUT"
echo ""

# 提取 iOS 真机设备
IOS_DEVICES=$(echo "$DEVICES_OUTPUT" | grep -E "mobile.*ios" | grep -v "simulator" || echo "")

if [ -z "$IOS_DEVICES" ]; then
    echo -e "${YELLOW}⚠️  未找到 iOS 真机设备${NC}"
    echo ""
    echo "请按照以下步骤操作："
    echo ""
    echo "1. 物理连接："
    echo "   - 使用 USB 线连接 iPhone/iPad 到 Mac"
    echo ""
    echo "2. 信任电脑："
    echo "   - 在 iPhone 上，如果提示 '信任此电脑'，选择 '信任'"
    echo "   - 输入设备密码确认"
    echo ""
    echo "3. 启用开发者模式（iOS 16+）："
    echo "   - 设置 > 隐私与安全性 > 开发者模式"
    echo "   - 启用 '开发者模式'"
    echo "   - 重启设备"
    echo ""
    echo "4. 验证连接："
    echo "   flutter devices"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ 找到 iOS 设备：${NC}"
echo "$IOS_DEVICES"
echo ""

# 提取设备 ID
DEVICE_ID=$(echo "$IOS_DEVICES" | head -1 | awk '{print $2}')
DEVICE_NAME=$(echo "$IOS_DEVICES" | head -1 | awk '{print $1}')

echo "设备名称: $DEVICE_NAME"
echo "设备 ID: $DEVICE_ID"
echo ""

# 3. 检查 Xcode 配置
echo "3️⃣ 检查 Xcode 配置..."

if [ ! -f "ios/Runner.xcworkspace/contents.xcworkspacedata" ] && [ ! -d "ios/Runner.xcworkspace" ]; then
    echo -e "${YELLOW}⚠️  Xcode workspace 不存在，需要运行 pod install${NC}"
    echo ""
    read -p "是否现在运行 pod install？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd ios
        pod install
        cd ..
        echo -e "${GREEN}✅ pod install 完成${NC}"
    fi
else
    echo -e "${GREEN}✅ Xcode workspace 存在${NC}"
fi

# 检查 Bundle Identifier
BUNDLE_ID=$(grep "PRODUCT_BUNDLE_IDENTIFIER" ios/Runner.xcodeproj/project.pbxproj | grep -v "RunnerTests" | head -1 | awk '{print $3}' | tr -d ';')
echo "Bundle Identifier: $BUNDLE_ID"
echo ""

# 4. 检查代码签名（需要 Xcode）
echo "4️⃣ 代码签名检查..."
echo ""
echo -e "${BLUE}📝 请在 Xcode 中检查代码签名：${NC}"
echo ""
echo "1. 打开 Xcode 项目："
echo "   open ios/Runner.xcworkspace"
echo ""
echo "2. 在 Xcode 中："
echo "   - 选择 Runner 项目（左侧导航栏）"
echo "   - 选择 Runner target"
echo "   - 进入 'Signing & Capabilities' 标签"
echo "   - 勾选 'Automatically manage signing'"
echo "   - 选择 Team（Apple ID）"
echo ""
echo "3. 如果 Bundle ID 冲突，修改为唯一标识符"
echo ""

# 5. 总结
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                        ✅ 验证完成                              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

if [ -n "$DEVICE_ID" ]; then
    echo -e "${GREEN}✅ 设备已连接：$DEVICE_NAME ($DEVICE_ID)${NC}"
    echo ""
    echo "下一步："
    echo "1. 在 Xcode 中配置代码签名（见上方）"
    echo "2. 运行应用："
    echo "   flutter run -d $DEVICE_ID"
    echo ""
    echo "或者使用构建脚本："
    echo "   ./build_and_run.sh"
else
    echo -e "${YELLOW}⚠️  需要先连接设备${NC}"
fi

echo ""
