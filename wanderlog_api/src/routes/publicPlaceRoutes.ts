import { Router } from 'express';
import publicPlaceController from '../controllers/publicPlaceController';

const router = Router();

// 获取所有地点（支持分页和筛选）
router.get('/', publicPlaceController.getAllPlaces.bind(publicPlaceController));

// 获取统计信息
router.get('/stats', publicPlaceController.getStats.bind(publicPlaceController));

// 获取城市列表（用于添加 trip）
router.get('/cities', publicPlaceController.getCities.bind(publicPlaceController));

// 搜索地点
router.get('/search', publicPlaceController.searchPlaces.bind(publicPlaceController));

// 根据 place_id 获取地点详情
router.get('/:placeId', publicPlaceController.getPlaceByPlaceId.bind(publicPlaceController));

// 手动创建地点
router.post('/', publicPlaceController.createPlace.bind(publicPlaceController));

// 手动添加地点（通过 place_id）
router.post('/add-by-place-id', publicPlaceController.addByPlaceId.bind(publicPlaceController));

// 从 Google Maps 链接导入（收藏夹/列表）
router.post('/import-from-link', publicPlaceController.importFromGoogleMapsLink.bind(publicPlaceController));

// 批量导入 Place IDs
router.post('/import-by-place-ids', publicPlaceController.importByPlaceIds.bind(publicPlaceController));

// 从图片识别并导入
router.post('/import-from-image', publicPlaceController.importFromImage.bind(publicPlaceController));

// 从对话导入
router.post('/import-from-chat', publicPlaceController.importFromChat.bind(publicPlaceController));

// 更新地点
router.put('/:placeId', publicPlaceController.updatePlace.bind(publicPlaceController));

// 删除地点
router.delete('/:placeId', publicPlaceController.deletePlace.bind(publicPlaceController));

// 同步 Google Maps 数据
router.post('/:placeId/sync', publicPlaceController.syncPlace.bind(publicPlaceController));

// 生成 AI 标签
router.post('/:placeId/generate-tags', publicPlaceController.generateTags.bind(publicPlaceController));

export default router;
