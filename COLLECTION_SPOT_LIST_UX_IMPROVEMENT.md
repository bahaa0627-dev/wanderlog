# 合集地点列表 UX 优化

## 完成时间
2026-01-20

## 优化内容

### 1. 简化地点列表显示
**之前**: 显示完整信息（地点名 - 城市 地址）
```
Palazzo Gravina - Naples Via Monteoliveto, 3, 80134 Napoli NA, Italy
```

**现在**: 只显示地点名称
```
Palazzo Gravina
```

### 2. 优化展开/收起动画
添加了平滑的过渡效果，避免页面跳动：

#### CSS 改进
- 添加 `transition` 过渡效果
- 自定义展开箭头（▶ 旋转为 ▼）
- 添加 `slideDown` 动画
- 限制最大高度并添加滚动条（超过 300px）
- 移除默认的 details marker

#### 动画效果
```css
- 箭头旋转: 0.2s ease
- 内容展开: slideDown 0.2s ease
- 最大高度: 300px（超出滚动）
```

### 3. 视觉优化
- 地点列表字体大小: 13px
- 行高: 1.6
- 每个地点间距: 4px
- 展开后内容上边距: 8px

## 用户体验改进

### 优点
✅ 列表更简洁，一眼看清所有地点名称
✅ 展开/收起动画流畅，无突兀感
✅ 页面不会有大幅跳动
✅ 超长列表自动滚动，不会撑开页面
✅ 视觉反馈清晰（箭头旋转）

### 使用场景
- 快速浏览合集包含哪些地点
- 点击展开查看完整列表
- 多个合集同时展开不会影响布局

## 技术实现

### HTML 结构
```html
<details>
    <summary>地点列表（17）</summary>
    <ul>
        <li>地点名称1</li>
        <li>地点名称2</li>
        ...
    </ul>
</details>
```

### CSS 关键样式
```css
.accordion details summary::before {
    content: '▶';
    transform: rotate(90deg) when open;
}

.accordion ul {
    max-height: 300px;
    overflow-y: auto;
    animation: slideDown 0.2s ease;
}
```

## 相关文件
- `wanderlog_api/public/admin.html` - 地点列表渲染和样式

## 测试建议
1. 访问 `http://localhost:3000/admin/admin.html`
2. 切换到"合集库"标签
3. 点击"地点列表"展开/收起
4. 验证动画流畅，页面无跳动
5. 测试超过 10 个地点的合集，验证滚动条
