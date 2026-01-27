UPDATE places 
SET cover_image = 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800'
WHERE name = 'Jardin du Luxembourg';

SELECT name, cover_image FROM places WHERE name = 'Jardin du Luxembourg';
