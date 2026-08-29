import { describe, it, expect } from 'vitest';
import { DomainError } from '../../common/errors.js';
import { AgentExecutionError } from './agent-execution-error.js';

describe('AgentExecutionError', () => {
  it('is an instanceof AgentExecutionError and DomainError after being caught', () => {
    try {
      throw new AgentExecutionError('recon', 'epic-2-agents', 1, 'boom');
    } catch (err) {
      expect(err).toBeInstanceOf(AgentExecutionError);
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    }
  });

  it('exposes role, workspaceSlug, and cycle as readable fields', () => {
    const err = new AgentExecutionError('architect', 'epic-2-agents', 2, 'boom');
    expect(err.role).toBe('architect');
    expect(err.workspaceSlug).toBe('epic-2-agents');
    expect(err.cycle).toBe(2);
  });

  it('includes role, workspaceSlug, and cycle in the message', () => {
    const err = new AgentExecutionError('skeptic', 'epic-2-agents', 3, 'audit failed');
    expect(err.message).toContain('skeptic');
    expect(err.message).toContain('epic-2-agents');
    expect(err.message).toContain('3');
    expect(err.message).toContain('audit failed');
  });

  it('renders a placeholder in the message when cycle is undefined', () => {
    const err = new AgentExecutionError('recon', 'epic-2-agents', undefined, 'missing requirements');
    expect(err.cycle).toBeUndefined();
    expect(err.message).toContain('n/a');
  });

  it('carries an optional cause', () => {
    const cause = new Error('root cause');
    const err = new AgentExecutionError('recon', 'epic-2-agents', undefined, 'boom', cause);
    expect(err.cause).toBe(cause);
  });
});
