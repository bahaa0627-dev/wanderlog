#!/bin/bash

# 迁移图片到 R2
# 使用 curl 调用 Google Places API

GOOGLE_API_KEY="AIzaSyAFrsDUcA9JqNDT52646JKwGPBu5BdvyW0"
R2_WORKER_URL="https://wanderlog-images.blcubahaa0627.workers.dev"
R2_UPLOAD_SECRET="${R2_UPLOAD_SECRET:-your_secret_here}"
SUPABASE_URL="https://bpygtpeawkxlgjhqorzi.supabase.co"
SUPABASE_KEY="${SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJweWd0cGVhd2t4bGdqaHFvcnppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTM1NjQsImV4cCI6MjA4MTk4OTU2NH0.6_2dRSlPs54Q25RtKP07eIv-7t0yDFOkibAt05Bp_RQ}"

echo "🚀 开始迁移图片..."
echo "R2: $R2_WORKER_URL"
echo ""

# 获取所有地点
places=$(curl -s "$SUPABASE_URL/rest/v1/places?select=id,name,city,cover_image" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY")

# 解析每个地点
echo "$places" | jq -c '.[]' | while read -r place; do
  id=$(echo "$place" | jq -r '.id')
  name=$(echo "$place" | jq -r '.name')
  city=$(echo "$place" | jq -r '.city // empty')
  cover=$(echo "$place" | jq -r '.cover_image')
  
  # 跳过已迁移的
  if [[ "$cover" == *"$R2_WORKER_URL"* ]]; then
    echo "⏭️  $name - 已迁移"
    continue
  fi
  
  echo -n "📍 $name... "
  
  # 搜索 Place ID (先用名字+城市，失败再只用名字)
  search_query="$name"
  if [ -n "$city" ]; then
    search_query="$name $city"
  fi
  
  search_result=$(curl -s --max-time 15 \
    "https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=$(echo "$search_query" | jq -sRr @uri)&inputtype=textquery&fields=place_id&key=$GOOGLE_API_KEY")
  
  place_id=$(echo "$search_result" | jq -r '.candidates[0].place_id // empty')
  
  # 如果没找到，只用名字再试一次
  if [ -z "$place_id" ]; then
    search_result=$(curl -s --max-time 15 \
      "https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=$(echo "$name" | jq -sRr @uri)&inputtype=textquery&fields=place_id&key=$GOOGLE_API_KEY")
    place_id=$(echo "$search_result" | jq -r '.candidates[0].place_id // empty')
  fi
  
  if [ -z "$place_id" ]; then
    echo "❌ 无Place ID"
    continue
  fi
  
  # 获取图片
  details=$(curl -s --max-time 15 \
    "https://maps.googleapis.com/maps/api/place/details/json?place_id=$place_id&fields=photos&key=$GOOGLE_API_KEY")
  
  photo_ref=$(echo "$details" | jq -r '.result.photos[0].photo_reference // empty')
  
  if [ -z "$photo_ref" ]; then
    echo "❌ 无图片"
    continue
  fi
  
  # 下载图片
  photo_url="https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=$photo_ref&key=$GOOGLE_API_KEY"
  tmp_file="/tmp/place_$id.jpg"
  
  curl -sL --max-time 30 "$photo_url" -o "$tmp_file"
  
  if [ ! -s "$tmp_file" ]; then
    echo "❌ 下载失败"
    continue
  fi
  
  # 上传到 R2
  r2_path="places/$id/cover.jpg"
  upload_result=$(curl -s -X PUT "$R2_WORKER_URL/$r2_path" \
    -H "Authorization: Bearer $R2_UPLOAD_SECRET" \
    -H "Content-Type: image/jpeg" \
    --data-binary "@$tmp_file")
  
  if echo "$upload_result" | jq -e '.success' > /dev/null 2>&1; then
    r2_url="$R2_WORKER_URL/$r2_path"
    
    # 更新数据库
    curl -s -X PATCH "$SUPABASE_URL/rest/v1/places?id=eq.$id" \
      -H "apikey: $SUPABASE_KEY" \
      -H "Authorization: Bearer $SUPABASE_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"cover_image\": \"$r2_url\", \"images\": [\"$r2_url\"], \"google_place_id\": \"$place_id\"}" > /dev/null
    
    echo "✅"
  else
    echo "❌ 上传失败"
  fi
  
  rm -f "$tmp_file"
  sleep 0.5
done

echo ""
echo "🎉 完成!"
