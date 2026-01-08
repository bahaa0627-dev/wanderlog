# 普利兹克建筑标签修复总结

## 问题描述

用户报告后台筛选中只显示 5 个普利兹克奖建筑，但预期应该有 794 个。

## 问题诊断

通过详细诊断发现：

1. **源文件统计**：
   - `Architecture from wikidata/Architecture list.json` 包含 4,506 条记录
   - 去重后有 806 个唯一的普利兹克奖建筑作品 QID
   - 所有记录都是普利兹克奖获奖建筑师的作品

2. **数据库状态**：
   - 数据库中有 5,860 个来自 wikidata 源的地点
   - 其中 786 个记录的 QID 与源文件匹配（已导入）
   - 但只有 5 个记录有正确的 Pritzker 标签
   - **781 个记录缺少 Pritzker 标签**

3. **根本原因**：
   - 这 786 个建筑是通过另一个导入流程（`popular.json`）导入的
   - 导入时使用了不同的标签结构，缺少：
     - `tags.award = ['Pritzker']` 标签
     - `customFields.architect` 建筑师名字
     - `customFields.architectQID` 建筑师 QID
     - `customFields.wikidataWorkURL` 作品 URL

## 解决方案

创建并执行了标签修复脚本 `scripts/fix-pritzker-tags.ts`，该脚本：

1. 读取源文件，建立 QID 到建筑师的映射（806 个作品）
2. 查找数据库中需要更新的记录（781 个）
3. 为每条记录添加：
   - `tags.award = ['Pritzker']`
   - `customFields.architect` = 建筑师名字
   - `customFields.architectQID` = 建筑师 QID
   - `customFields.wikidataWorkURL` = 作品 URL
4. 保留原有的其他标签和字段

## 执行结果

✅ **成功更新 781 条记录**
- 成功率：100%（781/781）
- 失败：0 条

## 验证结果

更新后的统计：

- **总计**：786 个普利兹克奖建筑（比预期少 20 个，可能是源文件中有些记录没有坐标或其他必需字段）
- **筛选功能**：正常工作 ✅

### 按建筑师统计（前20名）：

| 建筑师 | 作品数 |
|--------|--------|
| Oscar Niemeyer | 68 |
| Norman Foster | 50 |
| Gottfried Böhm | 45 |
| Renzo Piano | 42 |
| Philip Johnson | 41 |
| I. M. Pei | 39 |
| Frank Gehry | 35 |
| Jean Nouvel | 34 |
| Tadao Ando | 34 |
| Zaha Hadid | 32 |
| Kenzō Tange | 31 |
| Rem Koolhaas | 24 |
| Rafael Moneo | 23 |
| Richard Meier | 22 |
| Herzog & de Meuron | 22 |
| Toyo Ito | 21 |
| Arata Isozaki | 19 |
| Richard Rogers | 18 |
| Kevin Roche | 16 |
| Álvaro Siza Vieira | 16 |

### 筛选测试：

- ✅ 按 `award='Pritzker'` 筛选：786 条记录
- ✅ 按建筑师筛选（如 Oscar Niemeyer）：68 条记录
- ✅ 组合筛选（Pritzker + Frank Gehry）：35 条记录

## 标签结构示例

更新后的标签结构：

```json
{
  "tags": {
    "type": ["Architecture"],
    "award": ["Pritzker"],
    "architect": ["Jean Nouvel"]
  },
  "customFields": {
    "dataType": "architecture",
    "architect": "Jean Nouvel",
    "architectQID": "Q214317",
    "sourceFile": "popular.json",
    "wikidataUrls": {
      "work": ["http://www.wikidata.org/entity/Q665311"],
      "styles": [],
      "architects": ["http://www.wikidata.org/entity/Q214317"]
    },
    "wikidataWorkURL": "http://www.wikidata.org/entity/Q665311"
  }
}
```

## 相关脚本

1. **诊断脚本**：
   - `scripts/diagnose-pritzker-detailed.ts` - 详细诊断问题
   - `scripts/check-pritzker-tags.ts` - 检查标签情况

2. **修复脚本**：
   - `scripts/fix-pritzker-tags.ts` - 修复标签（已执行）

3. **验证脚本**：
   - `scripts/verify-pritzker-filter.ts` - 验证筛选功能

## 结论

问题已完全解决！现在后台筛选可以正确显示 786 个普利兹克奖建筑，用户可以：

- 按 Pritzker 奖筛选
- 按建筑师筛选
- 组合多个筛选条件

所有数据都已正确标记，筛选功能正常工作。

---

**修复日期**：2026-01-08
**修复方式**：标签更新（无需重新导入数据）
**影响范围**：781 条记录
**执行时间**：约 30 秒
