import path from 'node:path';

/** Directory name of the `.dag` workspace root, relative to `rootDir`. */
const DAG_DIR_NAME = '.dag';

/** Directory name for active feature workspaces, relative to `dagDir`. */
const FEATURES_DIR_NAME = 'features';

/** Directory name for archived feature workspaces, relative to `dagDir` — must match `src/state.js`'s literal exactly. */
const ARCHIVED_DIR_NAME = 'archive';

export interface Configuration {
  readonly rootDir: string;
  readonly dagDir: string;
  readonly featuresDir: string;
  readonly archivedDir: string;
}

/**
 * @returns The resolved workspace configuration, rooted at `DAG_WORKSPACE_ROOT` if set, else `process.cwd()`.
 */
export function resolveConfiguration(): Configuration {
  const rootDir = process.env.DAG_WORKSPACE_ROOT ?? process.cwd();
  const dagDir = path.join(rootDir, DAG_DIR_NAME);
  const featuresDir = path.join(dagDir, FEATURES_DIR_NAME);
  const archivedDir = path.join(dagDir, ARCHIVED_DIR_NAME);
  return { rootDir, dagDir, featuresDir, archivedDir };
}
