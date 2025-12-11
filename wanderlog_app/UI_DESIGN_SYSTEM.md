# WanderLog UI 设计系统

## 🎨 设计理念

WanderLog 采用年轻、活泼、有趣的设计风格，使用 **Nanum Pen Script** 手写风格字体营造自由、个性化的旅行氛围。

## 主题配色

### 主色调
- **Primary Yellow** `#FFF200` - 明亮的黄色，类似 Bumble 或 Arabia Sunday 系列的厨具黄色
- **Light Yellow** `#FFF4D6` - 浅黄色背景
- **Dark Yellow** `#A29A00` - 深黄色强调

### 中性色
- **Black** `#1A1A1A` - 主要文本和边框
- **Dark Gray** `#4A4A4A` - 次要文本
- **Medium Gray** `#9E9E9E` - 提示文本
- **Light Gray** `#E0E0E0` - 分隔线
- **Background** `#FAFAFA` - 页面背景
- **White** `#FFFFFF` - 卡片背景

### 强调色
- **Accent Pink** `#FF6B9D` - 粉色标签
- **Accent Blue** `#4A90E2` - 蓝色标签
- **Accent Green** `#50C878` - 绿色标签

## 组件库

### 1. 卡片组件

#### PrimaryCard - 主要卡片
```dart
PrimaryCard(
  child: YourContent(),
  onTap: () {},
)
```
- 白色背景
- 3px 黑色边框
- 24px 圆角
- 轻微阴影
- 用于：主要内容展示

#### AccentCard - 强调卡片
```dart
AccentCard(
  child: YourContent(),
)
```
- 明亮黄色背景
- 2px 黑色边框
- 24px 圆角
- 一点点阴影
- 用于：当前选中状态、重要操作

#### SubtleCard - 弱样式卡片
```dart
SubtleCard(
  child: YourContent(),
)
```
- 浅灰背景
- 1.5px 浅灰边框
- 16px 圆角
- 无阴影
- 用于：次要内容、备选项

### 2. 按钮组件

#### PrimaryButton - 主要按钮
```dart
PrimaryButton(
  text: 'Let\'s Go!',
  icon: Icons.arrow_forward,
  onPressed: () {},
)
```
- 黄色背景
- 黑色边框和文字
- 支持加载状态
- 用于：主要操作

#### SecondaryButton - 次要按钮
```dart
SecondaryButton(
  text: 'Cancel',
  onPressed: () {},
)
```
- 白色背景
- 黑色边框和文字
- 用于：次要操作

#### TextButtonCustom - 文本按钮
```dart
TextButtonCustom(
  text: 'Learn more',
  onPressed: () {},
)
```
- 无背景
- 下划线
- 用于：辅助链接

### 3. 输入组件

#### SearchBox - 搜索框
```dart
SearchBox(
  hintText: 'where you wanna go?',
  onChanged: (text) {},
)
```
- 白色背景
- 浅灰边框
- 24px 圆角
- 浅灰色提示文字

### 4. 标签组件

#### TagChip - 标签芯片
```dart
TagChip(
  label: '#architecture',
  isSelected: true,
  onTap: () {},
)
```
- 可选中状态
- 16px 圆角
- 用于：标签展示和筛选

#### CustomBadge - 徽章
```dart
CustomBadge(
  text: 'NEW',
  color: AppTheme.accentPink,
)
```
- 彩色背景
- 黑色边框
- 白色文字
- 用于：状态标识

### 5. 图标按钮

#### IconButtonCustom - 圆形图标按钮
```dart
IconButtonCustom(
  icon: Icons.favorite,
  onPressed: () {},
)
```
- 圆形容器
- 黑色边框
- 可自定义背景色

## 字体样式

### 标题样式
- `displayLarge` - 32px, Bold - 页面主标题
- `displayMedium` - 24px, Bold - 区域标题
- `headlineLarge` - 24px, Semi-Bold - 卡片标题
- `headlineMedium` - 22px, Semi-Bold - 小标题

### 正文样式
- `bodyLarge` - 18px, Normal, Dark Gray - 主要内容
- `bodyMedium` - 16px, Normal, Dark Gray - 次要内容
- `bodySmall` - 14px, Normal, Medium Gray - 提示文本

### 标签样式
- `labelLarge` - 16px, Semi-Bold, Black - 按钮文字
- `labelMedium` - 14px, Semi-Bold, Dark Gray - 标签文字
- `labelSmall` - 12px, Normal, Medium Gray - 徽章文字

## 圆角规范

- **XLarge** - 32px - 特大圆角
- **Large** - 24px - 大圆角（主要卡片）
- **Medium** - 16px - 中等圆角（标签、小卡片）
- **Small** - 12px - 小圆角（徽章）

## 边框规范

- **Thick** - 3px - 主要边框（卡片、按钮）
- **Medium** - 2px - 中等边框（次要按钮）
- **Thin** - 1.5px - 细边框（输入框、弱样式）

## 间距规范

建议使用 4 的倍数：
- 4px, 8px, 12px, 16px, 20px, 24px, 32px, 40px

## 使用示例

### 页面结构
```dart
Scaffold(
  backgroundColor: AppTheme.background,
  body: Column(
    children: [
      // 标题
      Text('WanderLog', style: AppTheme.displayMedium(context)),
      
      // 搜索框
      SearchBox(hintText: 'Search destinations...'),
      
      // 内容卡片
      PrimaryCard(
        child: Column(
          children: [
            Text('Trip Title', style: AppTheme.headlineMedium(context)),
            Wrap(
              children: [
                TagChip(label: '#adventure'),
                TagChip(label: '#food'),
              ],
            ),
          ],
        ),
      ),
      
      // 操作按钮
      PrimaryButton(
        text: 'Start Planning',
        icon: Icons.map,
        onPressed: () {},
      ),
    ],
  ),
)
```

## 可访问性

- 所有文字与背景对比度符合 WCAG AA 标准
- 触摸目标最小尺寸 48x48
- 支持屏幕阅读器
- 明确的焦点状态

## 响应式设计

- 移动端：单列布局
- 平板：双列布局
- 桌面：多列网格布局

---

**设计原则**：年轻、活泼、自由、有趣 🌟
