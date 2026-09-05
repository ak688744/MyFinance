// One-off live verification for the response-calibration + ask_user work.
// Runs representative prompts from the real problem thread against demo.db with
// the configured wealth_chat model (haiku via Bedrock) and reports, per prompt:
// the reply char length, whether a `question` (ask_user) event fired, and the
// step labels. Not a unit test — this is the empirical calibration check.
//
// Run:
//   source ~/.nvm/nvm.sh && nvm use 22
//   cd packages/agent-harness
//   AWS_REGION=us-east-1 node_modules/.bin/tsx verify-calibration.mts

import {
  runMigrations,
  makeAiProviderRepo,
  makeAiModelRepo,
  makeAiTaskRouteRepo,
  makeAiUsageRepo,
  decryptSecret,
} from '@myfinance/core';
import { makeWealthHarness } from './src/index';

const DB = process.env.MYFINANCE_DB ?? '/Users/vkhandelwal/Documents/MyFinance/demo.db';
const memoryUrl = `file:${DB}.memory.db`;

const { db } = runMigrations(DB);
const harness = makeWealthHarness({
  routeRepo: makeAiTaskRouteRepo(db),
  modelRepo: makeAiModelRepo(db),
  providerRepo: makeAiProviderRepo(db),
  usageRepo: makeAiUsageRepo(db),
  // bedrock stores no secret; decrypt is only called for key-based dialects.
  decrypt: (blob: string) => (blob ? decryptSecret(blob) : ''),
  dbPath: DB,
  memoryUrl,
});

const PROMPTS = [
  { tag: 'quick/net-worth', text: 'What is my current net worth breakdown?' },
  { tag: 'open-advisory', text: 'What do you suggest for extra investments?' },
  { tag: 'fact-missing', text: 'Should I prepay my home loan or invest instead?' },
{ tag: 'full-breakdown', text: 'Can you give with final break up of my month with where surplus money will be deployed' },
];

for (const p of PROMPTS) {
  const chat = await harness.runChat({ message: p.text });
  let text = '';
  const steps: string[] = [];
  let question: { question: string; options: { label: string }[] } | null = null;
  for await (const ev of chat.events) {
    if (ev.type === 'text') text += ev.text;
    else if (ev.type === 'step') steps.push(ev.label);
    else if (ev.type === 'question') question = { question: ev.question, options: ev.options };
  }
  await chat.done.catch((e) => console.error(`[${p.tag}] done error:`, e?.message ?? e));
  console.log('\n============================================');
  console.log(`PROMPT [${p.tag}]: ${p.text}`);
  console.log(`  reply chars : ${text.length}`);
  console.log(`  steps       : ${steps.join(' | ') || '(none)'}`);
  console.log(`  ask_user    : ${question ? 'YES -> ' + question.question + ' :: [' + question.options.map((o) => o.label).join(', ') + ']' : 'no'}`);
  console.log('  --- reply ---');
  console.log(text || '(empty)');
}

process.exit(0);
