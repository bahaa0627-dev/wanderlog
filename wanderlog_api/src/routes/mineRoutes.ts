import { Router } from 'express';
import { getMineSummary } from '../controllers/mineController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

// 获取 Mine 页面摘要数据（只返回已访问的地点）
router.get('/summary', getMineSummary);

export default router;
