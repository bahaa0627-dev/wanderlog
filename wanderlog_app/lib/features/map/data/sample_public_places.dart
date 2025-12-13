import 'package:wanderlog/features/map/data/models/public_place_dto.dart';

/// Static sample data that keeps the map usable when the API is unavailable.
const Map<String, List<PublicPlaceDto>> samplePublicPlacesByCity = {
  'Chiang Mai': [
    PublicPlaceDto(
      placeId: 'chiangmai_doi_suthep',
      name: 'Wat Phra That Doi Suthep',
      latitude: 18.8049,
      longitude: 98.9215,
      address: '9 Tambon Suthep, Amphoe Mueang',
      city: 'Chiang Mai',
      country: 'Thailand',
      category: 'Temple',
      coverImage:
          'https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=1200&q=80',
      images: const [
        'https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=1200&q=80',
      ],
      rating: 4.8,
      ratingCount: 12890,
      aiTags: const ['Culture', 'Viewpoint', 'History'],
      aiSummary: 'Hilltop temple with gold chedi and sweeping city panoramas.',
    ),
    PublicPlaceDto(
      placeId: 'chiangmai_nimmanhaemin',
      name: 'Nimmanhaemin Road',
      latitude: 18.7961,
      longitude: 98.9695,
      address: 'Nimmanahaeminda Road',
      city: 'Chiang Mai',
      country: 'Thailand',
      category: 'Neighborhood',
      coverImage:
          'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
      images: const [
        'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
      ],
      rating: 4.6,
      ratingCount: 4670,
      aiTags: const ['Coffee', 'Shopping', 'Nightlife'],
      aiSummary:
          'Creative district packed with cafes, boutiques, and rooftop bars.',
    ),
    PublicPlaceDto(
      placeId: 'chiangmai_warorot_market',
      name: 'Warorot Market',
      latitude: 18.7889,
      longitude: 99.0013,
      address: 'Kad Luang Road',
      city: 'Chiang Mai',
      country: 'Thailand',
      category: 'Market',
      coverImage:
          'https://images.unsplash.com/photo-1526483360412-f4dbaf036963?auto=format&fit=crop&w=1200&q=80',
      images: const [
        'https://images.unsplash.com/photo-1526483360412-f4dbaf036963?auto=format&fit=crop&w=1200&q=80',
      ],
      rating: 4.5,
      ratingCount: 3920,
      aiTags: const ['Food', 'Souvenirs', 'Local'],
      aiSummary:
          'Bustling riverside market famous for northern Thai snacks and textiles.',
    ),
    PublicPlaceDto(
      placeId: 'chiangmai_elephant_nature_park',
      name: 'Elephant Nature Park',
      latitude: 18.9363,
      longitude: 98.8267,
      address: 'Mae Rim District',
      city: 'Chiang Mai',
      country: 'Thailand',
      category: 'Nature Reserve',
      coverImage:
          'https://images.unsplash.com/photo-1456926631375-92c8ce872def?auto=format&fit=crop&w=1200&q=80',
      images: const [
        'https://images.unsplash.com/photo-1456926631375-92c8ce872def?auto=format&fit=crop&w=1200&q=80',
      ],
      rating: 4.9,
      ratingCount: 10220,
      aiTags: const ['Wildlife', 'Sustainability', 'Day Trip'],
      aiSummary:
          'Ethical sanctuary rescuing elephants with immersive volunteer programs.',
    ),
    PublicPlaceDto(
      placeId: 'chiangmai_night_bazaar',
      name: 'Chiang Mai Night Bazaar',
      latitude: 18.7879,
      longitude: 99.0018,
      address: 'Chang Klan Road',
      city: 'Chiang Mai',
      country: 'Thailand',
      category: 'Market',
      coverImage:
          'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
      images: const [
        'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
      ],
      rating: 4.4,
      ratingCount: 5180,
      aiTags: const ['Night Market', 'Food', 'Shopping'],
      aiSummary:
          'Endless stalls selling crafts, street food, and souvenirs late into the night.',
    ),
  ],
  'Copenhagen': [
    PublicPlaceDto(
      placeId: 'copenhagen_nyhavn',
      name: 'Nyhavn Harbour',
      latitude: 55.6805,
      longitude: 12.5876,
      address: 'Nyhavn 1-71',
      city: 'Copenhagen',
      country: 'Denmark',
      category: 'Waterfront',
      coverImage:
          'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80',
      images: const [
        'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80',
      ],
      rating: 4.8,
      ratingCount: 20870,
      aiTags: const ['Harbour', 'Colorful', 'Food'],
      aiSummary:
          'Iconic 17th-century canal lined with tall ships, cafes, and pastel facades.',
    ),
    PublicPlaceDto(
      placeId: 'copenhagen_rosenborg',
      name: 'Rosenborg Castle',
      latitude: 55.6857,
      longitude: 12.5763,
      address: 'Oster Voldgade 4A',
      city: 'Copenhagen',
      country: 'Denmark',
      category: 'Museum',
      coverImage:
          'https://images.unsplash.com/photo-1511840636560-acee95b47a37?auto=format&fit=crop&w=1200&q=80',
      images: const [
        'https://images.unsplash.com/photo-1511840636560-acee95b47a37?auto=format&fit=crop&w=1200&q=80',
      ],
      rating: 4.7,
      ratingCount: 11230,
      aiTags: const ['History', 'Royal', 'Garden'],
      aiSummary:
          'Renaissance castle housing crown jewels amid manicured rose gardens.',
    ),
    PublicPlaceDto(
      placeId: 'copenhagen_tivoli',
      name: 'Tivoli Gardens',
      latitude: 55.6736,
      longitude: 12.5681,
      address: 'Vesterbrogade 3',
      city: 'Copenhagen',
      country: 'Denmark',
      category: 'Amusement Park',
      coverImage:
          'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
      images: const [
        'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
      ],
      rating: 4.6,
      ratingCount: 25400,
      aiTags: const ['Entertainment', 'Historic', 'Family'],
      aiSummary:
          'Fairytale amusement park with vintage rides, live music, and seasonal lights.',
    ),
    PublicPlaceDto(
      placeId: 'copenhagen_christiansborg',
      name: 'Christiansborg Palace',
      latitude: 55.6761,
      longitude: 12.5804,
      address: 'Prins Jorgens Gard 1',
      city: 'Copenhagen',
      country: 'Denmark',
      category: 'Palace',
      coverImage:
          'https://images.unsplash.com/photo-1526403227010-77bee1ed50ff?auto=format&fit=crop&w=1200&q=80',
      images: const [
        'https://images.unsplash.com/photo-1526403227010-77bee1ed50ff?auto=format&fit=crop&w=1200&q=80',
      ],
      rating: 4.5,
      ratingCount: 6890,
      aiTags: const ['Architecture', 'Politics', 'History'],
      aiSummary:
          'Seat of Danish Parliament with royal reception rooms and tower views.',
    ),
    PublicPlaceDto(
      placeId: 'copenhagen_torvehallerne',
      name: 'Torvehallerne Market',
      latitude: 55.6836,
      longitude: 12.5716,
      address: 'Frederiksborggade 21',
      city: 'Copenhagen',
      country: 'Denmark',
      category: 'Market',
      coverImage:
          'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=1200&q=80',
      images: const [
        'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=1200&q=80',
      ],
      rating: 4.7,
      ratingCount: 5210,
      aiTags: const ['Food Hall', 'Coffee', 'Local'],
      aiSummary:
          'Glass food hall mixing gourmet stalls, florists, and Nordic specialty shops.',
    ),
  ],
  'Sapporo': [
    PublicPlaceDto(
      placeId: 'sapporo_odori_park',
      name: 'Odori Park',
      latitude: 43.0594,
      longitude: 141.3539,
      address: 'Odorinishi, Chuo Ward',
      city: 'Sapporo',
      country: 'Japan',
      category: 'Park',
      coverImage:
          'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1200&q=80',
      images: const [
        'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1200&q=80',
      ],
      rating: 4.5,
      ratingCount: 11320,
      aiTags: const ['Festival', 'Scenic', 'Walks'],
      aiSummary:
          'Ribbon-like park hosting Sapporo Snow Festival, gardens, and food stalls.',
    ),
    PublicPlaceDto(
      placeId: 'sapporo_beer_museum',
      name: 'Sapporo Beer Museum',
      latitude: 43.0684,
      longitude: 141.3638,
      address: '9-1-1 Kita 7 Johigashi',
      city: 'Sapporo',
      country: 'Japan',
      category: 'Museum',
      coverImage:
          'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80',
      images: const [
        'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80',
      ],
      rating: 4.4,
      ratingCount: 7420,
      aiTags: const ['Brewery', 'History', 'Tastings'],
      aiSummary:
          'Brick brewery complex detailing Japan’s beer heritage with tasting halls.',
    ),
    PublicPlaceDto(
      placeId: 'sapporo_mount_moiwa',
      name: 'Mount Moiwa Ropeway',
      latitude: 43.0245,
      longitude: 141.3136,
      address: 'Fushimi 5-chome',
      city: 'Sapporo',
      country: 'Japan',
      category: 'Viewpoint',
      coverImage:
          'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80',
      images: const [
        'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80',
      ],
      rating: 4.6,
      ratingCount: 6120,
      aiTags: const ['Night View', 'Cable Car', 'Nature'],
      aiSummary:
          'Gondola ride to a summit observatory famed for sparkling city panoramas.',
    ),
    PublicPlaceDto(
      placeId: 'sapporo_tanukikoji',
      name: 'Tanukikoji Shopping Street',
      latitude: 43.0565,
      longitude: 141.3520,
      address: 'Tanukikoji 1-7 chome',
      city: 'Sapporo',
      country: 'Japan',
      category: 'Shopping',
      coverImage:
          'https://images.unsplash.com/photo-1500336624523-d727130c3328?auto=format&fit=crop&w=1200&q=80',
      images: const [
        'https://images.unsplash.com/photo-1500336624523-d727130c3328?auto=format&fit=crop&w=1200&q=80',
      ],
      rating: 4.3,
      ratingCount: 5210,
      aiTags: const ['Arcade', 'Food', 'Souvenirs'],
      aiSummary:
          'Covered arcade stretching seven blocks with ramen, souvenirs, and arcades.',
    ),
    PublicPlaceDto(
      placeId: 'sapporo_hokkaido_shrine',
      name: 'Hokkaido Shrine',
      latitude: 43.0474,
      longitude: 141.3067,
      address: '474 Miyagaoka',
      city: 'Sapporo',
      country: 'Japan',
      category: 'Shrine',
      coverImage:
          'https://images.unsplash.com/photo-1503416997304-7f8bf166c121?auto=format&fit=crop&w=1200&q=80',
      images: const [
        'https://images.unsplash.com/photo-1503416997304-7f8bf166c121?auto=format&fit=crop&w=1200&q=80',
      ],
      rating: 4.7,
      ratingCount: 6680,
      aiTags: const ['Culture', 'Cherry Blossoms', 'Nature'],
      aiSummary:
          'Serene Shinto complex with towering cedars and seasonal matsuri events.',
    ),
  ],
  'Tokyo': [
    PublicPlaceDto(
      placeId: 'tokyo_sensoji',
      name: 'Senso-ji Temple',
      latitude: 35.7148,
      longitude: 139.7967,
      address: '2 Chome-3-1 Asakusa',
      city: 'Tokyo',
      country: 'Japan',
      category: 'Temple',
      coverImage:
          'https://images.unsplash.com/photo-1505062897336-3cf8fa626d6c?auto=format&fit=crop&w=1200&q=80',
      images: const [
        'https://images.unsplash.com/photo-1505062897336-3cf8fa626d6c?auto=format&fit=crop&w=1200&q=80',
      ],
      rating: 4.8,
      ratingCount: 45520,
      aiTags: const ['Culture', 'Shopping', 'Landmark'],
      aiSummary:
          'Tokyo’s oldest Buddhist temple with massive lantern gate and Nakamise stalls.',
    ),
    PublicPlaceDto(
      placeId: 'tokyo_shibuya_crossing',
      name: 'Shibuya Crossing',
      latitude: 35.6595,
      longitude: 139.7005,
      address: 'Shibuya Station Hachiko exit',
      city: 'Tokyo',
      country: 'Japan',
      category: 'Landmark',
      coverImage:
          'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=1200&q=80',
      images: const [
        'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=1200&q=80',
      ],
      rating: 4.7,
      ratingCount: 52310,
      aiTags: const ['Cityscape', 'Nightlife', 'Photo Spot'],
      aiSummary:
          'Legendary scramble intersection flanked by neon screens and rooftop views.',
    ),
    PublicPlaceDto(
      placeId: 'tokyo_tsukiji_outer_market',
      name: 'Tsukiji Outer Market',
      latitude: 35.6655,
      longitude: 139.7708,
      address: '4 Chome-16-2 Tsukiji',
      city: 'Tokyo',
      country: 'Japan',
      category: 'Market',
      coverImage:
          'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=1200&q=80',
      images: const [
        'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=1200&q=80',
      ],
      rating: 4.6,
      ratingCount: 18760,
      aiTags: const ['Seafood', 'Street Food', 'Culture'],
      aiSummary:
          'Lively lanes of tuna vendors, tamago skewers, and kitchenware boutiques.',
    ),
    PublicPlaceDto(
      placeId: 'tokyo_meiji_shrine',
      name: 'Meiji Shrine',
      latitude: 35.6764,
      longitude: 139.6993,
      address: '1-1 Yoyogikamizonocho',
      city: 'Tokyo',
      country: 'Japan',
      category: 'Shrine',
      coverImage:
          'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
      images: const [
        'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
      ],
      rating: 4.7,
      ratingCount: 23110,
      aiTags: const ['Forest Walk', 'Culture', 'Calm'],
      aiSummary:
          'Wooded shrine oasis where towering torii gates lead to tranquil courtyards.',
    ),
    PublicPlaceDto(
      placeId: 'tokyo_teamlab_planets',
      name: 'teamLab Planets TOKYO',
      latitude: 35.6541,
      longitude: 139.7845,
      address: '6 Chome-1-16 Toyosu',
      city: 'Tokyo',
      country: 'Japan',
      category: 'Art Installation',
      coverImage:
          'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80',
      images: const [
        'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80',
      ],
      rating: 4.8,
      ratingCount: 16430,
      aiTags: const ['Immersive', 'Digital Art', 'Interactive'],
      aiSummary:
          'Immersive art museum where mirrored water rooms react to every step.',
    ),
  ],
};
