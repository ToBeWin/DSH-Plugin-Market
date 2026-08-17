import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface PackageManifest {
  name?: string;
  version?: string;
  description?: string;
  dependencies?: Record<string, string>;
  dsh?: {
    bundle?: {
      patch?: string;
    };
    profile?: {
      bundles?: string[];
    };
  };
}

export interface InstalledPlugin {
  name: string;
  requestedVersion?: string;
  installedVersion?: string;
  description?: string;
  source: 'profile-dependency' | 'profile-layer';
  bundle: boolean;
  enabled: boolean;
  installed: boolean;
}

export interface ProfileInventory {
  home: string;
  profile: string;
  profileDir: string;
  plugins: InstalledPlugin[];
}

const PROFILE_NAME = /^[a-zA-Z0-9_-]+$/;

export function resolveDshHome(home = process.env.DSH_HOME): string {
  return home && home.trim().length > 0 ? home : join(homedir(), '.dsh');
}

export function resolveProfileDirectory(profile: string, home?: string): string {
  if (!PROFILE_NAME.test(profile)) {
    throw new Error(`Invalid profile name: ${profile}`);
  }
  return join(resolveDshHome(home), 'profiles', profile);
}

export function readProfileManifest(profile: string, home?: string): {
  profileDir: string;
  manifest: PackageManifest;
} {
  const profileDir = resolveProfileDirectory(profile, home);
  const manifestPath = join(profileDir, 'package.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Profile ${profile} is not initialized at ${profileDir}`);
  }
  return {
    profileDir,
    manifest: JSON.parse(readFileSync(manifestPath, 'utf8')) as PackageManifest,
  };
}

function packageManifest(profileDir: string, name: string): PackageManifest | undefined {
  const manifestPath = join(profileDir, 'node_modules', ...name.split('/'), 'package.json');
  if (!existsSync(manifestPath)) return undefined;
  try {
    // Follow pnpm's symlink, but only read the package manifest it points to.
    return JSON.parse(readFileSync(realpathSync(manifestPath), 'utf8')) as PackageManifest;
  } catch {
    return undefined;
  }
}

export function listInstalledPlugins(profile: string, home?: string): ProfileInventory {
  const { profileDir, manifest } = readProfileManifest(profile, home);
  const dependencies = manifest.dependencies ?? {};
  const enabledBundles = new Set(manifest.dsh?.profile?.bundles ?? []);
  const names = new Set([...Object.keys(dependencies), ...enabledBundles]);
  const plugins = [...names]
    .sort((left, right) => left.localeCompare(right))
    .map((name): InstalledPlugin => {
      const installed = packageManifest(profileDir, name);
      const bundle = installed?.dsh?.bundle?.patch !== undefined;
      const isDependency = Object.hasOwn(dependencies, name);
      return {
        name,
        requestedVersion: dependencies[name],
        installedVersion: installed?.version,
        description: installed?.description,
        source: isDependency ? 'profile-dependency' : 'profile-layer',
        bundle,
        enabled: enabledBundles.has(name),
        installed: installed !== undefined,
      };
    });
  return { home: resolveDshHome(home), profile, profileDir, plugins };
}

export function setPluginEnabled(
  profile: string,
  packageName: string,
  enabled: boolean,
  home?: string,
): InstalledPlugin {
  const { profileDir, manifest } = readProfileManifest(profile, home);
  const dependencies = manifest.dependencies ?? {};
  if (!Object.hasOwn(dependencies, packageName)) {
    throw new Error(`${packageName} is not an out-of-tree dependency of profile ${profile}`);
  }
  const installed = packageManifest(profileDir, packageName);
  if (installed?.dsh?.bundle?.patch === undefined) {
    throw new Error(`${packageName} is not a DSH bundle and cannot be enabled as a profile layer`);
  }
  const bundles = [...new Set(manifest.dsh?.profile?.bundles ?? [])];
  const index = bundles.indexOf(packageName);
  if (enabled && index === -1) bundles.push(packageName);
  if (!enabled && index !== -1) bundles.splice(index, 1);
  manifest.dsh = {
    ...manifest.dsh,
    profile: {
      ...manifest.dsh?.profile,
      bundles,
    },
  };
  writeFileSync(join(profileDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return listInstalledPlugins(profile, home).plugins.find((plugin) => plugin.name === packageName)!;
}
