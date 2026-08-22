import { createInterface, type Interface } from 'node:readline/promises';

/** Driving-adapter port for terminal interaction, mirroring legacy `bin/dag.js` prompting (see 02-contracts.md §Ports). */
export interface Prompter {
  /**
   * @param question - Single-line prompt text, mirrors legacy `askQuestion`.
   * @returns The user's answer.
   */
  askQuestion(question: string): Promise<string>;

  /**
   * @param question - Prompt text for a multi-line answer, mirrors legacy `askMultiLine`.
   * @returns The user's multi-line answer, terminated per legacy convention.
   */
  askMultiLine(question: string): Promise<string>;

  /** Releases the underlying readline interface. */
  close(): void;
}

/** `readline/promises`-backed implementation of {@link Prompter} (see 03-app-infra.md §2.1). */
export class ReadlinePrompter implements Prompter {
  private readonly rl: Interface;
  private readonly output: NodeJS.WritableStream;
  private isClosed = false;

  constructor(input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stdout) {
    this.rl = createInterface({ input, output });
    this.output = output;
  }

  /**
   * @param question - Single-line prompt text.
   * @returns The user's answer.
   */
  async askQuestion(question: string): Promise<string> {
    return this.rl.question(question);
  }

  /**
   * @param question - Prompt text for a multi-line answer.
   * @returns The collected lines joined by `\n`, stopped at an empty line or a line equal to `---`.
   */
  async askMultiLine(question: string): Promise<string> {
    this.output.write(`${question}\n`);
    return new Promise((resolve) => {
      const lines: string[] = [];
      const onLine = (line: string): void => {
        if (line === '' || line === '---') {
          this.rl.removeListener('line', onLine);
          resolve(lines.join('\n'));
          return;
        }
        lines.push(line);
      };
      this.rl.on('line', onLine);
    });
  }

  /** Releases the underlying readline interface; safe to call more than once. */
  close(): void {
    if (this.isClosed) {
      return;
    }
    this.isClosed = true;
    this.rl.close();
  }
}
