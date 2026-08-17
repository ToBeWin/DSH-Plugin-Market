#!/usr/bin/env node

import { listInstalledPlugins, resolveDshHome, setPluginEnabled } from './profile.js';
import { runOfficialDshPlugin } from './operations.js';
import { startMarketServer } from './server.js';

interface Options {
  profile: string;
  home?: string;
  json: boolean;
  yes: boolean;
  port?: number;
}

function usage(): string {
  return `DSH Plugin Market — local profile plugin manager

Usage:
  dsh-plugin-market list [--profile web] [--home <DSH_HOME>] [--json]
  dsh-plugin-market enable <package> [--profile web] [--home <DSH_HOME>]
  dsh-plugin-market disable <package> [--profile web] [--home <DSH_HOME>]
  dsh-plugin-market install <spec> [--profile web] [--home <DSH_HOME>]
  dsh-plugin-market update [package] [--profile web] [--home <DSH_HOME>]
  dsh-plugin-market remove <package> --yes [--profile web] [--home <DSH_HOME>]
  dsh-plugin-market serve [--profile web] [--home <DSH_HOME>] [--port 39183]

Install, update, and remove delegate to the official \`dsh plugin\` command.
Enable/disable only changes the local profile layer; a later \`dsh plugin\`
dependency operation reconciles installed bundles and may re-enable them.`;
}

function parse(argv: string[]): { command?: string; subject?: string; options: Options } {
  const options: Options = { profile: 'web', json: false, yes: false };
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--profile') {
      options.profile = argv[++index] ?? '';
    } else if (argument === '--home') {
      options.home = argv[++index] ?? '';
    } else if (argument === '--json') {
      options.json = true;
    } else if (argument === '--yes') {
      options.yes = true;
    } else if (argument === '--port') {
      const value = Number(argv[++index]);
      if (!Number.isInteger(value) || value < 1 || value > 65_535) throw new Error('--port must be a valid TCP port');
      options.port = value;
    } else if (argument === '--help' || argument === '-h') {
      return { options };
    } else {
      positional.push(argument);
    }
  }
  return { command: positional[0], subject: positional[1], options };
}

function printInventory(options: Options): void {
  const inventory = listInstalledPlugins(options.profile, options.home);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
    return;
  }
  process.stdout.write(`Profile: ${inventory.profile}\nLocation: ${inventory.profileDir}\n\n`);
  if (inventory.plugins.length === 0) {
    process.stdout.write('No out-of-tree plugins are installed.\n');
    return;
  }
  for (const plugin of inventory.plugins) {
    const status = plugin.enabled ? 'enabled' : 'disabled';
    const type = plugin.source === 'profile-layer' ? 'in-box layer' : plugin.bundle ? 'bundle' : 'dependency';
    const version = plugin.installedVersion ?? plugin.requestedVersion ?? 'unknown';
    process.stdout.write(`${status.padEnd(8)} ${type.padEnd(10)} ${plugin.name}@${version}\n`);
  }
}

async function delegate(action: 'add' | 'update' | 'remove', subject: string | undefined, options: Options): Promise<void> {
  if ((action === 'add' || action === 'remove') && !subject) {
    throw new Error(`${action} requires a package name or package specifier`);
  }
  if (action === 'remove' && !options.yes) {
    throw new Error('remove changes the profile dependency tree; re-run with --yes to confirm');
  }
  const result = await runOfficialDshPlugin({ action, subject, profile: options.profile, home: options.home });
  process.stdout.write(result.output);
  if (result.code !== 0) process.exitCode = result.code;
}

async function main(): Promise<void> {
  const { command, subject, options } = parse(process.argv.slice(2));
  if (!command || command === 'help') {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (command === 'list') return printInventory(options);
  if (command === 'enable' || command === 'disable') {
    if (!subject) throw new Error(`${command} requires a package name`);
    const plugin = setPluginEnabled(options.profile, subject, command === 'enable', options.home);
    process.stdout.write(`${plugin.name} is now ${plugin.enabled ? 'enabled' : 'disabled'} for profile ${options.profile}.\n`);
    return;
  }
  if (command === 'install') return delegate('add', subject, options);
  if (command === 'update') return delegate('update', subject, options);
  if (command === 'remove') return delegate('remove', subject, options);
  if (command === 'serve') {
    const server = await startMarketServer({ profile: options.profile, home: options.home, port: options.port });
    process.stdout.write(`DSH Plugin Market is running locally at ${server.url}\nPress Ctrl+C to stop it.\n`);
    const close = async () => {
      await server.close();
      process.exit(0);
    };
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`dsh-plugin-market: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
