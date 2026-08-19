import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    // The bridge reads `import.meta.env.QUASAR_TARGET` at module load. Vitest externalises
    // node_modules by default, so the file would be loaded raw by Node where `import.meta.env`
    // does not exist. Inlining it routes the module through Vite's transform — the same one a
    // real BEX build applies.
    server: {deps: {inline: ['@quasar/app-vite']}},
  },
});
