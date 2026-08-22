import { describe, it, expect } from 'vitest';
import { PipelineStep } from './value-objects/pipeline-step.js';
import {
  CliDomainError,
  DirtyWorkingTreeError,
  WorkspaceCollisionError,
  InvalidStepError,
  UnknownCommandError,
  StepExecutionFailedError,
} from './errors.js';

describe('CLI domain error hierarchy', () => {
  it('DirtyWorkingTreeError has correct name, message, and carries git status output', () => {
    const error = new DirtyWorkingTreeError('Working tree is dirty.', ' M src/foo.ts');
    expect(error).toBeInstanceOf(CliDomainError);
    expect(error.name).toBe('DirtyWorkingTreeError');
    expect(error.message).toBe('Working tree is dirty.');
    expect(error.gitStatusOutput).toBe(' M src/foo.ts');
  });

  it('WorkspaceCollisionError has correct name and templated message', () => {
    const error = new WorkspaceCollisionError('old-feature', 'new-feature');
    expect(error).toBeInstanceOf(CliDomainError);
    expect(error.name).toBe('WorkspaceCollisionError');
    expect(error.message).toBe(
      'Cannot create workspace "new-feature": workspace "old-feature" is currently active.'
    );
    expect(error.activeWorkspaceName).toBe('old-feature');
    expect(error.targetWorkspaceName).toBe('new-feature');
  });

  it('InvalidStepError has correct name and message', () => {
    const error = new InvalidStepError('Invalid pipeline step: 9. Expected integer between 0 and 4.');
    expect(error).toBeInstanceOf(CliDomainError);
    expect(error.name).toBe('InvalidStepError');
    expect(error.message).toBe('Invalid pipeline step: 9. Expected integer between 0 and 4.');
  });

  it('UnknownCommandError has correct name and templated message', () => {
    const error = new UnknownCommandError('frobnicate');
    expect(error).toBeInstanceOf(CliDomainError);
    expect(error.name).toBe('UnknownCommandError');
    expect(error.message).toBe('Unrecognized command: "frobnicate". Run "dag --help" for usage.');
    expect(error.rawCommand).toBe('frobnicate');
  });

  it('StepExecutionFailedError has correct name and templated message', () => {
    const stepResult = PipelineStep.create(2);
    if (!stepResult.isOk) throw new Error('expected PipelineStep.create(2) to succeed');
    const cause = new Error('LLM timeout');
    const error = new StepExecutionFailedError(stepResult.value, cause);
    expect(error).toBeInstanceOf(CliDomainError);
    expect(error.name).toBe('StepExecutionFailedError');
    expect(error.message).toBe('Pipeline step step2 failed: LLM timeout');
    expect(error.step).toBe(stepResult.value);
    expect(error.cause).toBe(cause);
  });
});
