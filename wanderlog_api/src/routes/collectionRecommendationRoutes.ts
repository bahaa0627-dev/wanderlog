import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import collectionRecommendationController from '../controllers/collectionRecommendationController';

console.log('📦 Loading collection recommendation routes...');

const router = Router();

// 公开路由（不需要认证）- 获取推荐列表和详情
router.get('/', (req, res) => {
  console.log('📋 GET /collection-recommendations - Public route (no auth required)');
  return collectionRecommendationController.list(req, res);
});

// 搜索合集（用于编辑页面）- 需要认证，但必须在 /:id 之前定义，否则会被 /:id 匹配
// 手动检查认证，而不是使用中间件，以便放在 /:id 之前
router.get('/search-collections', authenticateToken, (req, res) => {
  console.log('🔍 Search collections route hit:', req.query);
  return collectionRecommendationController.searchCollections(req, res);
});

// 获取推荐详情 - 公开路由
router.get('/:id', (req, res) => {
  console.log(`📋 GET /collection-recommendations/${req.params.id} - Public route (no auth required)`);
  return collectionRecommendationController.getById(req, res);
});

// 需要认证的路由
router.use(authenticateToken);

// 创建合集推荐
router.post('/', collectionRecommendationController.create.bind(collectionRecommendationController));

// 更新推荐列表顺序 - 必须在 /:id 之前
router.put('/order', (req, res) => {
  console.log('🔵 路由 /order 被调用，body:', req.body);
  return collectionRecommendationController.updateRecommendationsOrder(req, res);
});

// 更新合集推荐
router.put('/:id', collectionRecommendationController.update.bind(collectionRecommendationController));

// 更新推荐内的合集顺序
router.put('/:id/order', collectionRecommendationController.updateOrder.bind(collectionRecommendationController));

// 删除合集推荐
router.delete('/:id', collectionRecommendationController.delete.bind(collectionRecommendationController));

console.log('✅ Collection recommendation routes loaded successfully');

export default router;

