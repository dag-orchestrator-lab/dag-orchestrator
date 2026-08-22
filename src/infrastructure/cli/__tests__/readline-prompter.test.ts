import { describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import { ReadlinePrompter } from '../readline-prompter.js';

function createStreams(): { input: PassThrough; output: PassThrough } {
  return { input: new PassThrough(), output: new PassThrough() };
}

describe('ReadlinePrompter.askQuestion', () => {
  it('resolves with the line typed by the user', async () => {
    const { input, output } = createStreams();
    const prompter = new ReadlinePrompter(input, output);

    const answerPromise = prompter.askQuestion('Continue? ');
    input.write('yes\n');
    const answer = await answerPromise;

    expect(answer).toBe('yes');
    prompter.close();
  });
});

describe('ReadlinePrompter.askMultiLine', () => {
  it('stops collecting on an empty line', async () => {
    const { input, output } = createStreams();
    const prompter = new ReadlinePrompter(input, output);

    const resultPromise = prompter.askMultiLine('Enter notes:');
    input.write('line one\n');
    input.write('line two\n');
    input.write('\n');
    const result = await resultPromise;

    expect(result).toBe('line one\nline two');
    prompter.close();
  });

  it('stops collecting on a line equal to ---', async () => {
    const { input, output } = createStreams();
    const prompter = new ReadlinePrompter(input, output);

    const resultPromise = prompter.askMultiLine('Enter notes:');
    input.write('alpha\n');
    input.write('beta\n');
    input.write('---\n');
    const result = await resultPromise;

    expect(result).toBe('alpha\nbeta');
    prompter.close();
  });
});

describe('ReadlinePrompter.close', () => {
  it('is idempotent and does not throw when called twice', () => {
    const { input, output } = createStreams();
    const prompter = new ReadlinePrompter(input, output);

    expect(() => {
      prompter.close();
      prompter.close();
    }).not.toThrow();
  });
});
