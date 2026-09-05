import { runMigrations, makeAiProviderRepo, makeAiModelRepo, makeAiTaskRouteRepo, makeAiUsageRepo, decryptSecret } from '@myfinance/core';
import { makeWealthHarness } from './src/index';
const DB = '/Users/vkhandelwal/Documents/MyFinance/demo.db';
const { db } = runMigrations(DB);
const h = makeWealthHarness({ routeRepo: makeAiTaskRouteRepo(db), modelRepo: makeAiModelRepo(db), providerRepo: makeAiProviderRepo(db), usageRepo: makeAiUsageRepo(db), decrypt: (b:string)=> b?decryptSecret(b):'', dbPath: DB, memoryUrl: `file:${DB}.memory.db` });
const chat = await h.runChat({ message: 'Can you give with final break up of my month with where surplus money will be deployed' });
let t=''; for await (const ev of chat.events){ if(ev.type==='text') t+=ev.text; }
await chat.done.catch(()=>{});
console.log('CHARS:', t.length); console.log('----'); console.log(t);
process.exit(0);
