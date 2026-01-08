# 重复地点清理指南

## 概述

`cleanup-duplicates.ts` 脚本用于智能清理数据库中的重复地点，同时保留有价值的数据。

## 清理规则

### 规则1: 完全相同的地点（10米内）
**操作**: 删除重复，保留一个

**条件**:
- 相同名称（标准化后）
- 相同城市和国家
- 坐标在10米内

**保留策略**（按优先级）:
1. 有 `google_place_id` 的记录（+100分）
2. 来源为 `google_maps` (+50分)
3. 来源为 `apify_google_places` (+45分)
4. 来源为 `google_maps_link` (+40分)
5. 有网址 (+20分)
6. 有分类 (+10分)
7. 有详细来源信息 (+5分)

**示例**:
```
La Cabra (Copenhagen)
- 保留: google_maps (有 google_place_id)
- 删除: google_maps_link (无 google_place_id)
```

### 规则2: 坐标为 (0,0) 的数据
**操作**: 保留（不删除）

**原因**:
- 这些地点有名称和位置信息
- 后续可以使用 Apify 补充正确的坐标
- 删除会丢失有价值的地点信息

**示例**:
```
保留的地点:
- Caffè Gilli (Florence, Italy) - 坐标 (0,0)
- La Ménagère (Florence, Italy) - 坐标 (0,0)
```

### 规则3: 同名但距离较远的地点
**操作**: 保留（不删除）

**原因**:
- 可能是连锁店的不同分店
- 可能是同名但不同的地点

**示例**:
```
保留的连锁店:
- Risteriet (Copenhagen) - 4个不同位置
- Original Coffee (Copenhagen) - 5个不同位置
- Kent Kaffe Laboratorium (Copenhagen) - 4个不同位置
```

### 规则4: 邻近但不同名的地点
**操作**: 保留（不删除）

**原因**:
- 可能是不同类型的地点（如寺庙和餐馆）
- 需要考虑分类信息来判断

**示例**:
```
保留的邻近地点:
- Baan Kang Wat 和 Yook Samai (距离 3.68米)
- Café Harcourt 和 STUDIO HARCOURT (距离 2.65米)
```

## 使用方法

### 1. 检查重复地点（不删除）
```bash
npx tsx scripts/find-duplicate-places.ts
```

### 2. 清理重复地点
```bash
npx tsx scripts/cleanup-duplicates.ts
```

### 3. 恢复误删的地点
如果需要恢复特定地点，可以使用恢复脚本：
```bash
npx tsx scripts/restore-florence-places.ts
```

## 注意事项

1. **运行前备份**: 虽然脚本有智能判断，但建议在运行前备份数据库
2. **检查结果**: 运行后检查删除的地点是否符合预期
3. **google_place_id 优先**: 有 google_place_id 的记录永远优先保留
4. **坐标 (0,0) 不删**: 这些数据后续可以用 Apify 补充坐标

## 清理统计示例

```
总地点数: 1000
需要删除: 60
保留地点: 940

删除明细:
- 规则1（完全重复）: 60个
- 规则2（无效坐标）: 0个（保留）
- 规则3（连锁店）: 0个（保留）
- 规则4（邻近不同）: 0个（保留）
```

## 后续优化建议

1. **补充坐标**: 对坐标为 (0,0) 的地点使用 Apify 补充正确坐标
2. **分类判断**: 增加基于分类的重复判断逻辑
3. **人工审核**: 对距离很近但不同名的地点进行人工审核
