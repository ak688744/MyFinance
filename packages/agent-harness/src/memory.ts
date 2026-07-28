import { Memory } from '@mastra/memory';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { fastembed } from '@mastra/fastembed';

const PROFILE_TEMPLATE = `# User Financial Profile
- **Name / who they are**:
- **Income & cadence**:
- **Risk tolerance**:
- **Goals** (e.g. retire by 55, buy a house):
- **Time horizons**:
- **Preferences** (e.g. count transfers as spend, favored asset classes):
- **Constraints / obligations** (loans, dependents):
- **Notes**:
`;

export function buildWealthMemory(opts: { storeUrl: string }): Memory {
  return new Memory({
    storage: new LibSQLStore({ id: 'wealth-memory-store', url: opts.storeUrl }),
    vector: new LibSQLVector({ id: 'wealth-memory-vector', url: opts.storeUrl }),
    embedder: fastembed,
    options: {
      lastMessages: 20,
      workingMemory: {
        enabled: true,
        template: PROFILE_TEMPLATE,
        scope: 'resource',
      },
      semanticRecall: { topK: 3, messageRange: 2, scope: 'resource' },
      generateTitle: true,
    },
  });
}
