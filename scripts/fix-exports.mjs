import { readFileSync, writeFileSync } from 'fs';

// LNReader loads plugin bundles in a sandbox that provides `exports` and
// `require`, but NOT `module` (matching the official plugin bundles, which
// end with `exports.default = new Plugin()`). esbuild's cjs output uses
// `module.exports`, which throws in that sandbox and makes installs fail,
// so rewrite it to the official style.
//
// Note: `plugin_default` is declared at the END of the bundle (var hoisting
// means it is undefined at the top), so the assignment must be appended at
// the end, not placed where `module.exports` was.
const p = process.argv[2] || '.dist/wetriedtls.js';
let s = readFileSync(p, 'utf8');
const needle = 'module.exports = __toCommonJS(plugin_exports);';
if (!s.includes(needle)) {
  console.error('fix-exports: pattern not found, bundle layout may have changed');
  process.exit(1);
}
s = s.replace(needle + '\n', '');
if (!s.endsWith('\n')) s += '\n';
// Primary contract (all LNReader v2 loaders read `exports.default`).
s += 'exports.default = plugin_default;\n';
// Belt and braces: if a host exposes `module` separately, mirror the
// instance there too. This is a property assignment, never a reassignment
// of `module.exports`, so it cannot break loaders where `exports` and
// `module.exports` start as the same object.
s +=
  'try { if (typeof module !== "undefined" && module && module.exports) module.exports.default = plugin_default; } catch (e) {}\n';
writeFileSync(p, s);
console.log('fix-exports: bundle now uses exports.default');
