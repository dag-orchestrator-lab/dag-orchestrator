import { describe, it, expect, vi } from 'vitest';
import {
  ReviewerAgent,
  type ReviewerCreateAddendumInput,
} from './reviewer-agent.js';
import {
  REVIEW_COMPLETED_EVENT_NAME,
  CONTRACT_ADDENDUM_CREATED_EVENT_NAME,
} from '../../../domain/orchestration/events/reviewer-events.js';
import { ImmutableAddendumViolationError } from '../../../domain/orchestration/errors/immutable-addendum-violation-error.js';
import type { WorkspaceFileSystemPort } from '../../../domain/orchestration/ports/workspace-file-system-port.js';
import type { IpcBusPort } from '../../../domain/orchestration/ports/ipc-bus-port.js';

function createWorkspaceFileSystem(): WorkspaceFileSystemPort {
  return {
    readFile: vi.fn(),
    writeFile: vi.fn(async () => undefined),
    fileExists: vi.fn(),
    readFeedbackRecord: vi.fn(),
    writeFeedbackRecord: vi.fn(),
  };
}

function createIpcBus(): IpcBusPort {
  return {
    publish: vi.fn(),
    subscribe: vi.fn(),
  };
}

function createAddendumInput(overrides: Partial<ReviewerCreateAddendumInput> = {}): ReviewerCreateAddendumInput {
  return {
    featureId: 'feature-x',
    workspaceSlug: 'feature-x-workspace',
    addendumSequence: 1,
    priorAddendumSequences: [],
    addendumContent: 'addendum body',
    createdAt: new Date('2026-08-30T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ReviewerAgent', () => {
  describe('generateReview', () => {
    it('writes REVIEW.md via temp-file-then-rename and publishes ReviewCompletedEvent', async () => {
      const workspaceFileSystem = createWorkspaceFileSystem();
      const ipcBus = createIpcBus();
      const agent = new ReviewerAgent(workspaceFileSystem, ipcBus);

      const result = await agent.generateReview({
        featureId: 'feature-x',
        workspaceSlug: 'feature-x-workspace',
        reviewContent: '# Impact Report',
      });

      expect(result.isOk).toBe(true);
      expect(workspaceFileSystem.writeFile).toHaveBeenNthCalledWith(
        1,
        'feature-x-workspace',
        '.REVIEW.md.tmp',
        '# Impact Report'
      );
      expect(workspaceFileSystem.writeFile).toHaveBeenNthCalledWith(
        2,
        'feature-x-workspace',
        'REVIEW.md',
        '# Impact Report'
      );
      expect(ipcBus.publish).toHaveBeenCalledWith(REVIEW_COMPLETED_EVENT_NAME, {
        featureId: 'feature-x',
        reviewArtifactPath: 'REVIEW.md',
      });
    });

    it('writes REVIEW.md content containing every required section header from docs/artifacts/review-md.md', async () => {
      const workspaceFileSystem = createWorkspaceFileSystem();
      const ipcBus = createIpcBus();
      const agent = new ReviewerAgent(workspaceFileSystem, ipcBus);

      const reviewContent = [
        '# Review & Impact Report — Feature: feature-x',
        '',
        '## Executive Summary',
        '- **Status**: Completed / Ready for Gate 4 Approval',
        '',
        '## Task Verification Log',
        '| Task ID | Description | Status | Fixer Retries |',
        '',
        '## Gate 4 Action Required',
        'This feature is paused awaiting Gate 4 sign-off.',
      ].join('\n');

      await agent.generateReview({
        featureId: 'feature-x',
        workspaceSlug: 'feature-x-workspace',
        reviewContent,
      });

      const writtenContent = (workspaceFileSystem.writeFile as ReturnType<typeof vi.fn>).mock.calls[1][2] as string;
      expect(writtenContent).toContain('## Executive Summary');
      expect(writtenContent).toContain('## Task Verification Log');
      expect(writtenContent).toContain('## Gate 4 Action Required');
    });
  });

  describe('createContractAddendum', () => {
    it('constructs a ContractAddendum, writes it via temp-file-then-rename, and publishes ContractAddendumCreatedEvent', async () => {
      const workspaceFileSystem = createWorkspaceFileSystem();
      const ipcBus = createIpcBus();
      const agent = new ReviewerAgent(workspaceFileSystem, ipcBus);

      const result = await agent.createContractAddendum(createAddendumInput());

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.addendum.featureId).toBe('feature-x');
        expect(result.value.addendum.addendumSequence).toBe(1);
        expect(result.value.addendum.content).toBe('addendum body');
        expect(result.value.addendum.filePath).toBe('contract-addendum-1.md');
      }

      expect(workspaceFileSystem.writeFile).toHaveBeenNthCalledWith(
        1,
        'feature-x-workspace',
        '.contract-addendum-1.md.tmp',
        'addendum body'
      );
      expect(workspaceFileSystem.writeFile).toHaveBeenNthCalledWith(
        2,
        'feature-x-workspace',
        'contract-addendum-1.md',
        'addendum body'
      );
      expect(ipcBus.publish).toHaveBeenCalledWith(CONTRACT_ADDENDUM_CREATED_EVENT_NAME, {
        featureId: 'feature-x',
        addendumSequence: 1,
        addendumPath: 'contract-addendum-1.md',
      });
    });

    it('throws ImmutableAddendumViolationError and writes nothing when the sequence duplicates a prior addendum', async () => {
      const workspaceFileSystem = createWorkspaceFileSystem();
      const ipcBus = createIpcBus();
      const agent = new ReviewerAgent(workspaceFileSystem, ipcBus);

      await expect(
        agent.createContractAddendum(createAddendumInput({ addendumSequence: 1, priorAddendumSequences: [1] }))
      ).rejects.toThrow(ImmutableAddendumViolationError);

      expect(workspaceFileSystem.writeFile).not.toHaveBeenCalled();
      expect(ipcBus.publish).not.toHaveBeenCalled();
    });

    it('never mutates a prior addendum file when a second, sequential addendum is written', async () => {
      const writtenFiles = new Map<string, string>();
      const workspaceFileSystem: WorkspaceFileSystemPort = {
        readFile: vi.fn(),
        writeFile: vi.fn(async (_slug: string, relativePath: string, content: string) => {
          writtenFiles.set(relativePath, content);
        }),
        fileExists: vi.fn(),
        readFeedbackRecord: vi.fn(),
        writeFeedbackRecord: vi.fn(),
      };
      const ipcBus = createIpcBus();
      const agent = new ReviewerAgent(workspaceFileSystem, ipcBus);

      await agent.createContractAddendum(
        createAddendumInput({ addendumSequence: 1, priorAddendumSequences: [], addendumContent: 'first body' })
      );
      const firstFileBytesAfterFirstWrite = writtenFiles.get('contract-addendum-1.md');

      await agent.createContractAddendum(
        createAddendumInput({ addendumSequence: 2, priorAddendumSequences: [1], addendumContent: 'second body' })
      );

      expect(writtenFiles.get('contract-addendum-1.md')).toBe(firstFileBytesAfterFirstWrite);
      expect(writtenFiles.get('contract-addendum-1.md')).toBe('first body');
      expect(writtenFiles.get('contract-addendum-2.md')).toBe('second body');
    });

    it('writes addendum content containing every required section header from docs/artifacts/contract-addendum.md', async () => {
      const workspaceFileSystem = createWorkspaceFileSystem();
      const ipcBus = createIpcBus();
      const agent = new ReviewerAgent(workspaceFileSystem, ipcBus);

      const addendumContent = [
        '# Contract Addendum #1',
        '',
        '- **Feature ID**: feature-x',
        '- **Addendum Sequence**: 1',
        '- **Generated At**: 2026-08-30T00:00:00.000Z',
        '- **Gate 4 Feedback Reference**: GateApproval(featureId=feature-x, gateNumber=4)',
        '',
        '## Requested Changes & Feedback Summary',
        'Feedback body.',
        '',
        '## Amended Contract Requirements',
        'Amended requirements body.',
      ].join('\n');

      await agent.createContractAddendum(createAddendumInput({ addendumContent }));

      const writtenContent = (workspaceFileSystem.writeFile as ReturnType<typeof vi.fn>).mock.calls[1][2] as string;
      expect(writtenContent).toContain('- **Feature ID**: feature-x');
      expect(writtenContent).toContain('- **Addendum Sequence**: 1');
      expect(writtenContent).toContain('- **Generated At**:');
      expect(writtenContent).toContain('- **Gate 4 Feedback Reference**: GateApproval(featureId=feature-x, gateNumber=4)');
      expect(writtenContent).toContain('## Requested Changes & Feedback Summary');
      expect(writtenContent).toContain('## Amended Contract Requirements');
    });
  });
});
