import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { resolveDshHome } from './profile.js';

export type PluginOperation = 'add' | 'update' | 'remove';

export interface PluginOperationOptions {
  action: PluginOperation;
  subject?: string;
  profile: string;
  home?: string;
}

export interface PluginOperationResult {
  code: number;
  output: string;
}

interface DshInvocation {
  command: string;
  prefixArgs: string[];
}

function resolveDshInvocation(): DshInvocation {
  if (process.env.DSH_BIN) return { command: process.env.DSH_BIN, prefixArgs: [] };

  // A bundled desktop runtime launches this plugin inside `dsh/lib/bin.js`, but
  // does not expose a `dsh` executable on PATH. Reuse that exact entry point.
  const currentEntry = process.argv[1];
  if (currentEntry && /@deepseek-ai[/\\]dsh[/\\]lib[/\\]bin\.js$/.test(currentEntry)) {
    return { command: process.execPath, prefixArgs: [currentEntry] };
  }
  return { command: 'dsh', prefixArgs: [] };
}

function findPnpmBinDir(): string | undefined {
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const candidates = [
    process.env.PNPM_HOME,
    join(homedir(), 'Library', 'pnpm'),
    join(homedir(), '.local', 'share', 'pnpm'),
    join(homedir(), 'AppData', 'Local', 'pnpm'),
  ].filter((value): value is string => Boolean(value));
  const nvmRoot = process.env.NVM_DIR ?? join(homedir(), '.nvm');
  try {
    const versionsDir = join(nvmRoot, 'versions', 'node');
    const versions = readdirSync(versionsDir).sort().reverse();
    candidates.push(...versions.map((version) => join(versionsDir, version, 'bin')));
  } catch {
    // NVM is optional; retain the normal PATH lookup below.
  }
  return candidates.find((directory) => existsSync(join(directory, executable)));
}

/** Delegate dependency changes to the Harness CLI; never duplicate pnpm reconciliation. */
export function runOfficialDshPlugin(options: PluginOperationOptions): Promise<PluginOperationResult> {
  if ((options.action === 'add' || options.action === 'remove') && !options.subject) {
    return Promise.reject(new Error(`${options.action} requires a package name or package specifier`));
  }
  const args = ['plugin', '--profile', options.profile, options.action];
  if (options.subject) args.push(options.subject);
  const invocation = resolveDshInvocation();
  const pnpmBinDir = findPnpmBinDir();
  const path = pnpmBinDir
    ? `${pnpmBinDir}${delimiter}${process.env.PATH ?? ''}`
    : process.env.PATH;
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, [...invocation.prefixArgs, ...args], {
      env: { ...process.env, PATH: path, DSH_HOME: resolveDshHome(options.home) },
      shell: process.platform === 'win32',
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code: code ?? 1, output }));
  });
}
