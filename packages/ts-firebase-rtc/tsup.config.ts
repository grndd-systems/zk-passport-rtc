import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'react/index': 'src/react/index.ts',
    'core/signaling/FirebaseSignalingClient': 'src/core/signaling/FirebaseSignalingClient.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  external: ['react', 'firebase'],
  esbuildOptions(options) {
    options.conditions = ['module'];
  },
});
