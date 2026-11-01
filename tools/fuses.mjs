import {
  FuseState,
  FuseV1Options,
  FuseVersion,
  flipFuses,
  getCurrentFuseWire,
} from '@electron/fuses';

/** Fuse settings required by the HESBAN threat model (SEC-02). */
export const requiredFuses = {
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
};

export async function applyFuses(electronExePath) {
  await flipFuses(electronExePath, { version: FuseVersion.V1, ...requiredFuses });
}

/** Returns a list of fuse names whose current value differs from the requirement. */
export async function findFuseViolations(electronExePath) {
  const current = await getCurrentFuseWire(electronExePath);
  const violations = [];
  for (const [key, expected] of Object.entries(requiredFuses)) {
    const actual = current[key];
    const want = expected ? FuseState.ENABLE : FuseState.DISABLE;
    if (actual !== want) {
      violations.push(`${FuseV1Options[key]}: expected ${expected}, got ${String(actual)}`);
    }
  }
  return violations;
}
