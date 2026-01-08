# 筛选联动测试指南

## 测试目的
验证后台管理界面的筛选项（国家、城市、分类、标签）是否完全联动，数量是否动态更新。

## 测试步骤

### 1. 打开后台管理界面
访问：`http://localhost:3000/admin.html`

### 2. 测试初始状态
- [ ] 国家下拉框显示所有国家及数量
- [ ] 城市下拉框显示"全部"
- [ ] 分类下拉框显示所有分类及数量
- [ ] 标签下拉框显示所有标签及数量（按数量降序）

### 3. 测试国家 → 城市联动
1. 选择国家：**Spain**
2. 观察城市下拉框：
   - [ ] 只显示西班牙的城市
   - [ ] 每个城市显示正确的数量
   - [ ] 城市按字母排序

### 4. 测试国家 → 分类联动
1. 保持国家选择：**Spain**
2. 观察分类下拉框：
   - [ ] 只显示西班牙的分类
   - [ ] 每个分类显示正确的数量
   - [ ] 分类按字母排序
   - [ ] 预期看到：Cafe (199), Bar (45), Bakery (52) 等

### 5. 测试国家 → 标签联动
1. 保持国家选择：**Spain**
2. 观察标签下拉框：
   - [ ] 只显示西班牙的标签
   - [ ] 每个标签显示正确的数量
   - [ ] 标签按数量降序排序
   - [ ] 预期看到：Architecture (270), casual (239), cozy (230) 等

### 6. 测试清除国家选择
1. 将国家改回"全部"
2. 观察其他下拉框：
   - [ ] 城市恢复显示所有城市
   - [ ] 分类恢复显示所有分类
   - [ ] 标签恢复显示所有标签
   - [ ] 数量恢复为全局统计

### 7. 测试筛选功能
1. 选择国家：**Spain**
2. 选择分类：**Cafe**
3. 点击"应用筛选"
4. 验证：
   - [ ] 只显示西班牙的咖啡馆
   - [ ] 数量与分类下拉框中的数量一致（199）

### 8. 测试标签筛选联动
1. 选择国家：**Spain**
2. 选择标签：**Architecture**
3. 点击"应用筛选"
4. 验证：
   - [ ] 只显示西班牙的建筑类地点
   - [ ] 数量与标签下拉框中的数量一致（270）

### 9. 测试 Art Nouveau 联动
1. 清除所有筛选
2. 在标签下拉框中搜索"Art Nouveau"
3. 验证：
   - [ ] 看到 Art Nouveau architecture (107)
   - [ ] 看到 Valencian Art Nouveau (2)
   - [ ] 看到 Art Nouveau (1)
4. 选择"Art Nouveau architecture"并应用筛选
5. 验证：
   - [ ] 显示 107 个结果

### 10. 测试多条件联动
1. 选择国家：**United States**
2. 观察城市、分类、标签的变化
3. 选择城市：**New York**
4. 点击"应用筛选"
5. 验证：
   - [ ] 只显示纽约的地点
   - [ ] 数量正确

## 预期结果

### 联动行为
- ✅ 选择国家后，城市、分类、标签自动过滤
- ✅ 数量动态更新，反映当前筛选条件下的实际数量
- ✅ 清除国家选择后，所有选项恢复全局视图

### 数据一致性
- ✅ 下拉框中的数量与实际筛选结果一致
- ✅ 所有数量都是实时计算的，不是静态数据

### 用户体验
- ✅ 联动响应迅速，无明显延迟
- ✅ 数量显示清晰，便于用户决策
- ✅ 支持从全局到局部的逐步筛选

## API 验证

### 测试 filter-options API
```bash
curl "http://localhost:3000/api/public-places/filter-options" | python3 -m json.tool
```

验证返回数据包含：
- `countries`: 所有国家及数量
- `citiesByCountry`: 按国家分组的城市
- `categories`: 所有分类及数量
- `categoriesByCountry`: 按国家分组的分类 ✅ 新增
- `tags`: 所有标签及数量
- `tagsByCountry`: 按国家分组的标签

### 测试 Spain 的数据
```bash
curl -s "http://localhost:3000/api/public-places/filter-options" | python3 -c "
import sys, json
data = json.load(sys.stdin)['data']
print('Spain 的数据:')
print('- 城市数:', len(data['citiesByCountry']['Spain']))
print('- 分类数:', len(data['categoriesByCountry']['Spain']))
print('- 标签数:', len(data['tagsByCountry']['Spain']))
"
```

## 常见问题

### Q: 选择国家后，分类/标签没有变化？
A: 刷新页面，确保加载了最新的 admin.html 文件。

### Q: 数量显示不正确？
A: 检查服务器是否重启，确保使用了最新的后端代码。

### Q: 标签下拉框太长，难以查找？
A: 可以使用浏览器的查找功能（Ctrl+F / Cmd+F）在下拉框中搜索。

## 技术实现

### 后端
- `getFilterOptions()` 方法返回按国家分组的数据
- 支持 `categoriesByCountry` 和 `tagsByCountry`

### 前端
- `updateCityOptions()` - 更新城市选项
- `updateCategoryOptions()` - 更新分类选项 ✅ 新增
- `updateTagOptions()` - 更新标签选项
- `updateFilterOptions()` - 统一更新所有选项

### 联动触发
- 国家下拉框的 `onchange` 事件触发 `updateFilterOptions()`
- 自动更新城市、分类、标签的选项和数量
