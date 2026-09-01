/** esbuild `loader: { '.wasm': 'binary' }` resolves .wasm imports to Uint8Array. */
declare module '*.wasm' {
    const bytes: Uint8Array;
    export default bytes;
}
