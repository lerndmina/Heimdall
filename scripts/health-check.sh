#!/bin/bash

# Health check script for the Heimdall container
# This script checks if both services are responding properly

echo "Checking bot API health..."
BOT_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:3001/api/health)

echo "Checking dashboard health..."
DASHBOARD_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:3000/api/health)

echo "Bot API Response: $BOT_RESPONSE"
echo "Dashboard Response: $DASHBOARD_RESPONSE"

if [ "$BOT_RESPONSE" == "200" ] && [ "$DASHBOARD_RESPONSE" == "200" ]; then
    echo "✅ Both services are healthy"
    exit 0
else
    echo "❌ One or more services are unhealthy"
    if [ "$BOT_RESPONSE" != "200" ]; then
        echo "Bot API is not responding correctly (HTTP $BOT_RESPONSE)"
    fi
    if [ "$DASHBOARD_RESPONSE" != "200" ]; then
        echo "Dashboard is not responding correctly (HTTP $DASHBOARD_RESPONSE)"
    fi
    exit 1
fi
