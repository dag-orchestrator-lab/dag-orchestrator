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
