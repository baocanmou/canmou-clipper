import { build } from 'esbuild';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

rmSync('dist', { recursive: true, force: true });
cpSync('static', 'dist', { recursive: true });

// 版本号只在 package.json 维护
const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
manifest.version = version;
writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, '\t'));

await build({
	entryPoints: ['src/popup.ts', 'src/options.ts', 'src/background.ts', 'src/page.ts'],
	outdir: 'dist',
	bundle: true,
	format: 'iife',
	target: 'chrome120',
	minify: true,
	legalComments: 'none',
});

console.log(`dist/ 已生成，版本 ${version}`);
