#!/bin/bash

# L-reader 应用图标生成脚本
# 使用方法：将 1024x1024 的 PNG 图标保存为 build/icon.png，然后运行此脚本

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🎨 L-reader 图标生成工具"
echo "================================"
echo ""

# 检查源文件是否存在
if [ ! -f "build/icon.png" ]; then
    echo -e "${RED}❌ 错误：找不到 build/icon.png${NC}"
    echo ""
    echo "请先创建 1024x1024 的 PNG 图标文件："
    echo "  1. 使用设计工具（Figma、Sketch 等）创建 1024x1024 的图标"
    echo "  2. 导出为 PNG 格式"
    echo "  3. 保存为 build/icon.png"
    echo ""
    echo "参考文档：应用图标制作指南.md"
    exit 1
fi

# 检查文件尺寸
echo "📏 检查图标尺寸..."
ICON_SIZE=$(sips -g pixelWidth -g pixelHeight build/icon.png 2>/dev/null | grep -E 'pixelWidth|pixelHeight' | awk '{print $2}' | head -1)

if [ -z "$ICON_SIZE" ] || [ "$ICON_SIZE" != "1024" ]; then
    echo -e "${YELLOW}⚠️  警告：图标尺寸不是 1024x1024${NC}"
    echo "当前尺寸：${ICON_SIZE}x${ICON_SIZE}"
    echo ""
    read -p "是否继续？(y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 创建 iconset 目录
echo "📁 创建 iconset 目录..."
mkdir -p build/icon.iconset

# 生成各种尺寸
echo "🔄 生成图标尺寸..."
echo "  - 16x16"
sips -z 16 16     build/icon.png --out build/icon.iconset/icon_16x16.png > /dev/null 2>&1
echo "  - 16x16@2x"
sips -z 32 32     build/icon.png --out build/icon.iconset/icon_16x16@2x.png > /dev/null 2>&1
echo "  - 32x32"
sips -z 32 32     build/icon.png --out build/icon.iconset/icon_32x32.png > /dev/null 2>&1
echo "  - 32x32@2x"
sips -z 64 64     build/icon.png --out build/icon.iconset/icon_32x32@2x.png > /dev/null 2>&1
echo "  - 128x128"
sips -z 128 128   build/icon.png --out build/icon.iconset/icon_128x128.png > /dev/null 2>&1
echo "  - 128x128@2x"
sips -z 256 256   build/icon.png --out build/icon.iconset/icon_128x128@2x.png > /dev/null 2>&1
echo "  - 256x256"
sips -z 256 256   build/icon.png --out build/icon.iconset/icon_256x256.png > /dev/null 2>&1
echo "  - 256x256@2x"
sips -z 512 512   build/icon.png --out build/icon.iconset/icon_256x256@2x.png > /dev/null 2>&1
echo "  - 512x512"
sips -z 512 512   build/icon.png --out build/icon.iconset/icon_512x512.png > /dev/null 2>&1
echo "  - 512x512@2x"
sips -z 1024 1024 build/icon.png --out build/icon.iconset/icon_512x512@2x.png > /dev/null 2>&1

# 转换为 icns
echo ""
echo "🔄 转换为 .icns 格式..."
if iconutil -c icns build/icon.iconset -o build/icon.icns 2>/dev/null; then
    echo -e "${GREEN}✅ 成功！${NC}"
else
    echo -e "${RED}❌ 转换失败${NC}"
    echo "请检查 iconutil 是否可用"
    exit 1
fi

# 清理临时文件
echo "🧹 清理临时文件..."
rm -rf build/icon.iconset

# 验证结果
if [ -f "build/icon.icns" ]; then
    ICON_SIZE=$(ls -lh build/icon.icns | awk '{print $5}')
    echo ""
    echo -e "${GREEN}✅ 完成！图标已保存为 build/icon.icns${NC}"
    echo "   文件大小：$ICON_SIZE"
    echo ""
    echo "下一步："
    echo "  1. 检查 package.json 中已配置图标路径"
    echo "  2. 运行 npm run build 构建应用"
    echo "  3. 验证图标是否正确显示"
else
    echo -e "${RED}❌ 错误：图标文件未生成${NC}"
    exit 1
fi

