import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io } from '../apps/web/node_modules/socket.io-client/build/esm/index.js';
const base = process.argv[2] || 'http://127.0.0.1:3101';
if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw new Error('This smoke test creates data: localhost only');
let token;
async function request(path, data, method = data ? 'POST' : 'GET', extra = {}) {
 const response = await fetch(base + '/api/v1' + path, {method, headers: {...(data ? {'Content-Type':'application/json'} : {}), ...(token ? {Authorization:'Bearer '+token} : {}), ...extra}, body:data ? JSON.stringify(data) : undefined});
 assert(response.ok, path + ' status ' + response.status + ': ' + (response.ok ? '' : await response.text()));
 return {data: await response.json(), response};
}
const email = 'deployment-smoke-' + randomUUID() + '@example.test';
const password = randomUUID() + '!';
assert.equal((await request('/health')).data.status,'ok');
const registered = await request('/auth/register',{email,password,displayName:'Deployment smoke'});
assert.match(registered.response.headers.get('set-cookie'),/HttpOnly/i);
assert.match(registered.response.headers.get('set-cookie'),/Secure/i);
const login = await request('/auth/login',{email,password});
token = login.data.accessToken;
const cookie = login.response.headers.get('set-cookie').split(';')[0];
assert((await request('/auth/refresh',{},'POST',{Cookie:cookie})).data.accessToken);
const team = (await request('/teams',{name:'Deployment smoke team'})).data.team;
const board = (await request('/teams/'+team.id+'/boards',{name:'Deployment smoke board'})).data.board;
const detail = (await request('/teams/'+team.id+'/boards/'+board.id)).data.board;
const socket = io(base,{transports:['websocket'],auth:{token},extraHeaders:{Origin:'http://localhost:5173'},autoConnect:false});
try {
 await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);socket.connect();setTimeout(()=>reject(new Error('Socket timeout')),10000).unref();});
 socket.emit('board:join',board.id);
 // Socket.IO packet order plus a round-trip confirms the join was processed before HTTP mutation.
 await new Promise(resolve=>{socket.io.engine.once('pong',resolve);setTimeout(resolve,300);});
 const received = new Promise((resolve,reject)=>{socket.once('card:created',resolve);setTimeout(()=>reject(new Error('Missing card broadcast')),5000).unref();});
 const card=(await request('/boards/'+board.id+'/cards',{title:'Deployment smoke persisted card',columnId:detail.columns[0].id})).data.card;
 assert.equal((await received).card.id,card.id);
 assert.equal((await request('/boards/'+board.id+'/cards/'+card.id)).data.card.title,card.title);
 const form = new FormData(); form.append('file',new Blob(['deployment attachment persistence'],{type:'text/plain'}),'smoke.txt');
 const response=await fetch(base+'/api/v1/boards/'+board.id+'/cards/'+card.id+'/attachments',{method:'POST',headers:{Authorization:'Bearer '+token},body:form});
 assert(response.ok,'Attachment upload '+response.status);
 const attachment=(await response.json()).attachment;
 assert.equal(await (await fetch(base+attachment.url)).text(),'deployment attachment persistence');
 const cors=await fetch(base+'/api/v1/health',{headers:{Origin:'http://localhost:5173'}});
 assert.equal(cors.headers.get('access-control-allow-origin'),'http://localhost:5173');
 console.log('PASS: compiled Linux API health, DB registration/login/refresh, Secure HttpOnly cookie, board/card persistence, direct WebSocket broadcast, attachment round-trip, exact-origin CORS.');
} finally { socket.disconnect(); }
