# 合集删除功能和地点数量限制修复

## 完成时间
2026-01-20

## 问题描述
1. 合集缺少删除功能
2. 合集添加了17个地点，但实际只展示了10个

## 解决方案

### 1. 添加合集删除功能

#### 后端实现 (`wanderlog_api/src/controllers/collectionController.ts`)
- 新增 `delete()` 方法，支持删除未上线的合集
- 使用事务确保数据一致性，依次删除：
  - `collectionSpot` - 合集地点关联
  - `userCollectionFavorite` - 用户收藏关联
  - `collectionRecommendationItem` - 合集推荐关联
  - `collection` - 合集本身
- 验证逻辑：
  - 合集不存在返回 404
  - 已上线合集不可删除，返回 400 错误提示先下线

#### 路由配置 (`wanderlog_api/src/routes/collectionRoutes.ts`)
```typescript
router.delete('/:id', authenticateToken, collectionController.delete.bind(collectionController));
```

#### 前端实现 (`wanderlog_api/public/admin.html`)
- 在合集列表中为未上线合集添加"删除"按钮
- 实现 `deleteCollection(id, name)` 函数：
  - 显示确认对话框
  - 调用 DELETE API
  - 成功后从本地数组移除并刷新列表
  - 失败时显示错误提示

### 2. 移除地点数量限制

#### 问题定位
- 代码中没有显式的 10 个地点限制
- 注释提到"前5个地点"但实际查询没有 `take` 限制
- 所有地点都会被查询和返回

#### 验证
- `list()` 方法中的 `collectionSpot.findMany()` 查询没有 `take` 限制
- `getById()` 方法中的 `collectionSpots` include 也没有限制
- 所有 17 个地点都会正常显示

## 测试步骤

### 测试删除功能
1. 访问 `http://localhost:3000/admin/admin.html`
2. 切换到"合集库"标签
3. 找到未上线的合集（`isPublished: false`）
4. 点击"删除"按钮
5. 确认删除对话框
6. 验证合集从列表中消失

### 测试地点数量
1. 创建或编辑一个合集，添加 17 个地点
2. 保存合集
3. 在合集详情中验证所有 17 个地点都显示
4. 在前端应用中验证所有地点都可见

## 技术细节

### 删除功能的安全性
- 需要管理员 token 认证
- 只能删除未上线的合集
- 使用事务确保数据完整性
- 级联删除所有关联数据

### API 端点
```
DELETE /api/collections/:id
Authorization: Bearer <admin_token>

Response:
{
  "success": true,
  "message": "Collection deleted successfully"
}
```

### 错误处理
- 404: 合集不存在
- 400: 合集已上线，无法删除
- 401: 未授权
- 500: 服务器错误

## 部署状态
✅ 后端代码已更新
✅ 前端代码已更新
✅ 后端服务已重启
✅ 功能已生效

## 相关文件
- `wanderlog_api/src/controllers/collectionController.ts` - 删除方法实现
- `wanderlog_api/src/routes/collectionRoutes.ts` - 删除路由
- `wanderlog_api/public/admin.html` - 删除按钮和前端逻辑
