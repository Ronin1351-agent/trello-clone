import fs from 'node:fs';
const target = new URL(process.argv[2] || 'https://api.example.invalid');
if (target.protocol !== 'https:' || target.username || target.password || target.pathname !== '/' || target.search || target.hash) {
  throw new Error('Pass an HTTPS API origin without a path, credentials, query, or fragment');
}
const config = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  framework: null,
  installCommand: 'pnpm install --frozen-lockfile',
  buildCommand: 'pnpm --filter @trello-clone/shared build && pnpm --filter @trello-clone/web build',
  outputDirectory: 'apps/web/dist',
  routes: [
    { src: '/api/(.*)', dest: target.origin + '/api/$1', headers: {'Cache-Control': 'private, no-store'} },
    { src: '/uploads/(.*)', dest: target.origin + '/uploads/$1' },
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/index.html' }
  ]
};
fs.writeFileSync(new URL('../vercel.json', import.meta.url), JSON.stringify(config, null, 2) + '\n');
console.log('Prepared frontend routing for ' + target.origin + '. No deployment performed.');
