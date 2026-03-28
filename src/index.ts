// openclaw-a2a — A2A v1.0 bridge for OpenClaw
// CLI entrypoint

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { loadConfig } from './config/index.js';
import { startServer } from './server/index.js';
import { setDebug } from './utils/logger.js';

declare const __PKG_VERSION__: string;

const argv = yargs(hideBin(process.argv))
  .scriptName('openclaw-a2a')
  .version(typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : '0.1.0-beta.1')
  .option('port', {
    alias: 'p',
    type: 'number',
    description: 'Server port',
  })
  .option('host', {
    type: 'string',
    description: 'Server host',
  })
  .option('openclaw-url', {
    type: 'string',
    description: 'OpenClaw Gateway URL',
  })
  .option('token', {
    type: 'string',
    description: 'OpenClaw Gateway token',
  })
  .option('debug', {
    type: 'boolean',
    description: 'Enable debug logging',
  })
  .parseSync();

// Override env vars with CLI args
if (argv.port) process.env.PORT = String(argv.port);
if (argv.host) process.env.HOST = argv.host;
if (argv['openclaw-url']) process.env.OPENCLAW_URL = argv['openclaw-url'] as string;
if (argv.token) process.env.OPENCLAW_GATEWAY_TOKEN = argv.token;
if (argv.debug) process.env.DEBUG = 'true';

const config = loadConfig();
setDebug(config.debug);
startServer(config);
