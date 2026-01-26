#!/bin/bash

# 测试 /mine/summary API

# 首先从 Flutter app 的 shared preferences 获取 token
# 或者手动设置你的 token
TOKEN="YOUR_TOKEN_HERE"

echo "Testing /mine/summary API..."
echo ""

# 测试 API 调用
curl -X GET "http://localhost:3000/api/mine/summary" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -v

echo ""
echo "Done!"
