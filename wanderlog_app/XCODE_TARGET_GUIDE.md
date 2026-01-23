# 如何在 Xcode 中找到 Runner Target

## 📍 步骤说明

### 步骤 1: 打开 Xcode 项目

如果 Xcode 还没有打开，运行：
```bash
cd wanderlog_app
open ios/Runner.xcworkspace
```

### 步骤 2: 找到 Runner Target 的位置

在 Xcode 界面中，按照以下步骤操作：

#### 方法 A: 使用左侧导航栏（推荐）

1. **查看左侧导航栏**（如果没有显示，按 `Cmd + 1` 或点击左上角的文件夹图标）
2. **找到最顶部的蓝色图标**，名称是 **"Runner"**
   - 这是项目文件（Project）
   - 图标看起来像 📁 或 📄
3. **点击这个 "Runner" 项目**
4. 在中间的主编辑区域，您会看到：
   - 顶部有标签页：**General**、**Signing & Capabilities**、**Resource Tags** 等
   - 左侧有一个列表，显示 **TARGETS** 部分
   - 在 **TARGETS** 下，您会看到 **"Runner"**（这就是我们要找的 target）

#### 方法 B: 使用顶部工具栏

1. 在 Xcode 顶部工具栏，找到项目/目标选择器（通常在中间位置）
2. 点击下拉菜单，您会看到：
   - **Runner** (这是 target)
   - 设备选择器（iPhone、模拟器等）

### 步骤 3: 选择 Runner Target

1. **在左侧的 TARGETS 列表中**，点击 **"Runner"**
2. 或者**在顶部工具栏**，从下拉菜单中选择 **"Runner"**

### 步骤 4: 进入 Signing & Capabilities

选择 Runner target 后：
1. 在中间编辑区域的**顶部**，您会看到多个标签页
2. 点击 **"Signing & Capabilities"** 标签页
3. 现在您就可以配置代码签名了

## 🎯 图示说明

```
Xcode 界面布局：

┌─────────────────────────────────────────────────────────┐
│  [文件] [编辑] [查看] ...  [Runner ▼] [设备选择器] [▶️]  │  ← 顶部工具栏
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│  导航栏  │           主编辑区域                          │
│          │                                              │
│  📁      │  ┌──────────────────────────────────────┐   │
│  Runner  │  │ TARGETS                              │   │
│    ├─ 📁 │  │  ✅ Runner  ← 点击这里！              │   │
│    ├─ 📁 │  │                                       │   │
│    └─ 📁 │  │                                       │   │
│          │  └──────────────────────────────────────┘   │
│          │                                              │
│          │  [General] [Signing & Capabilities] ...     │  ← 标签页
│          │                                              │
│          │  代码签名配置区域                            │
│          │  ☑ Automatically manage signing            │
│          │  Team: [选择您的 Apple ID]                  │
│          │                                              │
└──────────┴──────────────────────────────────────────────┘
```

## 🔍 详细位置说明

### 左侧导航栏结构

```
Runner (项目) ← 蓝色图标，点击这里
├── Runner (文件夹)
│   ├── AppDelegate.swift
│   ├── Info.plist
│   └── ...
├── Products
└── ...
```

### 中间编辑区域（选择 Runner 项目后）

当您点击左侧的 **"Runner"** 项目（蓝色图标）时，中间区域会显示：

```
┌─────────────────────────────────────┐
│ PROJECT                             │
│   Runner                            │
│                                     │
│ TARGETS                             │
│   ✅ Runner  ← 这就是 target！       │
│                                     │
│   [General] [Signing & Capabilities] [Resource Tags] ...
└─────────────────────────────────────┘
```

## ⚠️ 常见问题

### Q: 我看不到左侧导航栏
**A**: 按 `Cmd + 1` 或点击 Xcode 左上角的文件夹图标来显示导航栏

### Q: 我点击了 Runner，但看不到 TARGETS
**A**: 确保您点击的是最顶部的 **"Runner"**（蓝色项目图标），而不是文件夹中的 Runner

### Q: 我看到了 Runner，但找不到 Signing & Capabilities
**A**: 
1. 确保您先选择了 **TARGETS** 下的 **"Runner"**
2. 然后查看中间区域顶部的标签页
3. 如果标签页被隐藏，尝试调整窗口大小或滚动

### Q: 我看到了多个 Runner
**A**: 
- 最顶部的 **"Runner"**（蓝色图标）= 项目文件
- **TARGETS** 下的 **"Runner"** = 我们要配置的 target
- 选择 **TARGETS** 下的那个

## 🎬 快速操作流程

1. **打开 Xcode**（如果还没打开）
2. **点击左侧最顶部的 "Runner"**（蓝色项目图标）
3. **在中间区域的 TARGETS 部分，点击 "Runner"**
4. **点击顶部的 "Signing & Capabilities" 标签**
5. **勾选 "Automatically manage signing"**
6. **选择您的 Team**（Apple ID）

完成！现在您就可以配置代码签名了。
