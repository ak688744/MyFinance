import * as SecureStore from 'expo-secure-store';

import type { GeminiModel } from './providers/gemini';

const KEYS = {
  API_KEY: 'ai_api_key',
  MODEL: 'ai_model',
};

export type AISettings = {
  apiKey: string | null;
  model: GeminiModel;
};

export async function getAISettings(): Promise<AISettings> {
  const apiKey = await SecureStore.getItemAsync(KEYS.API_KEY);
  const model = (await SecureStore.getItemAsync(KEYS.MODEL)) as GeminiModel | null;

  return {
    apiKey,
    model: model ?? 'gemini-2.5-flash',
  };
}

export async function saveAPIKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.API_KEY, key);
}

export async function saveModel(model: GeminiModel): Promise<void> {
  await SecureStore.setItemAsync(KEYS.MODEL, model);
}

export async function clearAISettings(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.API_KEY);
  await SecureStore.deleteItemAsync(KEYS.MODEL);
}

export async function hasAPIKey(): Promise<boolean> {
  const key = await SecureStore.getItemAsync(KEYS.API_KEY);
  return key !== null && key.length > 0;
}
