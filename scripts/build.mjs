import { execSync } from 'child_process';
import { readFileSync } from 'fs';

// Build the plugin the same way the official lnreader-plugins repo does:
// TypeScript -> ES5 (tsc __awaiter/__generator helpers, no native generators)
// then bundled with esbuild, @libs/* kept external for the host app to inject.
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const outFile = `.dist/wetriedtls-${version}.js`;

execSync(
  'npx tsc src/plugin.ts --target es5 --lib es2015,dom --module esnext ' +
    '--moduleResolution bundler --outDir .tsc-build --skipLibCheck ' +
    '--declaration false --sourceMap false',
  { stdio: 'inherit' },
);
execSync(
  `npx esbuild .tsc-build/plugin.js --bundle --format=cjs --platform=neutral ` +
    `--target=es5 --external:@libs/* --outfile=${outFile} --log-level=error`,
  { stdio: 'inherit' },
);
execSync(`node scripts/fix-exports.mjs ${outFile}`, { stdio: 'inherit' });
console.log(`build: wrote ${outFile}`);
