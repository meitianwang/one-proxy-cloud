package management

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

// ClaudeCodeConfig represents the model mapping configuration for Claude Code CLI.
type ClaudeCodeConfig struct {
	OpusModel   string `json:"opus_model"`
	SonnetModel string `json:"sonnet_model"`
	HaikuModel  string `json:"haiku_model"`
}

// ClaudeCodeSettings represents the full ~/.claude/settings.json structure.
// We only modify the model fields while preserving other settings.
type ClaudeCodeSettings struct {
	OpusModel   string `json:"opus_model,omitempty"`
	SonnetModel string `json:"sonnet_model,omitempty"`
	HaikuModel  string `json:"haiku_model,omitempty"`
	// Use json.RawMessage to preserve unknown fields
	extra map[string]json.RawMessage
}

func getClaudeSettingsPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".claude", "settings.json")
}

// GetClaudeCodeConfig returns the current Claude Code configuration.
func (h *Handler) GetClaudeCodeConfig(c *gin.Context) {
	settingsPath := getClaudeSettingsPath()
	if settingsPath == "" {
		c.JSON(200, ClaudeCodeConfig{})
		return
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		if os.IsNotExist(err) {
			c.JSON(200, ClaudeCodeConfig{})
			return
		}
		c.JSON(500, gin.H{"error": "failed to read settings file"})
		return
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		c.JSON(200, ClaudeCodeConfig{})
		return
	}

	config := ClaudeCodeConfig{}
	if opusRaw, ok := raw["opus_model"]; ok {
		var opus string
		if json.Unmarshal(opusRaw, &opus) == nil {
			config.OpusModel = opus
		}
	}
	if sonnetRaw, ok := raw["sonnet_model"]; ok {
		var sonnet string
		if json.Unmarshal(sonnetRaw, &sonnet) == nil {
			config.SonnetModel = sonnet
		}
	}
	if haikuRaw, ok := raw["haiku_model"]; ok {
		var haiku string
		if json.Unmarshal(haikuRaw, &haiku) == nil {
			config.HaikuModel = haiku
		}
	}

	c.JSON(200, config)
}

// PutClaudeCodeConfig updates the Claude Code configuration.
func (h *Handler) PutClaudeCodeConfig(c *gin.Context) {
	var input ClaudeCodeConfig
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(400, gin.H{"error": "invalid body"})
		return
	}

	settingsPath := getClaudeSettingsPath()
	if settingsPath == "" {
		c.JSON(500, gin.H{"error": "failed to determine home directory"})
		return
	}

	// Ensure directory exists
	settingsDir := filepath.Dir(settingsPath)
	if err := os.MkdirAll(settingsDir, 0755); err != nil {
		c.JSON(500, gin.H{"error": "failed to create settings directory"})
		return
	}

	// Read existing settings to preserve other fields
	var existing map[string]json.RawMessage
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		if !os.IsNotExist(err) {
			c.JSON(500, gin.H{"error": "failed to read settings file"})
			return
		}
		existing = make(map[string]json.RawMessage)
	} else {
		if err := json.Unmarshal(data, &existing); err != nil {
			existing = make(map[string]json.RawMessage)
		}
	}

	// Update model fields
	input.OpusModel = strings.TrimSpace(input.OpusModel)
	input.SonnetModel = strings.TrimSpace(input.SonnetModel)
	input.HaikuModel = strings.TrimSpace(input.HaikuModel)

	if input.OpusModel != "" {
		raw, _ := json.Marshal(input.OpusModel)
		existing["opus_model"] = raw
	} else {
		delete(existing, "opus_model")
	}

	if input.SonnetModel != "" {
		raw, _ := json.Marshal(input.SonnetModel)
		existing["sonnet_model"] = raw
	} else {
		delete(existing, "sonnet_model")
	}

	if input.HaikuModel != "" {
		raw, _ := json.Marshal(input.HaikuModel)
		existing["haiku_model"] = raw
	} else {
		delete(existing, "haiku_model")
	}

	// Write back
	output, err := json.MarshalIndent(existing, "", "  ")
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to marshal settings"})
		return
	}

	if err := os.WriteFile(settingsPath, output, 0644); err != nil {
		c.JSON(500, gin.H{"error": "failed to write settings file"})
		return
	}

	c.JSON(200, gin.H{"success": true})
}
