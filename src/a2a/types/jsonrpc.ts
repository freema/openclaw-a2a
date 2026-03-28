// JSON-RPC 2.0 types for A2A

import { A2AMethod } from './requests.js';

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: A2AMethod;
  params: unknown;
}

export interface JSONRPCResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string | number;
  result?: T;
  error?: JSONRPCError;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}
