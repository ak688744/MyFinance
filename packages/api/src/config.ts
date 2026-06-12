export type ApiConfig = {
  dbPath: string;
  port: number;
};

/**
 * Typed env loader. Reads DB_PATH and PORT from the environment, with defaults
 * suitable for local single-user dev.
 */
export function loadConfig(): ApiConfig {
  return {
    dbPath: process.env.DB_PATH ?? 'myfinance.db',
    port: Number(process.env.PORT ?? 3001),
  };
}
