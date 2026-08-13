import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  envDir: '../../',
  resolve: {
    alias: {
      '@anti-kragle/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Pinned deliberately, not inherited. These are vitest defaults today, and
    // the suite's correctness depends on them: running with `--no-isolate`
    // (the usual "speed up CI" knob) fails 4 tests here and 19 in core, because
    // a shared module registry lets one file's imports defeat another's mocks.
    // Making them explicit means such a change is a visible edit, not a silent
    // regression behind a green build.
    isolate: true,
    // See the note in the root vitest.config.ts — spies are restored after each
    // test so no test can pass on a mock another test installed.
    restoreMocks: true,
  },
});
