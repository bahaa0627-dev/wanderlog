# Mocation Pilgrimage 标签迁移完成

## 迁移概述

已成功将所有 `source='mocation'` 的地点中的 **Pilgrimage（圣地巡礼）** 标签从 `ai_tags` 字段迁移到 `tags.others` 字段。

## 迁移详情

### 迁移前
```json
{
  "ai_tags": [
    {
      "en": "Pilgrimage",
      "id": "Pilgrimage",
      "zh": "圣地巡礼",
      "kind": "facet",
      "priority": 85
    }
  ],
  "tags": null
}
```

### 迁移后
```json
{
  "ai_tags": [],
  "tags": {
    "others": ["Pilgrimage"]
  }
}
```

## 迁移统计

- **总共处理**: 46 个 mocation 来源的地点
- **成功迁移**: 45 个地点包含 Pilgrimage 标签
- **失败数量**: 0

## API 返回数据

迁移后，API 返回的数据结构：

```json
{
  "name": "La Castellana",
  "source": "mocation",
  "aiTags": [],
  "tags": {
    "others": ["Pilgrimage"]
  },
  "display_tags_en": ["Pilgrimage"],
  "display_tags_zh": ["Pilgrimage"]
}
```

### 关键字段说明

1. **aiTags**: 现在为空数组（Pilgrimage 已移除）
2. **tags.others**: 包含 `["Pilgrimage"]`
3. **display_tags_en/zh**: 后端自动合并 `aiTags` 和 `tags` 的并集，正确显示 `["Pilgrimage"]`

## 后台管理界面

在后台管理页面 (`http://localhost:3000/admin/admin.html`) 中：

### 列表视图
- 标签列显示 `display_tags_en`，会正确显示 "Pilgrimage"
- 标签会被归类为 "other" 类型

### 编辑表单
- **AI 展示标签 (aiTags)**: 为空
- **其他 (others)**: 显示 "Pilgrimage" 标签
- 可以在 "others" 输入框中添加/删除标签

## 数据验证

可以使用以下脚本验证迁移结果：

```bash
# 验证数据库中的数据
npx tsx wanderlog_api/scripts/verify-mocation-tags.ts

# 验证 API 返回
curl 'http://localhost:3000/api/public-places?source=mocation&limit=2&includeInternalTags=true' | jq '.data[] | {name, aiTags, tags, display_tags_en}'
```

## 相关文件

- **迁移脚本**: `wanderlog_api/scripts/migrate-mocation-pilgrimage-tag.ts`
- **验证脚本**: `wanderlog_api/scripts/verify-mocation-tags.ts`
- **后台页面**: `wanderlog_api/public/admin.html`

## 技术说明

### 标签系统架构

1. **tags** (结构化标签): JSON 对象，按类型分组
   - `type`: 建筑类型标签
   - `style`: 风格标签
   - `architect`: 建筑师标签
   - `award`: 奖项标签
   - `theme`: 主题标签
   - `meal`: 餐饮标签
   - `cuisine`: 菜系标签
   - `others`: 其他标签（包括 Pilgrimage）

2. **aiTags** (AI 展示标签): 数组，最多 2 个元素，用于前端展示

3. **display_tags_en/zh**: 后端计算字段，合并 `tags` 和 `aiTags` 的并集，最多 3 个标签

### 为什么迁移？

- **Pilgrimage** 是一个特殊的主题标签，更适合放在 `tags.others` 中
- `aiTags` 应该保留给高优先级的展示标签（如建筑风格、奖项等）
- 这样可以更好地管理和筛选标签

## 后续维护

如果需要批量修改其他 mocation 地点的标签，可以参考 `migrate-mocation-pilgrimage-tag.ts` 脚本的实现。

## 完成时间

2026-01-20 22:30
