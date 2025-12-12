#!/usr/bin/env python3
"""
Script to import test images to iOS Simulator
Downloads landmark images from Copenhagen, Paris, and Berlin
"""

import os
import subprocess
import urllib.request
import sys

# Image URLs for different cities
IMAGES = {
    'copenhagen': [
        'https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?w=800',  # Tivoli
        'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800',  # Little Mermaid
        'https://images.unsplash.com/photo-1549573925-9975a04a9a2d?w=800',    # Nyhavn
        'https://images.unsplash.com/photo-1557093793-e196ae071479?w=800',    # Rosenborg
        'https://images.unsplash.com/photo-1588698301085-57f4c7c4a8cb?w=800',  # Christiansborg
        'https://images.unsplash.com/photo-1599946347371-68eb71b16afc?w=800',  # Round Tower
        'https://images.unsplash.com/photo-1589992602626-fa7c8f1f8f01?w=800',  # Amalienborg
        'https://images.unsplash.com/photo-1526391751351-0a4df8d8e511?w=800',  # Copenhagen street
        'https://images.unsplash.com/photo-1602491453631-e2a5ad90a131?w=800',  # Canal
        'https://images.unsplash.com/photo-1554939437-ecc492c67b78?w=800',    # Architecture
    ],
    'paris': [
        'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800',  # Eiffel Tower
        'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800',  # Cityscape
        'https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?w=800',  # Arc de Triomphe
        'https://images.unsplash.com/photo-1431274172761-fca41d930114?w=800',  # Notre Dame
        'https://images.unsplash.com/photo-1509439581779-6298f75bf6e5?w=800',  # Louvre
        'https://images.unsplash.com/photo-1522093007474-d86e9bf7ba6f?w=800',  # Sacre Coeur
        'https://images.unsplash.com/photo-1550340499-a6c60fc8287c?w=800',    # Street
        'https://images.unsplash.com/photo-1549144511-f099e773c147?w=800',    # Montmartre
        'https://images.unsplash.com/photo-1505576391880-b3f9d713dc4f?w=800',  # Seine
        'https://images.unsplash.com/photo-1500039436846-25ae2f11882e?w=800',  # Champs Elysees
    ],
    'berlin': [
        'https://images.unsplash.com/photo-1560969184-10fe8719e047?w=800',  # Brandenburg Gate
        'https://images.unsplash.com/photo-1587330979470-3595ac045ab7?w=800',  # TV Tower
        'https://images.unsplash.com/photo-1599946347371-68eb71b16afc?w=800',  # Reichstag
        'https://images.unsplash.com/photo-1528728329032-2972f65dfb3f?w=800',  # Cathedral
        'https://images.unsplash.com/photo-1566404791232-af9fe0ae8f8b?w=800',  # East Side Gallery
        'https://images.unsplash.com/photo-1546726747-421c6d69c929?w=800',    # Berlin Wall
        'https://images.unsplash.com/photo-1599098939570-fb3a1c88e999?w=800',  # Museum Island
        'https://images.unsplash.com/photo-1587330979470-3595ac045ab7?w=800',  # Alexanderplatz
        'https://images.unsplash.com/photo-1560969184-10fe8719e047?w=800',    # Checkpoint Charlie
        'https://images.unsplash.com/photo-1528728329032-2972f65dfb3f?w=800',  # Gendarmenmarkt
    ]
}

def get_simulator_id():
    """Get the ID of the booted iOS simulator"""
    try:
        result = subprocess.run(
            ['xcrun', 'simctl', 'list', 'devices'],
            capture_output=True,
            text=True,
            check=True
        )
        
        for line in result.stdout.split('\n'):
            if 'Booted' in line:
                # Extract UUID from the line
                import re
                match = re.search(r'\(([A-F0-9-]+)\)', line)
                if match:
                    return match.group(1)
        
        return None
    except subprocess.CalledProcessError:
        return None

def download_image(url, filepath):
    """Download an image from URL"""
    try:
        urllib.request.urlretrieve(url, filepath)
        return True
    except Exception as e:
        print(f"  ❌ Failed to download: {e}")
        return False

def import_to_simulator(simulator_id, filepath):
    """Import image to iOS simulator"""
    try:
        subprocess.run(
            ['xcrun', 'simctl', 'addmedia', simulator_id, filepath],
            check=True,
            capture_output=True
        )
        return True
    except subprocess.CalledProcessError as e:
        print(f"  ❌ Failed to import: {e}")
        return False

def main():
    print("🚀 Starting to import test images to iOS Simulator...\n")
    
    # Check if simulator is running
    simulator_id = get_simulator_id()
    if not simulator_id:
        print("❌ No booted iOS Simulator found!")
        print("Please start the iOS Simulator first, then run this script again.")
        sys.exit(1)
    
    print(f"✅ Found simulator: {simulator_id}\n")
    
    # Create temp directory
    temp_dir = '/tmp/wanderlog_test_images'
    os.makedirs(temp_dir, exist_ok=True)
    print(f"📁 Created temp directory: {temp_dir}\n")
    
    total_imported = 0
    
    # Download and import images for each city
    for city, urls in IMAGES.items():
        print(f"📸 Processing {city.title()} images...")
        
        for i, url in enumerate(urls, 1):
            filename = f"{temp_dir}/{city}_{i}.jpg"
            
            print(f"  [{i}/10] Downloading {city.title()} image...")
            if download_image(url, filename):
                print(f"  ✅ Downloaded")
                
                if import_to_simulator(simulator_id, filename):
                    print(f"  ✅ Imported to simulator")
                    total_imported += 1
                
                # Clean up the file
                os.remove(filename)
        
        print()
    
    # Cleanup
    try:
        os.rmdir(temp_dir)
    except:
        pass
    
    print(f"\n✨ Done! Imported {total_imported}/30 images to iOS Simulator.")
    print("📱 Open the Photos app in your simulator to see them.\n")

if __name__ == '__main__':
    main()
