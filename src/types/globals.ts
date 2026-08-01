/**
 * Build-time constant injected by esbuild.
 * `true` in development/watch builds, `false` in production.
 * Code guarded by `if (__DEV__)` is tree-shaken from production bundles.
 */
export {};
declare global {
    const __DEV__: boolean;
}
