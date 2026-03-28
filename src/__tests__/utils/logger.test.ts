import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log, logError, logDebug, setDebug } from '../../utils/logger.js';

describe('Logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setDebug(false);
  });

  it('log outputs structured JSON', () => {
    log('test message', { key: 'value' });
    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output.level).toBe('info');
    expect(output.message).toBe('test message');
    expect(output.key).toBe('value');
    expect(output.timestamp).toBeDefined();
  });

  it('logError outputs to stderr', () => {
    logError('error msg', new Error('oops'));
    const output = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);
    expect(output.level).toBe('error');
    expect(output.error).toBe('oops');
  });

  it('logDebug only outputs when debug enabled', () => {
    logDebug('should not appear');
    expect(consoleSpy).not.toHaveBeenCalled();

    setDebug(true);
    logDebug('should appear');
    expect(consoleSpy).toHaveBeenCalledOnce();
  });
});
