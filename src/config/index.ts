// Configuration — env parsing and validation

export interface InstanceConfig {
  name: string;
  url: string;
  token: string;
  default?: boolean;
}

export interface AppConfig {
  port: number;
  host: string;
  debug: boolean;
  publicUrl: string;
  instances: InstanceConfig[];
}

function parseInstances(): InstanceConfig[] {
  const raw = process.env.OPENCLAW_INSTANCES;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('OPENCLAW_INSTANCES must be a non-empty JSON array');
      }
      for (const inst of parsed) {
        if (!inst.name || !inst.url) {
          throw new Error(`Each instance must have "name" and "url". Got: ${JSON.stringify(inst)}`);
        }
      }
      // Ensure exactly one default
      const defaults = parsed.filter((i: any) => i.default);
      if (defaults.length === 0) {
        parsed[0].default = true;
      }
      return parsed;
    } catch (e: any) {
      if (e.message.includes('OPENCLAW_INSTANCES')) throw e;
      throw new Error(`Failed to parse OPENCLAW_INSTANCES: ${e.message}`);
    }
  }

  // Single instance fallback
  const url = process.env.OPENCLAW_URL;
  if (!url) {
    throw new Error('OPENCLAW_URL or OPENCLAW_INSTANCES must be set');
  }

  return [
    {
      name: 'default',
      url: url.replace(/\/+$/, ''),
      token: process.env.OPENCLAW_GATEWAY_TOKEN ?? '',
      default: true,
    },
  ];
}

export function loadConfig(): AppConfig {
  const port = parseInt(process.env.PORT ?? '3100', 10);
  const host = process.env.HOST ?? '0.0.0.0';
  const debug = process.env.DEBUG === 'true';
  const publicUrl = (process.env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/+$/, '');
  const instances = parseInstances();

  return { port, host, debug, publicUrl, instances };
}

export function getDefaultInstance(config: AppConfig): InstanceConfig {
  return config.instances.find((i) => i.default) ?? config.instances[0];
}

export function getInstanceByName(config: AppConfig, name: string): InstanceConfig | undefined {
  return config.instances.find((i) => i.name === name);
}
