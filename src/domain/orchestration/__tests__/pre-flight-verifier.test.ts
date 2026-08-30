import { describe, expect, it } from 'vitest';
import { verifyTaskChecklist } from '../validation/pre-flight-verifier.js';

describe('verifyTaskChecklist', () => {
  it('passes when every task has a Files: list and a Check: command', () => {
    const checklist = `### [ ] T-1 Implement Foo
Depends on: —
Lane: change
Files: \`src/foo.ts\`
Done when: Foo is implemented.
Check: \`npx vitest run\`

### [ ] T-2 Implement Bar
Depends on: T-1
Lane: change
Files: \`src/bar.ts\`
Done when: Bar is implemented.
Check: \`npx tsc --noEmit\`
`;

    const result = verifyTaskChecklist(checklist);

    expect(result.isValid).toBe(true);
    expect(result.missingFieldTaskTitles).toEqual([]);
  });

  it('flags a task missing a Files: field', () => {
    const checklist = `### [ ] T-1 Implement Foo
Depends on: —
Lane: change
Done when: Foo is implemented.
Check: \`npx vitest run\`
`;

    const result = verifyTaskChecklist(checklist);

    expect(result.isValid).toBe(false);
    expect(result.missingFieldTaskTitles).toEqual(['T-1 Implement Foo']);
  });

  it('flags a task missing a Check: field', () => {
    const checklist = `### [ ] T-1 Implement Foo
Depends on: —
Lane: change
Files: \`src/foo.ts\`
Done when: Foo is implemented.
`;

    const result = verifyTaskChecklist(checklist);

    expect(result.isValid).toBe(false);
    expect(result.missingFieldTaskTitles).toEqual(['T-1 Implement Foo']);
  });

  it('flags multiple tasks missing fields without duplicating a task with both missing', () => {
    const checklist = `### [ ] T-1 Implement Foo
Depends on: —
Lane: change
Done when: Foo is implemented.

### [ ] T-2 Implement Bar
Depends on: T-1
Lane: change
Files: \`src/bar.ts\`
Done when: Bar is implemented.
Check: \`npx tsc --noEmit\`
`;

    const result = verifyTaskChecklist(checklist);

    expect(result.isValid).toBe(false);
    expect(result.missingFieldTaskTitles).toEqual(['T-1 Implement Foo']);
  });

  it('treats a checklist with no task headings as invalid with no task titles', () => {
    const result = verifyTaskChecklist('No tasks here, just prose.');

    expect(result.isValid).toBe(false);
    expect(result.missingFieldTaskTitles).toEqual([]);
  });

  it('rejects an empty checklist', () => {
    const result = verifyTaskChecklist('');

    expect(result.isValid).toBe(false);
    expect(result.missingFieldTaskTitles).toEqual([]);
  });
});
