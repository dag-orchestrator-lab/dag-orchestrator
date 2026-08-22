export type CommandType =
  | 'init'
  | 'doctor'
  | 'features'
  | 'plan'
  | 'new'
  | 'archive'
  | 'rollback'
  | 'config'
  | 'step0'
  | 'step1'
  | 'step2'
  | 'step3'
  | 'step4'
  | 'unknown';

export interface ParsedCommand {
  type: CommandType;
  args: string[];
  flags: Record<string, string | boolean>;
  rawCommand: string;
}

const KNOWN_COMMANDS: readonly CommandType[] = [
  'init', 'doctor', 'features', 'plan', 'new', 'archive',
  'rollback', 'config', 'step0', 'step1', 'step2', 'step3', 'step4',
];

/** Zero-dependency parser mapping raw process.argv into a typed ParsedCommand. */
export class CliParser {
  /**
   * @param argv raw process.argv (node path, script path, command, ...args)
   * @returns the parsed command descriptor
   */
  static parse(argv: string[]): ParsedCommand {
    const argsWithoutNode = argv.slice(2);
    if (argsWithoutNode.length === 0) {
      return { type: 'unknown', args: [], flags: {}, rawCommand: '' };
    }

    const commandStr = argsWithoutNode[0].toLowerCase();
    const rawArgs = argsWithoutNode.slice(1);

    const args: string[] = [];
    const flags: Record<string, string | boolean> = {};

    for (let i = 0; i < rawArgs.length; i++) {
      const arg = rawArgs[i];
      if (arg.startsWith('--')) {
        const flagName = arg.slice(2);
        if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('-')) {
          flags[flagName] = rawArgs[i + 1];
          i++;
        } else {
          flags[flagName] = true;
        }
      } else if (arg.startsWith('-')) {
        const flagName = arg.slice(1);
        flags[flagName] = true;
      } else {
        args.push(arg);
      }
    }

    const type: CommandType = KNOWN_COMMANDS.includes(commandStr as CommandType)
      ? (commandStr as CommandType)
      : 'unknown';

    return {
      type,
      args,
      flags,
      rawCommand: commandStr,
    };
  }
}
