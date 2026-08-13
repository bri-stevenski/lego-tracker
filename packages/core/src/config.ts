export interface AntiKragleConfig {
  rebrickableApiKey?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

let currentConfig: AntiKragleConfig = {};

export function setConfig(config: Partial<AntiKragleConfig>) {
  if (config.rebrickableApiKey !== undefined) {
    if (typeof config.rebrickableApiKey !== 'string' || config.rebrickableApiKey.trim() === '') {
      throw new Error('Invalid rebrickableApiKey: must be a non-empty string');
    }
  }
  
  if (config.supabaseUrl !== undefined) {
    if (typeof config.supabaseUrl !== 'string' || !config.supabaseUrl.startsWith('http')) {
      throw new Error('Invalid supabaseUrl: must be a valid URL');
    }
  }

  if (config.supabaseAnonKey !== undefined) {
    if (typeof config.supabaseAnonKey !== 'string' || config.supabaseAnonKey.trim() === '') {
      throw new Error('Invalid supabaseAnonKey: must be a non-empty string');
    }
  }

  currentConfig = { ...currentConfig, ...config };
}

export function getConfig(): AntiKragleConfig {
  return { ...currentConfig };
}

export function resetConfig() {
  currentConfig = {};
}
