import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuthStore, useNotificationStore, useConfigStore, useModelsStore } from '@/stores';
import { apiKeysApi } from '@/services/api/apiKeys';
import { claudeCodeConfigApi, type ClaudeCodeConfig } from '@/services/api/claudeCodeConfig';
import { classifyModels } from '@/utils/models';
import { IconCode } from '@/components/ui/icons';
import styles from './QuickStartPage.module.scss';



// Protocol definitions
type ProtocolType = 'openai' | 'anthropic' | 'gemini';

interface Protocol {
    id: ProtocolType;
    name: string;
    endpoint: string;
}

// Clipboard helper
const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
};

export function QuickStartPage() {
    const { t, i18n } = useTranslation();
    const apiBase = useAuthStore((state) => state.apiBase);
    const connectionStatus = useAuthStore((state) => state.connectionStatus);
    const config = useConfigStore((state) => state.config);
    const { showNotification } = useNotificationStore();

    const models = useModelsStore((state) => state.models);
    const fetchModelsFromStore = useModelsStore((state) => state.fetchModels);

    const [proxyUrl, setProxyUrl] = useState('');
    const apiKeysCache = useRef<string[]>([]);

    // Protocol test state
    const [selectedProtocol, setSelectedProtocol] = useState<ProtocolType>('openai');
    const [selectedModel, setSelectedModel] = useState<string>('');
    const [userApiKey, setUserApiKey] = useState<string>('');

    // Claude Code config state
    const [claudeConfig, setClaudeConfig] = useState<ClaudeCodeConfig>({
        opus_model: '',
        sonnet_model: '',
        haiku_model: ''
    });
    const [claudeConfigSaving, setClaudeConfigSaving] = useState(false);
    const [claudeConfigSaved, setClaudeConfigSaved] = useState(false);

    const protocols: Protocol[] = useMemo(() => [
        { id: 'openai', name: t('quick_start.protocol_openai'), endpoint: '/v1/chat/completions' },
        { id: 'anthropic', name: t('quick_start.protocol_anthropic'), endpoint: '/v1/messages' },
        { id: 'gemini', name: t('quick_start.protocol_gemini'), endpoint: '/v1beta' },
    ], [t]);

    const otherLabel = useMemo(
        () => (i18n.language?.toLowerCase().startsWith('zh') ? '其他' : 'Other'),
        [i18n.language]
    );
    const groupedModels = useMemo(() => classifyModels(models, { otherLabel }), [models, otherLabel]);

    // Flatten models for the selector with provider info
    const flatModels = useMemo(() => {
        const result: { name: string; provider: string }[] = [];
        groupedModels.forEach((group) => {
            group.items.forEach((model) => {
                result.push({ name: model.name, provider: group.label.toLowerCase() });
            });
        });
        return result;
    }, [groupedModels]);

    // Set default model when models load
    useEffect(() => {
        if (flatModels.length > 0 && !selectedModel) {
            setSelectedModel(flatModels[0].name);
        }
    }, [flatModels, selectedModel]);



    const normalizeApiKeyList = (input: any): string[] => {
        if (!Array.isArray(input)) return [];
        const seen = new Set<string>();
        const keys: string[] = [];
        input.forEach((item) => {
            const value = typeof item === 'string' ? item : item?.['api-key'] ?? item?.apiKey ?? '';
            const trimmed = String(value || '').trim();
            if (!trimmed || seen.has(trimmed)) return;
            seen.add(trimmed);
            keys.push(trimmed);
        });
        return keys;
    };

    const resolveApiKeysForModels = useCallback(async () => {
        if (apiKeysCache.current.length) {
            return apiKeysCache.current;
        }
        const configKeys = normalizeApiKeyList(config?.apiKeys);
        if (configKeys.length) {
            apiKeysCache.current = configKeys;
            return configKeys;
        }
        try {
            const list = await apiKeysApi.list();
            const normalized = normalizeApiKeyList(list);
            if (normalized.length) {
                apiKeysCache.current = normalized;
            }
            return normalized;
        } catch (err) {
            console.warn('Auto loading API keys for models failed:', err);
            return [];
        }
    }, [config?.apiKeys]);

    const fetchModels = async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}) => {
        if (connectionStatus !== 'connected') {
            return;
        }

        if (!apiBase) {
            return;
        }

        if (forceRefresh) {
            apiKeysCache.current = [];
        }

        try {
            const apiKeys = await resolveApiKeysForModels();
            const primaryKey = apiKeys[0];
            await fetchModelsFromStore(apiBase, primaryKey, forceRefresh);
        } catch (err: any) {
            console.warn('Failed to fetch models:', err?.message);
        }
    };

    useEffect(() => {
        // Compute proxy URL from current apiBase or window location
        // In dev mode, replace frontend dev port with backend API port
        const getProxyUrl = () => {
            let base = '';
            if (apiBase) {
                base = apiBase.replace(/\/management\/?$/, '').replace(/\/v0\/management\/?$/, '');
            }
            if (!base) {
                base = window.location.origin;
            }
            // In development mode, Vite runs on 5174 but API is on 8317
            // Replace dev port with backend port for user-facing URLs
            if (base.includes(':5174')) {
                base = base.replace(':5174', ':8317');
            }
            return base;
        };
        setProxyUrl(getProxyUrl());
    }, [apiBase]);

    useEffect(() => {
        // Auto-fetch models on mount if connected
        if (connectionStatus === 'connected' && models.length === 0) {
            fetchModels();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [connectionStatus]);

    // Load user's API key for test commands
    useEffect(() => {
        const loadApiKey = async () => {
            const keys = await resolveApiKeysForModels();
            if (keys.length > 0) {
                setUserApiKey(keys[0]);
            }
        };
        if (connectionStatus === 'connected') {
            loadApiKey();
        }
    }, [connectionStatus, resolveApiKeysForModels]);

    // Load Claude Code config on mount
    useEffect(() => {
        const loadClaudeConfig = async () => {
            if (connectionStatus !== 'connected') return;
            try {
                const config = await claudeCodeConfigApi.get();
                setClaudeConfig(config);
            } catch (err) {
                console.warn('Failed to load Claude Code config:', err);
            }
        };
        loadClaudeConfig();
    }, [connectionStatus]);

    // Save Claude Code config
    const saveClaudeCodeConfig = async () => {
        setClaudeConfigSaving(true);
        setClaudeConfigSaved(false);
        try {
            await claudeCodeConfigApi.save(claudeConfig);
            setClaudeConfigSaved(true);
            showNotification(t('claude_code_config.save_success'), 'success');
            setTimeout(() => setClaudeConfigSaved(false), 2000);
        } catch (err) {
            console.error('Failed to save Claude Code config:', err);
            showNotification(t('claude_code_config.save_error'), 'error');
        } finally {
            setClaudeConfigSaving(false);
        }
    };

    // Generate curl command based on selected protocol and model
    const generateCurlCommand = useMemo(() => {
        const hasApiKey = userApiKey.length > 0;
        const apiKey = userApiKey || 'your-api-key';

        if (selectedProtocol === 'openai') {
            const authHeader = hasApiKey
                ? `  -H "Authorization: Bearer ${apiKey}" \\\n`
                : '';
            return `curl -X POST ${proxyUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
${authHeader}  -d '{
    "model": "${selectedModel || 'gpt-4o'}",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`;
        } else if (selectedProtocol === 'anthropic') {
            const authHeader = hasApiKey
                ? `  -H "x-api-key: ${apiKey}" \\\n`
                : '';
            return `curl -X POST ${proxyUrl}/v1/messages \\
  -H "Content-Type: application/json" \\
${authHeader}  -H "anthropic-version: 2024-01-01" \\
  -d '{
    "model": "${selectedModel || 'claude-sonnet-4-20250514'}",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello"}]
  }'`;
        } else {
            // Gemini
            const keyParam = hasApiKey ? `?key=${apiKey}` : '';
            return `curl -X POST "${proxyUrl}/v1beta/models/${selectedModel || 'gemini-2.5-flash'}:generateContent${keyParam}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "contents": [{"parts": [{"text": "Hello"}]}]
  }'`;
        }
    }, [proxyUrl, selectedProtocol, selectedModel, userApiKey]);

    const handleCopyCommand = async () => {
        const success = await copyToClipboard(generateCurlCommand);
        if (success) {
            showNotification(t('quick_start.copy_success'), 'success');
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.pageTitle}>{t('quick_start.title')}</h1>
                <p className={styles.subtitle}>{t('quick_start.subtitle')}</p>
            </div>

            {/* Connection Info Card */}
            <Card title={t('quick_start.connection_info')}>
                <div className={styles.connectionInfo}>
                    <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>{t('quick_start.proxy_url')}</span>
                        <div className={styles.infoValue}>
                            <code className={styles.urlCode}>{proxyUrl}</code>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    copyToClipboard(proxyUrl);
                                    showNotification(t('quick_start.copy_success'), 'success');
                                }}
                            >
                                {t('common.copy')}
                            </Button>
                        </div>
                    </div>
                    <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>{t('quick_start.openai_endpoint')}</span>
                        <div className={styles.infoValue}>
                            <code className={styles.urlCode}>{proxyUrl}/v1</code>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    copyToClipboard(`${proxyUrl}/v1`);
                                    showNotification(t('quick_start.copy_success'), 'success');
                                }}
                            >
                                {t('common.copy')}
                            </Button>
                        </div>
                    </div>
                    <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>{t('quick_start.claude_endpoint')}</span>
                        <div className={styles.infoValue}>
                            <code className={styles.urlCode}>{proxyUrl}/v1/messages</code>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    copyToClipboard(`${proxyUrl}/v1/messages`);
                                    showNotification(t('quick_start.copy_success'), 'success');
                                }}
                            >
                                {t('common.copy')}
                            </Button>
                        </div>
                    </div>
                    <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>{t('quick_start.gemini_endpoint')}</span>
                        <div className={styles.infoValue}>
                            <code className={styles.urlCode}>{proxyUrl}/v1beta</code>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    copyToClipboard(`${proxyUrl}/v1beta`);
                                    showNotification(t('quick_start.copy_success'), 'success');
                                }}
                            >
                                {t('common.copy')}
                            </Button>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Multi-Protocol Test Component */}
            <Card
                title={
                    <div className={styles.protocolCardTitle}>
                        <IconCode size={20} />
                        <span>{t('quick_start.multi_protocol_title')}</span>
                    </div>
                }
            >
                <p className={styles.hint}>{t('quick_start.multi_protocol_desc')}</p>

                <div className={styles.protocolTestContainer}>
                    {/* Left side - Protocol & Model Selection */}
                    <div className={styles.protocolSelector}>
                        {/* Protocol tabs */}
                        <div className={styles.protocolTabs}>
                            {protocols.map((protocol) => (
                                <button
                                    key={protocol.id}
                                    className={`${styles.protocolTab} ${selectedProtocol === protocol.id ? styles.active : ''}`}
                                    onClick={() => setSelectedProtocol(protocol.id)}
                                >
                                    <span className={styles.protocolName}>{protocol.name}</span>
                                    <span className={styles.protocolEndpoint}>{protocol.endpoint}</span>
                                </button>
                            ))}
                        </div>

                        {/* Model selection */}
                        <div className={styles.modelSelector}>
                            <label className={styles.modelLabel}>{t('quick_start.select_model')}</label>
                            <div className={styles.modelList}>
                                {flatModels.length === 0 ? (
                                    <div className={styles.noModels}>{t('system_info.models_empty')}</div>
                                ) : (
                                    flatModels.map((model) => (
                                        <button
                                            key={model.name}
                                            className={`${styles.modelItem} ${selectedModel === model.name ? styles.selected : ''}`}
                                            onClick={() => setSelectedModel(model.name)}
                                        >
                                            <span className={styles.modelItemName}>{model.name}</span>
                                            <span className={styles.modelItemProvider}>{model.provider}</span>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right side - Generated curl command */}
                    <div className={styles.curlOutput}>
                        <div className={styles.curlHeader}>
                            <span className={styles.curlTitle}>{t('quick_start.test_command')} (curl)</span>
                            <Button variant="ghost" size="sm" onClick={handleCopyCommand}>
                                {t('common.copy')}
                            </Button>
                        </div>
                        <pre className={styles.curlCode}>
                            <code>{generateCurlCommand}</code>
                        </pre>
                    </div>
                </div>
            </Card>

            {/* Claude Code Config */}
            <Card
                title={
                    <div className={styles.protocolCardTitle}>
                        <IconCode size={20} />
                        <span>{t('claude_code_config.title')}</span>
                    </div>
                }
            >
                <p className={styles.hint}>{t('claude_code_config.description')}</p>

                <div className={styles.claudeCodeConfig}>
                    <div className={styles.claudeConfigGrid}>
                        <div className={styles.claudeConfigField}>
                            <label className={styles.claudeConfigLabel}>{t('claude_code_config.opus_model')}</label>
                            <select
                                value={claudeConfig.opus_model}
                                onChange={(e) => setClaudeConfig({ ...claudeConfig, opus_model: e.target.value })}
                                className={styles.claudeConfigSelect}
                            >
                                <option value="">{t('claude_code_config.select_model')}</option>
                                {flatModels.map((model) => (
                                    <option key={model.name} value={model.name}>
                                        {model.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className={styles.claudeConfigField}>
                            <label className={styles.claudeConfigLabel}>{t('claude_code_config.sonnet_model')}</label>
                            <select
                                value={claudeConfig.sonnet_model}
                                onChange={(e) => setClaudeConfig({ ...claudeConfig, sonnet_model: e.target.value })}
                                className={styles.claudeConfigSelect}
                            >
                                <option value="">{t('claude_code_config.select_model')}</option>
                                {flatModels.map((model) => (
                                    <option key={model.name} value={model.name}>
                                        {model.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className={styles.claudeConfigField}>
                            <label className={styles.claudeConfigLabel}>{t('claude_code_config.haiku_model')}</label>
                            <select
                                value={claudeConfig.haiku_model}
                                onChange={(e) => setClaudeConfig({ ...claudeConfig, haiku_model: e.target.value })}
                                className={styles.claudeConfigSelect}
                            >
                                <option value="">{t('claude_code_config.select_model')}</option>
                                {flatModels.map((model) => (
                                    <option key={model.name} value={model.name}>
                                        {model.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className={styles.claudeConfigActions}>
                        {claudeConfigSaved && (
                            <span className={styles.savedIndicator}>{t('claude_code_config.saved')}</span>
                        )}
                        <Button
                            onClick={saveClaudeCodeConfig}
                            disabled={claudeConfigSaving}
                        >
                            {claudeConfigSaving ? t('claude_code_config.saving') : t('claude_code_config.save_button')}
                        </Button>
                    </div>

                    <p className={styles.claudeConfigNote}>{t('claude_code_config.note')}</p>
                </div>
            </Card>
        </div>
    );
}
