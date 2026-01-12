/// 获取分类/标签对应的 Emoji
/// 统一用于地图 marker 和标签筛选器
String getCategoryEmoji(String category) {
  switch (category.toLowerCase()) {
    // 餐饮
    case 'restaurant':
    case 'food':
      return '🍽️';
    case 'cafe':
    case 'coffee':
      return '☕';
    case 'bakery':
    case 'pastry':
      return '🥐';
    case 'bar':
      return '🍸';
    
    // 文化
    case 'museum':
      return '🏛️';
    case 'architecture':
      return '🏛️';
    case 'theater':
    case 'theatre':
    case 'culture':
      return '🎭';
    case 'library':
    case 'bookstore':
      return '📚';
    case 'history':
    case 'historical':
      return '📜';
    
    // 自然
    case 'park':
    case 'nature':
      return '🌳';
    case 'waterfront':
    case 'beach':
      return '🌊';
    case 'zoo':
    case 'aquarium':
      return '🐾';
    
    // 地标
    case 'landmark':
      return '📍';
    case 'church':
    case 'cathedral':
      return '⛪';
    case 'temple':
      return '🛕';
    case 'neighborhood':
      return '📌';
    
    // 购物
    case 'shopping':
      return '🛍️';
    case 'market':
      return '🛒';
    
    // 其他
    case 'art':
    case 'gallery':
      return '🎨';
    case 'garden':
      return '🌷';
    case 'viewpoint':
    case 'scenic':
    case 'photogenic':
      return '📸';
    case 'entertainment':
      return '🎪';
    case 'sports':
      return '⚽';
    case 'hotel':
    case 'accommodation':
      return '🏨';
    case 'building':
    case 'tower':
    case 'skyscraper':
      return '🏢';
    case 'others':
    case 'other':
      return '📌';
    
    default:
      return '📍';
  }
}
