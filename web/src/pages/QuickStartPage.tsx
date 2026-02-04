import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuthStore, useNotificationStore, useConfigStore, useModelsStore, useThemeStore } from '@/stores';
import { apiKeysApi } from '@/services/api/apiKeys';
import { classifyModels } from '@/utils/models';
import iconGemini from '@/assets/icons/gemini.svg';
import iconClaude from '@/assets/icons/claude.svg';
import iconOpenaiLight from '@/assets/icons/openai-light.svg';
import iconOpenaiDark from '@/assets/icons/openai-dark.svg';
import iconQwen from '@/assets/icons/qwen.svg';
import iconKimiLight from '@/assets/icons/kimi-light.svg';
import iconKimiDark from '@/assets/icons/kimi-dark.svg';
import iconGlm from '@/assets/icons/glm.svg';
import iconGrok from '@/assets/icons/grok.svg';
import iconDeepseek from '@/assets/icons/deepseek.svg';
import iconMinimax from '@/assets/icons/minimax.svg';
import { IconCode } from '@/components/ui/icons';
import styles from './QuickStartPage.module.scss';

const MODEL_CATEGORY_ICONS: Record<string, string | { light: string; dark: string }> = {
    gpt: { light: iconOpenaiLight, dark: iconOpenaiDark },
    claude: iconClaude,
    gemini: iconGemini,
    qwen: iconQwen,
    kimi: { light: iconKimiLight, dark: iconKimiDark },
    glm: iconGlm,
    grok: iconGrok,
    deepseek: iconDeepseek,
    minimax: iconMinimax,
};

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
    const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
    const config = useConfigStore((state) => state.config);
    const { showNotification } = useNotificationStore();

    const models = useModelsStore((state) => state.models);
    const modelsLoading = useModelsStore((state) => state.loading);
    const modelsError = useModelsStore((state) => state.error);
    const fetchModelsFromStore = useModelsStore((state) => state.fetchModels);

    const [proxyUrl, setProxyUrl] = useState('');
    const [modelStatus, setModelStatus] = useState<{ type: 'success' | 'warning' | 'error' | 'muted'; message: string }>();
    const apiKeysCache = useRef<string[]>([]);

    // Protocol test state
    const [selectedProtocol, setSelectedProtocol] = useState<ProtocolType>('openai');
    const [selectedModel, setSelectedModel] = useState<string>('');
    const [userApiKey, setUserApiKey] = useState<string>('');

    const protocols: Protocol[] = useMemo(() => [
        { id: 'openai', name: t('quick_start.protocol_openai'), endpoint: '/v1/chat/completions' },
        { id: 'anthropic', name: t('quick_start.protocol_anthropic'), endpoint: '/v1/messages' },
        { id: 'gemini', name: t('quick_start.protocol_gemini'), endpoint: '/gemini/v1beta' },
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

    const getIconForCategory = (categoryId: string): string | null => {
        const iconEntry = MODEL_CATEGORY_ICONS[categoryId];
        if (!iconEntry) return null;
        if (typeof iconEntry === 'string') return iconEntry;
        return resolvedTheme === 'dark' ? iconEntry.dark : iconEntry.light;
    };

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
            setModelStatus({
                type: 'warning',
                message: t('notification.connection_required')
            });
            return;
        }

        if (!apiBase) {
            return;
        }

        if (forceRefresh) {
            apiKeysCache.current = [];
        }

        setModelStatus({ type: 'muted', message: t('system_info.models_loading') });
        try {
            const apiKeys = await resolveApiKeysForModels();
            const primaryKey = apiKeys[0];
            const list = await fetchModelsFromStore(apiBase, primaryKey, forceRefresh);
            const hasModels = list.length > 0;
            setModelStatus({
                type: hasModels ? 'success' : 'warning',
                message: hasModels ? t('system_info.models_count', { count: list.length }) : t('system_info.models_empty')
            });
        } catch (err: any) {
            const message = `${t('system_info.models_error')}: ${err?.message || ''}`;
            setModelStatus({ type: 'error', message });
        }
    };

    useEffect(() => {
        // Compute proxy URL from current apiBase or window location
        if (apiBase) {
            const base = apiBase.replace(/\/management\/?$/, '').replace(/\/v0\/management\/?$/, '');
            setProxyUrl(base || window.location.origin);
        } else {
            setProxyUrl(window.location.origin);
        }
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

    // Generate curl command based on selected protocol and model
    const generateCurlCommand = useMemo(() => {
        const hasApiKey = userApiKey.length > 0;
        const apiKey = userApiKey || 'your-api-key';

        if (selectedProtocol === 'openai') {
            const authHeader = hasApiKey
                ? `  -H "Authorization: Bearer ${apiKey}" \\\\\n`
                : '';
            return `curl -X POST ${proxyUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
${authHeader}  -d '{
    "model": "${selectedModel || 'gpt-4o'}",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`;
        } else if (selectedProtocol === 'anthropic') {
            const authHeader = hasApiKey
                ? `  -H "x-api-key: ${apiKey}" \\\\\n`
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
            return `curl -X POST "${proxyUrl}/gemini/v1beta/models/${selectedModel || 'gemini-2.5-flash'}:generateContent${keyParam}" \\
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

            {/* API Key Reminder */}
            <Card title={t('quick_start.api_key_title')}>
                <p className={styles.hint}>{t('quick_start.api_key_hint')}</p>
                <div className={styles.apiKeySteps}>
                    <div className={styles.step}>
                        <span className={styles.stepNumber}>1</span>
                        <span>{t('quick_start.api_key_step1')}</span>
                    </div>
                    <div className={styles.step}>
                        <span className={styles.stepNumber}>2</span>
                        <span>{t('quick_start.api_key_step2')}</span>
                    </div>
                    <div className={styles.step}>
                        <span className={styles.stepNumber}>3</span>
                        <span>{t('quick_start.api_key_step3')}</span>
                    </div>
                </div>
            </Card>

            {/* Available Models - Dynamic like SystemPage */}
            <Card
                title={t('system_info.models_title')}
                extra={
                    <Button variant="secondary" size="sm" onClick={() => fetchModels({ forceRefresh: true })} loading={modelsLoading}>
                        {t('common.refresh')}
                    </Button>
                }
            >
                <p className={styles.hint}>{t('system_info.models_desc')}</p>
                {modelStatus && <div className={`status-badge ${modelStatus.type}`}>{modelStatus.message}</div>}
                {modelsError && <div className="error-box">{modelsError}</div>}
                {modelsLoading ? (
                    <div className="hint">{t('common.loading')}</div>
                ) : models.length === 0 ? (
                    <div className="hint">{t('system_info.models_empty')}</div>
                ) : (
                    <div className="item-list">
                        {groupedModels.map((group) => {
                            const iconSrc = getIconForCategory(group.id);
                            return (
                                <div key={group.id} className="item-row">
                                    <div className="item-meta">
                                        <div className={styles.groupTitle}>
                                            {iconSrc && <img src={iconSrc} alt="" className={styles.groupIcon} />}
                                            <span className="item-title">{group.label}</span>
                                        </div>
                                        <div className="item-subtitle">{t('system_info.models_count', { count: group.items.length })}</div>
                                    </div>
                                    <div className={styles.modelTags}>
                                        {group.items.map((model) => (
                                            <span
                                                key={`${model.name}-${model.alias ?? 'default'}`}
                                                className={styles.modelTag}
                                                title={model.description || ''}
                                            >
                                                <span className={styles.modelName}>{model.name}</span>
                                                {model.alias && <span className={styles.modelAlias}>{model.alias}</span>}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>
        </div>
    );
}
