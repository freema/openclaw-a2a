// A2A v1.0 — Agent Card types

export interface AgentCard {
  name: string;
  description: string;
  version: string;
  provider?: AgentProvider;
  iconUrl?: string;
  documentationUrl?: string;
  supportedInterfaces: AgentInterface[]; // v1.0: replaces url + additionalInterfaces
  capabilities: AgentCapabilities;
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  skills: AgentSkill[];
  securitySchemes?: Record<string, SecurityScheme>;
  security?: SecurityRequirement[];
  extensions?: AgentExtension[];
}

export interface AgentProvider {
  organization: string;
  url?: string;
}

export interface AgentInterface {
  url: string;
  protocolBinding: 'JSONRPC' | 'REST' | 'GRPC';
  protocolVersion: string; // "1.0"
  tenant?: string;
}

export interface AgentCapabilities {
  streaming?: boolean;
  pushNotifications?: boolean;
  stateTransitionHistory?: boolean;
  extendedAgentCard?: boolean;
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

export interface SecurityScheme {
  type: string;
  scheme?: string;
  bearerFormat?: string;
  flows?: Record<string, unknown>;
  openIdConnectUrl?: string;
}

export type SecurityRequirement = Record<string, string[]>;

export interface AgentExtension {
  uri: string;
  description?: string;
  required?: boolean;
  params?: Record<string, unknown>;
}
