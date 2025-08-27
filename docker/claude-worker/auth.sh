#!/bin/bash
# Claude CLI Authentication Script
# This script authenticates Claude CLI in the container

echo "🔐 Authenticating Claude CLI for worker: $WORKER_ID"

# Check if Claude CLI is installed
if ! command -v claude &> /dev/null; then
    echo "❌ Claude CLI not found. Installing..."
    npm install -g @anthropic-ai/claude-cli
fi

# Check if already authenticated
if [ -f "$CLAUDE_CONFIG_PATH/config.json" ]; then
    echo "✅ Already authenticated for $ACCOUNT_EMAIL"
    exit 0
fi

# Authenticate using environment variables
if [ -n "$CLAUDE_PASSWORD" ]; then
    echo "🔑 Authenticating with email and password..."
    # Note: Claude CLI may require interactive login
    # This is a placeholder for the actual authentication command
    claude auth login --email "$ACCOUNT_EMAIL" --password "$CLAUDE_PASSWORD"
else
    echo "⚠️  No authentication credentials provided"
    echo "Please set CLAUDE_PASSWORD environment variable"
    exit 1
fi

echo "✅ Authentication complete for $ACCOUNT_EMAIL"