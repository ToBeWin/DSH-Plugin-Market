/**
 * Harness bundle entry.
 *
 * The management surface deliberately runs outside the active Web session:
 * dependency changes must be applied before the next Harness boot. The local
 * CLI is the public entry point and delegates mutations to `dsh plugin`.
 */
import { startMarketServer } from './server.js';

export const name = 'opc-dsh-plugin-market';

/**
 * Start the dashboard beside the Web host. It is loopback-only and never
 * becomes a remote service. The browser bundle embeds it into Settings.
 */
export function apply(ctx: { effect(effect: () => void | (() => void | Promise<void>), label?: string): void }): void {
  let disposed = false;
  let close: (() => Promise<void>) | undefined;
  ctx.effect(() => {
    void startMarketServer({ profile: 'web' })
      .then((server) => {
        if (disposed) void server.close();
        else close = server.close;
      })
      .catch((error: unknown) => {
        console.warn(`dsh-plugin-market: local dashboard did not start: ${error instanceof Error ? error.message : String(error)}`);
      });
    return () => {
      disposed = true;
      return close?.();
    };
  }, 'dsh-plugin-market: loopback dashboard');
}
