import { Router } from 'express';
import publicPlaceController from '../controllers/publicPlaceController';

const router = Router();

// 获取所有地点（支持分页和筛选）
router.get('/', publicPlaceController.getAllPlaces.bind(publicPlaceController));

// 获取统计信息
router.get('/stats', publicPlaceController.getStats.bind(publicPlaceController));

// 获取国家和城市列表（按国家分组）
router.get('/countries-cities', publicPlaceController.getCountriesAndCities.bind(publicPlaceController));

// 获取筛选选项（国家、城市、分类及其数量）
router.get('/filter-options', publicPlaceController.getFilterOptions.bind(publicPlaceController));

// 获取标签类型列表（按类型分组的标签）
router.get('/tag-types', publicPlaceController.getTagTypes.bind(publicPlaceController));

// 获取城市列表（用于添加 trip）
router.get('/cities', publicPlaceController.getCities.bind(publicPlaceController));

// 按城市和标签筛选地点
router.get('/search-by-filters', publicPlaceController.searchByFilters.bind(publicPlaceController));

// AI 生成地点
router.post('/ai-generate', publicPlaceController.aiGeneratePlaces.bind(publicPlaceController));

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

// 从 Apify Dataset 导入
router.post('/import-from-apify', publicPlaceController.importFromApifyDataset.bind(publicPlaceController));

// 预览 Apify Dataset 导入（dry-run）
router.post('/preview-apify-import', publicPlaceController.previewApifyImport.bind(publicPlaceController));

// Apify Webhook - Actor 运行完成后自动触发导入
router.post('/apify-webhook', publicPlaceController.handleApifyWebhook.bind(publicPlaceController));

// 更新地点
router.put('/:placeId', publicPlaceController.updatePlace.bind(publicPlaceController));

// 删除地点
router.delete('/:placeId', publicPlaceController.deletePlace.bind(publicPlaceController));

// 同步 Google Maps 数据
router.post('/:placeId/sync', publicPlaceController.syncPlace.bind(publicPlaceController));

// 生成 AI 标签
router.post('/:placeId/generate-tags', publicPlaceController.generateTags.bind(publicPlaceController));

export default router;
