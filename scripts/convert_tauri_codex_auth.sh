#!/bin/bash
# Script to convert tauri-cliproxy Codex auth files to CLIProxyAPI format
# Extracts chatgpt_account_id from JWT access_token

AUTH_DIR="${1:-$HOME/.cli-proxy-api}"

echo "Converting Codex auth files in: $AUTH_DIR"
echo ""

# Function to decode JWT payload with proper padding
decode_jwt_payload() {
    local token="$1"
    local payload=$(echo "$token" | cut -d'.' -f2)
    # Add padding if needed
    local pad=$((4 - ${#payload} % 4))
    if [ $pad -ne 4 ]; then
        for ((i=0; i<pad; i++)); do
            payload="${payload}="
        done
    fi
    echo "$payload" | tr '_-' '/+' | base64 -d 2>/dev/null
}

# Find all codex JSON files
for file in "$AUTH_DIR"/codex_*.json; do
    if [ ! -f "$file" ]; then
        echo "No codex files found"
        exit 0
    fi
    
    filename=$(basename "$file")
    echo "Processing: $filename"
    
    # Check current state
    has_nested_token=$(jq 'has("token") and (.token | has("access_token"))' "$file" 2>/dev/null)
    has_root_refresh=$(jq 'has("refresh_token") and (.refresh_token | type == "string") and (.refresh_token | length > 10)' "$file" 2>/dev/null)
    has_chatgpt_id=$(jq 'has("chatgpt_account_id") and (.chatgpt_account_id | length > 0)' "$file" 2>/dev/null)
    
    needs_update=false
    
    # Extract refresh_token from nested token if needed
    if [ "$has_root_refresh" != "true" ] && [ "$has_nested_token" = "true" ]; then
        echo "  Extracting refresh_token from nested token..."
        needs_update=true
    fi
    
    # Extract chatgpt_account_id from JWT if missing
    if [ "$has_chatgpt_id" != "true" ]; then
        echo "  Extracting chatgpt_account_id from JWT..."
        needs_update=true
    fi
    
    if [ "$needs_update" = "false" ]; then
        echo "  ✓ Already has all required fields, skipping"
        continue
    fi
    
    # Create backup
    cp "$file" "${file}.bak"
    
    # Get access_token from nested token or root
    if [ "$has_nested_token" = "true" ]; then
        access_token=$(jq -r '.token.access_token // empty' "$file")
    else
        access_token=$(jq -r '.access_token // empty' "$file")
    fi
    
    # Extract chatgpt_account_id from JWT
    chatgpt_account_id=""
    if [ -n "$access_token" ]; then
        jwt_payload=$(decode_jwt_payload "$access_token")
        if [ -n "$jwt_payload" ]; then
            chatgpt_account_id=$(echo "$jwt_payload" | jq -r '."https://api.openai.com/auth".chatgpt_account_id // empty' 2>/dev/null)
        fi
    fi
    
    # Build the update
    jq_filter='.'
    
    # Extract from nested token if present
    if [ "$has_nested_token" = "true" ]; then
        jq_filter="$jq_filter |
            (if .token.refresh_token then .refresh_token = .token.refresh_token else . end) |
            (if .token.access_token then .access_token = .token.access_token else . end) |
            (if .token.expires_at then .expires_at = .token.expires_at else . end)"
    fi
    
    # Add chatgpt_account_id if we found it
    if [ -n "$chatgpt_account_id" ]; then
        jq_filter="$jq_filter | .chatgpt_account_id = \"$chatgpt_account_id\""
        echo "  Found chatgpt_account_id: $chatgpt_account_id"
    else
        echo "  ⚠ Could not extract chatgpt_account_id from JWT"
    fi
    
    # Apply the transformation
    jq "$jq_filter" "$file" > "${file}.tmp" && mv "${file}.tmp" "$file"
    
    echo "  ✓ Converted successfully (backup saved as ${filename}.bak)"
done

echo ""
echo "Conversion complete!"
echo "Please restart CLIProxyAPI for changes to take effect."
