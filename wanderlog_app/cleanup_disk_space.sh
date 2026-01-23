#!/bin/bash

# 磁盘空间清理脚本
# 用于清理 Flutter 和 Xcode 的缓存文件

set -e

echo "========================================="
echo "🧹 清理磁盘空间"
echo "========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. 检查当前磁盘空间
echo "1️⃣ 检查磁盘空间..."
df -h / | tail -1
echo ""

# 2. 清理 Flutter build 目录
echo "2️⃣ 清理 Flutter build 目录..."
if [ -d "build" ]; then
    BUILD_SIZE=$(du -sh build 2>/dev/null | cut -f1 || echo "0")
    echo "   删除 build 目录 (大小: $BUILD_SIZE)..."
    rm -rf build
    echo -e "${GREEN}✅ Flutter build 目录已清理${NC}"
else
    echo "   build 目录不存在，跳过"
fi
echo ""

# 3. 清理 Flutter .dart_tool
echo "3️⃣ 清理 Flutter .dart_tool..."
if [ -d ".dart_tool" ]; then
    DART_TOOL_SIZE=$(du -sh .dart_tool 2>/dev/null | cut -f1 || echo "0")
    echo "   删除 .dart_tool 目录 (大小: $DART_TOOL_SIZE)..."
    rm -rf .dart_tool
    echo -e "${GREEN}✅ .dart_tool 目录已清理${NC}"
else
    echo "   .dart_tool 目录不存在，跳过"
fi
echo ""

# 4. 清理 iOS Pods（保留 Podfile.lock）
echo "4️⃣ 清理 iOS Pods..."
if [ -d "ios/Pods" ]; then
    PODS_SIZE=$(du -sh ios/Pods 2>/dev/null | cut -f1 || echo "0")
    echo "   删除 ios/Pods 目录 (大小: $PODS_SIZE)..."
    rm -rf ios/Pods
    echo -e "${GREEN}✅ iOS Pods 已清理${NC}"
    echo "   提示：运行 'cd ios && pod install' 可以重新安装"
else
    echo "   ios/Pods 目录不存在，跳过"
fi
echo ""

# 5. 清理 Xcode DerivedData
echo "5️⃣ 清理 Xcode DerivedData..."
DERIVED_DATA="$HOME/Library/Developer/Xcode/DerivedData"
if [ -d "$DERIVED_DATA" ]; then
    DERIVED_SIZE=$(du -sh "$DERIVED_DATA" 2>/dev/null | cut -f1 || echo "0")
    echo "   清理 DerivedData (大小: $DERIVED_SIZE)..."
    rm -rf "$DERIVED_DATA"/*
    echo -e "${GREEN}✅ Xcode DerivedData 已清理${NC}"
else
    echo "   DerivedData 目录不存在，跳过"
fi
echo ""

# 6. 清理 CocoaPods 缓存（可选，需要确认）
echo "6️⃣ 清理 CocoaPods 缓存..."
COCOAPODS_CACHE="$HOME/Library/Caches/CocoaPods"
if [ -d "$COCOAPODS_CACHE" ]; then
    PODS_CACHE_SIZE=$(du -sh "$COCOAPODS_CACHE" 2>/dev/null | cut -f1 || echo "0")
    echo "   CocoaPods 缓存大小: $PODS_CACHE_SIZE"
    read -p "   是否清理 CocoaPods 缓存？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$COCOAPODS_CACHE"/*
        echo -e "${GREEN}✅ CocoaPods 缓存已清理${NC}"
    else
        echo "   跳过 CocoaPods 缓存清理"
    fi
else
    echo "   CocoaPods 缓存目录不存在，跳过"
fi
echo ""

# 7. 清理 Flutter pub cache（可选）
echo "7️⃣ 检查 Flutter pub cache..."
FLUTTER_PUB_CACHE="$HOME/.pub-cache"
if [ -d "$FLUTTER_PUB_CACHE" ]; then
    PUB_CACHE_SIZE=$(du -sh "$FLUTTER_PUB_CACHE" 2>/dev/null | cut -f1 || echo "0")
    echo "   Flutter pub cache 大小: $PUB_CACHE_SIZE"
    read -p "   是否清理 Flutter pub cache？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$FLUTTER_PUB_CACHE"/*
        echo -e "${GREEN}✅ Flutter pub cache 已清理${NC}"
        echo "   提示：下次运行 'flutter pub get' 时会重新下载"
    else
        echo "   跳过 Flutter pub cache 清理"
    fi
else
    echo "   Flutter pub cache 目录不存在，跳过"
fi
echo ""

# 8. 显示清理后的磁盘空间
echo "8️⃣ 清理后的磁盘空间..."
df -h / | tail -1
echo ""

echo -e "${GREEN}✅ 清理完成！${NC}"
echo ""
echo "下一步："
echo "  1. 运行 'flutter pub get' 重新安装依赖"
echo "  2. 运行 'cd ios && pod install' 重新安装 Pods（如果需要）"
echo "  3. 再次尝试运行应用"
