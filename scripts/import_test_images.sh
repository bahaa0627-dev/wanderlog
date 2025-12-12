#!/bin/bash

# Script to download and import test images to iOS Simulator
# This script downloads landmark images from Copenhagen, Paris, and Berlin

echo "🚀 Starting to import test images to iOS Simulator..."

# Create temp directory for images
TEMP_DIR="/tmp/wanderlog_test_images"
mkdir -p "$TEMP_DIR"

echo "📁 Created temp directory: $TEMP_DIR"

# Copenhagen landmarks (10 images)
COPENHAGEN_URLS=(
    "https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?w=800" # Tivoli
    "https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800" # Little Mermaid
    "https://images.unsplash.com/photo-1549573925-9975a04a9a2d?w=800" # Nyhavn
    "https://images.unsplash.com/photo-1557093793-e196ae071479?w=800" # Rosenborg Castle
    "https://images.unsplash.com/photo-1588698301085-57f4c7c4a8cb?w=800" # Christiansborg
    "https://images.unsplash.com/photo-1599946347371-68eb71b16afc?w=800" # Round Tower
    "https://images.unsplash.com/photo-1589992602626-fa7c8f1f8f01?w=800" # Amalienborg
    "https://images.unsplash.com/photo-1526391751351-0a4df8d8e511?w=800" # Copenhagen street
    "https://images.unsplash.com/photo-1602491453631-e2a5ad90a131?w=800" # Copenhagen canal
    "https://images.unsplash.com/photo-1554939437-ecc492c67b78?w=800" # Copenhagen architecture
)

# Paris landmarks (10 images)
PARIS_URLS=(
    "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800" # Eiffel Tower
    "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800" # Paris cityscape
    "https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?w=800" # Arc de Triomphe
    "https://images.unsplash.com/photo-1431274172761-fca41d930114?w=800" # Notre Dame
    "https://images.unsplash.com/photo-1509439581779-6298f75bf6e5?w=800" # Louvre
    "https://images.unsplash.com/photo-1522093007474-d86e9bf7ba6f?w=800" # Sacre Coeur
    "https://images.unsplash.com/photo-1550340499-a6c60fc8287c?w=800" # Paris street
    "https://images.unsplash.com/photo-1549144511-f099e773c147?w=800" # Montmartre
    "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800" # Seine River
    "https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?w=800" # Champs Elysees
)

# Berlin landmarks (10 images)
BERLIN_URLS=(
    "https://images.unsplash.com/photo-1560969184-10fe8719e047?w=800" # Brandenburg Gate
    "https://images.unsplash.com/photo-1587330979470-3595ac045ab7?w=800" # Berlin TV Tower
    "https://images.unsplash.com/photo-1599946347371-68eb71b16afc?w=800" # Reichstag
    "https://images.unsplash.com/photo-1528728329032-2972f65dfb3f?w=800" # Berlin Cathedral
    "https://images.unsplash.com/photo-1566404791232-af9fe0ae8f8b?w=800" # East Side Gallery
    "https://images.unsplash.com/photo-1546726747-421c6d69c929?w=800" # Berlin Wall
    "https://images.unsplash.com/photo-1599098939570-fb3a1c88e999?w=800" # Museum Island
    "https://images.unsplash.com/photo-1587330979470-3595ac045ab7?w=800" # Alexanderplatz
    "https://images.unsplash.com/photo-1560969184-10fe8719e047?w=800" # Checkpoint Charlie area
    "https://images.unsplash.com/photo-1528728329032-2972f65dfb3f?w=800" # Gendarmenmarkt
)

# Function to download images
download_images() {
    local city=$1
    shift
    local urls=("$@")
    
    echo "📸 Downloading $city images..."
    
    local index=1
    for url in "${urls[@]}"; do
        local filename="${TEMP_DIR}/${city}_${index}.jpg"
        echo "  Downloading ${city} image ${index}/10..."
        curl -s -L "$url" -o "$filename"
        if [ $? -eq 0 ]; then
            echo "  ✅ Downloaded: $filename"
        else
            echo "  ❌ Failed to download from: $url"
        fi
        ((index++))
    done
}

# Download all images
download_images "Copenhagen" "${COPENHAGEN_URLS[@]}"
download_images "Paris" "${PARIS_URLS[@]}"
download_images "Berlin" "${BERLIN_URLS[@]}"

echo ""
echo "📱 Importing images to iOS Simulator..."

# Get booted simulator ID
SIMULATOR_ID=$(xcrun simctl list devices | grep "Booted" | grep -oE '\([A-F0-9-]+\)' | head -1 | tr -d '()')

if [ -z "$SIMULATOR_ID" ]; then
    echo "❌ No booted iOS Simulator found!"
    echo "Please start the iOS Simulator first, then run this script again."
    exit 1
fi

echo "Found simulator: $SIMULATOR_ID"

# Import images to simulator
for image in "$TEMP_DIR"/*.jpg; do
    if [ -f "$image" ]; then
        xcrun simctl addmedia "$SIMULATOR_ID" "$image"
        echo "  ✅ Imported: $(basename "$image")"
    fi
done

echo ""
echo "✨ Done! Imported 30 landmark images to iOS Simulator."
echo "📱 Open the Photos app in your simulator to see them."
echo ""
echo "🧹 Cleaning up temp files..."
rm -rf "$TEMP_DIR"
echo "✅ Cleanup complete!"
