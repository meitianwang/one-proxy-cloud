/**
 * Claude Code configuration API
 */

import { apiClient } from './client';

export interface ClaudeCodeConfig {
  opus_model: string;
  sonnet_model: string;
  haiku_model: string;
}

export const claudeCodeConfigApi = {
  /**
   * Get current Claude Code configuration
   */
  async get(): Promise<ClaudeCodeConfig> {
    return apiClient.get<ClaudeCodeConfig>('/claude-code-config');
  },

  /**
   * Update Claude Code configuration
   */
  async save(config: ClaudeCodeConfig): Promise<{ success: boolean }> {
    return apiClient.put<{ success: boolean }>('/claude-code-config', config);
  }
};
