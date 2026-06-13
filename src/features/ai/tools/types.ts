import type { SQLiteDatabase } from 'expo-sqlite';

export type ToolExecuteFn = (
  db: SQLiteDatabase,
  input: Record<string, unknown>
) => Promise<string>;

export type Tool = {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: ToolExecuteFn;
};
