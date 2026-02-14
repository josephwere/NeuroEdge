// frontend/src/services/commandRegistry.ts

export type Command = {
  id: string;
  label: string;
  action: () => void;
  shortcut?: string; // optional
  category?: string; // for grouping
};

const commands: Command[] = [];

/**
 * Register a new command
 */
export const registerCommand = (cmd: Command) => {
  commands.push(cmd);
};

/**
 * Retrieve all commands
 */
export const getCommands = () => [...commands];

/**
 * Search commands by label
 */
export const searchCommands = (query: string) =>
  commands.filter(cmd => cmd.label.toLowerCase().includes(query.toLowerCase()));
