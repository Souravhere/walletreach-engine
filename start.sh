#!/bin/bash

echo "🚀 Starting WalletReach Backend on port 5001..."
cd "$(dirname "$0")"
PORT=5001 nodemon server.js
