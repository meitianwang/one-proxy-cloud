#!/bin/bash
# Script to convert tauri-cliproxy auth files to CLIProxyAPI format
# The main difference: refresh_token is nested in "token" object in tauri format
# CLIProxyAPI expects refresh_token at the root level

AUTH_DIR="${1:-$HOME/.cli-proxy-api}"

echo "Converting Antigravity auth files in: $AUTH_DIR"
echo ""

# Find all antigravity JSON files
for file in "$AUTH_DIR"/antigravity_*.json; do
    if [ ! -f "$file" ]; then
        echo "No antigravity files found"
        exit 0
    fi
    
    filename=$(basename "$file")
    echo "Processing: $filename"
    
    # Check if file has nested token object with refresh_token
    has_nested_token=$(jq 'has("token") and (.token | has("refresh_token"))' "$file" 2>/dev/null)
    has_root_refresh=$(jq 'has("refresh_token")' "$file" 2>/dev/null)
    
    if [ "$has_root_refresh" = "true" ]; then
        echo "  ✓ Already has root-level refresh_token, skipping"
        continue
    fi
    
    if [ "$has_nested_token" = "true" ]; then
        echo "  Converting nested token format to CLIProxyAPI format..."
        
        # Create backup
        cp "$file" "${file}.bak"
        
        # Extract values from nested token and add to root level
        jq '
            # Get refresh_token from nested token object
            .refresh_token = .token.refresh_token |
            # Update access_token from nested token if newer (has expires_at)
            (if .token.access_token then .access_token = .token.access_token else . end) |
            # Add expires_at to root if available
            (if .token.expires_at then .expires_at = .token.expires_at else . end) |
            # Keep token_type
            (if .token.token_type then .token_type = .token.token_type else . end)
        ' "$file" > "${file}.tmp" && mv "${file}.tmp" "$file"
        
        echo "  ✓ Converted successfully (backup saved as ${filename}.bak)"
    else
        echo "  ⚠ No nested token found and no root refresh_token, file may be incomplete"
    fi
done

echo ""
echo "Conversion complete!"
echo "Please restart CLIProxyAPI for changes to take effect."
