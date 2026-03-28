import { describe, it, expect } from 'vitest';
import { A2AError, A2A_ERROR_CODES } from '../../a2a/errors.js';

describe('A2A Errors', () => {
  it('creates error with code and message', () => {
    const err = new A2AError(A2A_ERROR_CODES.TASK_NOT_FOUND, 'Task not found');
    expect(err.code).toBe(-32001);
    expect(err.message).toBe('Task not found');
    expect(err.name).toBe('A2AError');
  });

  it('creates error with data', () => {
    const err = new A2AError(A2A_ERROR_CODES.VERSION_NOT_SUPPORTED, 'Bad version', {
      supportedVersions: ['1.0'],
    });
    expect(err.data).toEqual({ supportedVersions: ['1.0'] });
  });

  it('serializes to JSON correctly', () => {
    const err = new A2AError(A2A_ERROR_CODES.INTERNAL_ERROR, 'oops');
    const json = err.toJSON();
    expect(json.code).toBe(-32603);
    expect(json.message).toBe('oops');
    expect(json.data).toBeUndefined();
  });

  it('includes data in JSON when present', () => {
    const err = new A2AError(A2A_ERROR_CODES.INVALID_PARAMS, 'bad', { field: 'x' });
    const json = err.toJSON();
    expect(json.data).toEqual({ field: 'x' });
  });

  it('has all v1.0 error codes', () => {
    expect(A2A_ERROR_CODES.PARSE_ERROR).toBe(-32700);
    expect(A2A_ERROR_CODES.INVALID_REQUEST).toBe(-32600);
    expect(A2A_ERROR_CODES.METHOD_NOT_FOUND).toBe(-32601);
    expect(A2A_ERROR_CODES.INVALID_PARAMS).toBe(-32602);
    expect(A2A_ERROR_CODES.INTERNAL_ERROR).toBe(-32603);
    expect(A2A_ERROR_CODES.TASK_NOT_FOUND).toBe(-32001);
    expect(A2A_ERROR_CODES.TASK_NOT_CANCELABLE).toBe(-32002);
    expect(A2A_ERROR_CODES.PUSH_NOTIFICATION_NOT_SUPPORTED).toBe(-32003);
    expect(A2A_ERROR_CODES.UNSUPPORTED_OPERATION).toBe(-32004);
    expect(A2A_ERROR_CODES.CONTENT_TYPE_NOT_SUPPORTED).toBe(-32005);
    expect(A2A_ERROR_CODES.EXTENSION_SUPPORT_REQUIRED).toBe(-32008);
    expect(A2A_ERROR_CODES.VERSION_NOT_SUPPORTED).toBe(-32009);
  });
});
