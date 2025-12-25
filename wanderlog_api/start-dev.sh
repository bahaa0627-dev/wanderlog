#!/bin/bash
cd "$(dirname "$0")"
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
npm run dev
