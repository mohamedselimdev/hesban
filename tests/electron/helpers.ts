import { spawn } from 'node:child_process';
import { join } from 'node:path';

export const root = process.cwd();

export function run(
  command: string,
  args: string[],
  env: Record<string, string>,
  timeoutMs: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: 'ignore',
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out`));
    }, timeoutMs);
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
    child.on('error', reject);
  });
}

/**
 * Builds a variant of the app that contains the test probes (HESBAN_DEV_PROBES=1) into its own
 * folder, so the production `out/` folder never contains probe code.
 */
export function buildProbeVariant(outDir: string, extraEnv: Record<string, string> = {}) {
  return run(
    process.execPath,
    [join(root, 'node_modules/electron-vite/bin/electron-vite.js'), 'build'],
    { HESBAN_OUT_DIR: outDir, HESBAN_DEV_PROBES: '1', ...extraEnv },
    120_000,
  );
}
