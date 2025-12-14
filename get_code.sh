#!/bin/bash

# 快速获取验证码
cd "$(dirname "$0")/wanderlog_api"
npx tsx get_verification_code.ts
