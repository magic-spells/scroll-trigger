import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import serve from 'rollup-plugin-serve';
import copy from 'rollup-plugin-copy';
import postcss from 'rollup-plugin-postcss';

const dev = process.env.ROLLUP_WATCH;
const name = 'scroll-trigger';

// Shared CSS plugin config
const cssPlugin = postcss({
  extract: `${name}.css`,
  minimize: false,
  sourceMap: dev,
});

// Shared CSS plugin config (minimized version)
const cssMinPlugin = postcss({
  extract: `${name}.min.css`,
  minimize: true,
  sourceMap: dev,
});

export default [
  // ESM build
  {
    input: 'src/scroll-trigger.js',
    output: {
      file: `dist/${name}.esm.js`,
      format: 'es',
      sourcemap: true,
    },
    plugins: [
      resolve(),
      cssPlugin,
    ],
  },
  // CommonJS build
  {
    input: 'src/scroll-trigger.js',
    output: {
      file: `dist/${name}.cjs.js`,
      format: 'cjs',
      sourcemap: true,
      exports: 'named',
    },
    plugins: [resolve(), cssPlugin],
  },
  // UMD build
  {
    input: 'src/scroll-trigger.js',
    output: {
      file: `dist/${name}.js`,
      format: 'umd',
      name: 'ScrollTrigger',
      sourcemap: true,
      exports: 'default',
    },
    plugins: [resolve(), cssPlugin],
  },
  // Minified UMD for browsers
  {
    input: 'src/scroll-trigger.js',
    output: {
      file: `dist/${name}.min.js`,
      format: 'umd',
      name: 'ScrollTrigger',
      sourcemap: false,
      exports: 'default',
    },
    plugins: [
      resolve(),
      cssMinPlugin,
      terser({
        keep_classnames: true,
        format: {
          comments: false,
        },
      }),
    ],
  },
  // Development build
  ...(dev
    ? [
        {
          input: 'src/scroll-trigger.js',
          output: {
            file: `dist/${name}.esm.js`,
            format: 'es',
            sourcemap: true,
          },
          plugins: [
            resolve(),
            cssMinPlugin,
            serve({
              contentBase: ['dist', 'demo'],
              open: true,
              port: 3003,
            }),
            copy({
              targets: [
                {
                  src: `dist/${name}.esm.js`,
                  dest: 'demo',
                },
                {
                  src: `dist/${name}.esm.js.map`,
                  dest: 'demo',
                },
                {
                  src: `dist/${name}.min.css`,
                  dest: 'demo',
                },
              ],
              hook: 'writeBundle',
            }),
          ],
        },
      ]
    : []),
];
