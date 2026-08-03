import { runMigrations, makeAiProviderRepo, makeAiModelRepo, makeAiTaskRouteRepo, makeAiUsageRepo, decryptSecret } from '@myfinance/core';
import { makeWealthHarness } from './src/index';
const DB = '/Users/vkhandelwal/Documents/MyFinance/demo.db';
const { db } = runMigrations(DB);
// CLEAN memory: in-memory LibSQL, no prior-thread recall pollution.
const h = makeWealthHarness({ routeRepo: makeAiTaskRouteRepo(db), modelRepo: makeAiModelRepo(db), providerRepo: makeAiProviderRepo(db), usageRepo: makeAiUsageRepo(db), decrypt: (b:string)=> b?decryptSecret(b):'', dbPath: DB, memoryUrl: ':memory:' });
const chat = await h.runChat({ message: 'Give me a final breakdown of my monthly income: where does it all go, and where is surplus deployed? My income is 348384/month.' });
let t=''; for await (const ev of chat.events){ if(ev.type==='text') t+=ev.text; }
await chat.done.catch(()=>{});
console.log('CHARS:', t.length); console.log('----'); console.log(t);
process.exit(0);
