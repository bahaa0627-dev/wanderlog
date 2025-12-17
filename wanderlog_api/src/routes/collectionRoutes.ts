import { Router } from 'express';
import { authenticateToken, authenticateTokenIfPresent } from '../middleware/auth';
import collectionController from '../controllers/collectionController';

const router = Router();

// 管理后台/内部创建合集
router.post('/', authenticateToken, collectionController.create.bind(collectionController));
router.put('/:id', authenticateToken, collectionController.update.bind(collectionController));
router.post('/:id/publish', authenticateToken, collectionController.publish.bind(collectionController));
router.post('/:id/unpublish', authenticateToken, collectionController.unpublish.bind(collectionController));

// 获取合集列表（可选鉴权以返回 isFavorited）
router.get('/', authenticateTokenIfPresent, collectionController.list.bind(collectionController));

// 获取合集详情（可选鉴权以返回 isFavorited）
router.get('/:id', authenticateTokenIfPresent, collectionController.getById.bind(collectionController));

// 用户收藏/取消收藏合集（需要登录）
router.post('/:id/favorite', authenticateToken, collectionController.favorite.bind(collectionController));
router.delete('/:id/favorite', authenticateToken, collectionController.unfavorite.bind(collectionController));

export default router;

