import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import collectionController from '../controllers/collectionController';

const router = Router();

// 管理后台/内部创建合集
router.post('/', authenticateToken, collectionController.create.bind(collectionController));

// 获取合集列表
router.get('/', collectionController.list.bind(collectionController));

// 获取合集详情
router.get('/:id', collectionController.getById.bind(collectionController));

// 用户收藏/取消收藏合集（需要登录）
router.post('/:id/favorite', authenticateToken, collectionController.favorite.bind(collectionController));
router.delete('/:id/favorite', authenticateToken, collectionController.unfavorite.bind(collectionController));

export default router;

