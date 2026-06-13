import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { GeminiProvider, GEMINI_MODELS, type GeminiModel } from '../features/ai/providers/gemini';
import { runAgent, type AgentResponse } from '../features/ai/agent';
import {
  getAISettings,
  saveAPIKey,
  saveModel,
  hasAPIKey,
  type AISettings,
} from '../features/ai/settings';
import { palette } from '../theme/palette';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  usage?: AgentResponse['usage'];
};

const SUGGESTED_QUESTIONS = [
  'How much did I spend this month?',
  'What are my top spending categories?',
  'Show my mutual fund holdings',
  'Compare my spending last month vs this month',
  'What were my largest expenses recently?',
];

export function AIScreen() {
  const db = useSQLiteContext();
  const flatListRef = useRef<FlatList>(null);

  const [settings, setSettings] = useState<AISettings | null>(null);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Settings form state
  const [keyInput, setKeyInput] = useState('');
  const [selectedModel, setSelectedModel] = useState<GeminiModel>('gemini-2.5-flash');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const configured = await hasAPIKey();
    setIsConfigured(configured);
    if (configured) {
      const s = await getAISettings();
      setSettings(s);
      setSelectedModel(s.model);
    }
  }

  async function handleSaveSettings() {
    if (!keyInput.trim()) return;
    await saveAPIKey(keyInput.trim());
    await saveModel(selectedModel);
    setKeyInput('');
    await loadSettings();
  }

  async function handleSend(text?: string) {
    const message = text ?? inputText.trim();
    if (!message || !settings?.apiKey || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: message,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const provider = new GeminiProvider(settings.apiKey, settings.model);
      const response = await runAgent(provider, db, message);

      const assistantMsg: ChatMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        content: response.text,
        usage: response.usage,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      const errorMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Something went wrong'}`,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleModelChange(model: GeminiModel) {
    setSelectedModel(model);
    if (isConfigured) {
      saveModel(model);
      setSettings((prev) => prev ? { ...prev, model } : null);
    }
  }

  if (isConfigured === null) {
    return <View style={styles.container} />;
  }

  if (!isConfigured) {
    return (
      <View style={styles.container}>
        <View style={styles.setupCard}>
          <Text style={styles.setupTitle}>AI Assistant Setup</Text>
          <Text style={styles.setupBody}>
            Enter your Gemini API key to enable the AI assistant. Your key is stored
            securely on-device and never shared.
          </Text>
          <Text style={styles.setupHint}>
            Get a free key at ai.google.dev
          </Text>

          <Text style={styles.fieldLabel}>API Key</Text>
          <TextInput
            style={styles.textInput}
            value={keyInput}
            onChangeText={setKeyInput}
            placeholder="AIza..."
            placeholderTextColor={palette.mutedText}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.fieldLabel}>Model</Text>
          <View style={styles.modelRow}>
            {GEMINI_MODELS.map((m) => (
              <Pressable
                key={m.id}
                style={[styles.modelPill, selectedModel === m.id && styles.modelPillActive]}
                onPress={() => setSelectedModel(m.id)}
              >
                <Text style={[styles.modelPillText, selectedModel === m.id && styles.modelPillTextActive]}>
                  {m.displayName}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={[styles.saveButton, !keyInput.trim() && styles.saveButtonDisabled]}
            onPress={handleSaveSettings}
            disabled={!keyInput.trim()}
          >
            <Text style={styles.saveButtonText}>Save & Start</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.messageText, isUser && styles.userMessageText]}>
          {item.content}
        </Text>
        {item.usage && (
          <View style={styles.usageRow}>
            <Text style={styles.usageText}>
              {item.usage.inputTokens + item.usage.outputTokens} tokens · ${item.usage.estimatedCost.toFixed(4)}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {/* Model selector */}
      <View style={styles.headerRow}>
        <View style={styles.modelRow}>
          {GEMINI_MODELS.map((m) => (
            <Pressable
              key={m.id}
              style={[styles.modelChip, settings?.model === m.id && styles.modelChipActive]}
              onPress={() => handleModelChange(m.id)}
            >
              <Text style={[styles.modelChipText, settings?.model === m.id && styles.modelChipTextActive]}>
                {m.displayName.replace('Gemini ', '')}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Messages */}
      {messages.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Ask anything about your finances</Text>
          <View style={styles.suggestionsContainer}>
            {SUGGESTED_QUESTIONS.map((q) => (
              <Pressable key={q} style={styles.suggestionPill} onPress={() => handleSend(q)}>
                <Text style={styles.suggestionText}>{q}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />
      )}

      {/* Loading indicator */}
      {isLoading && (
        <View style={styles.loadingRow}>
          <Text style={styles.loadingText}>Thinking...</Text>
        </View>
      )}

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.chatInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Ask about your finances..."
          placeholderTextColor={palette.mutedText}
          multiline
          maxLength={500}
          onSubmitEditing={() => handleSend()}
          returnKeyType="send"
        />
        <Pressable
          style={[styles.sendButton, (!inputText.trim() || isLoading) && styles.sendButtonDisabled]}
          onPress={() => handleSend()}
          disabled={!inputText.trim() || isLoading}
        >
          <Text style={styles.sendButtonText}>→</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  headerRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  modelRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  modelChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: palette.background,
    borderWidth: 1,
    borderColor: palette.border,
  },
  modelChipActive: {
    backgroundColor: palette.accentSoft,
    borderColor: palette.accent,
  },
  modelChipText: {
    fontSize: 12,
    color: palette.mutedText,
    fontWeight: '500',
  },
  modelChipTextActive: {
    color: palette.accent,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.primaryText,
    textAlign: 'center',
  },
  suggestionsContainer: {
    gap: 8,
    width: '100%',
  },
  suggestionPill: {
    backgroundColor: palette.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  suggestionText: {
    color: palette.secondaryText,
    fontSize: 14,
  },
  messageList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  messageBubble: {
    maxWidth: '85%',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: palette.accent,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    color: palette.primaryText,
  },
  userMessageText: {
    color: '#ffffff',
  },
  usageRow: {
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  usageText: {
    fontSize: 11,
    color: palette.mutedText,
  },
  loadingRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  loadingText: {
    color: palette.mutedText,
    fontSize: 13,
    fontStyle: 'italic',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    backgroundColor: palette.surface,
  },
  chatInput: {
    flex: 1,
    backgroundColor: palette.background,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: palette.primaryText,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  // Setup screen
  setupCard: {
    margin: 16,
    padding: 20,
    backgroundColor: palette.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 12,
  },
  setupTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.primaryText,
  },
  setupBody: {
    fontSize: 14,
    lineHeight: 20,
    color: palette.secondaryText,
  },
  setupHint: {
    fontSize: 12,
    color: palette.mutedText,
    fontStyle: 'italic',
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.primaryText,
    marginTop: 4,
  },
  textInput: {
    backgroundColor: palette.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: palette.primaryText,
  },
  modelPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.background,
  },
  modelPillActive: {
    borderColor: palette.accent,
    backgroundColor: palette.accentSoft,
  },
  modelPillText: {
    fontSize: 13,
    color: palette.secondaryText,
    fontWeight: '500',
  },
  modelPillTextActive: {
    color: palette.accent,
  },
  saveButton: {
    backgroundColor: palette.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default AIScreen;
