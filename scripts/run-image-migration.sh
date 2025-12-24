#!/bin/bash
# 每日图片迁移任务
cd "/Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_api"
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
npx tsx scripts/migrate-google-images-daily.ts >> "/Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/logs/image-migration.log" 2>&1
