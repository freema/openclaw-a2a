// A2A v1.0 error codes — JSON-RPC standard + A2A specific

export const A2A_ERROR_CODES = {
  // Standard JSON-RPC
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // A2A specific
  TASK_NOT_FOUND: -32001,
  TASK_NOT_CANCELABLE: -32002,
  PUSH_NOTIFICATION_NOT_SUPPORTED: -32003,
  UNSUPPORTED_OPERATION: -32004,
  CONTENT_TYPE_NOT_SUPPORTED: -32005,
  EXTENSION_SUPPORT_REQUIRED: -32008,
  VERSION_NOT_SUPPORTED: -32009,
} as const;

export type A2AErrorCode = (typeof A2A_ERROR_CODES)[keyof typeof A2A_ERROR_CODES];

export class A2AError extends Error {
  readonly code: A2AErrorCode;
  readonly data?: unknown;

  constructor(code: A2AErrorCode, message: string, data?: unknown) {
    super(message);
    this.name = 'A2AError';
    this.code = code;
    this.data = data;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.data !== undefined ? { data: this.data } : {}),
    };
  }
}
