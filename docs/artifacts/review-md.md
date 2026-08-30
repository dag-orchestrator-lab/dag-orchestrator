# `REVIEW.md` Artifact Fixture Template

Reference fixture for the Reviewer Agent's Gate 4 impact report, per `03-data.md` §2.2.
`ReviewerAgent.generateReview` writes content matching this shape via temp-file-then-rename
(`.REVIEW.md.tmp` → `REVIEW.md`); it never invents or omits these section headers.

## Required section headers

- `# Review & Impact Report — Feature: <feature-id>`
- `## Executive Summary`
- `## Task Verification Log`
- `## Gate 4 Action Required`

## Fixture

```markdown
# Review & Impact Report — Feature: <feature-id>

## Executive Summary
- **Status**: Completed / Ready for Gate 4 Approval
- **Tasks Processed**: <count>
- **Fixer Auto-Heal Interventions**: <count>

## Task Verification Log
| Task ID | Description | Status | Fixer Retries |
|---|---|---|---|
| TASK-01 | Implemented SubprocessExecutionPort | PASSED | 0 |
| TASK-02 | Wired Coder Agent to pipeline | PASSED | 1 |

## Risk & Contract Compliance Verification
- **Contract Adherence**: Confirmed against `02-contracts.md`.
- **Invariants Checked**:
  - `PipelineStage` transitions verified.
  - Subprocess argument arrays checked for shell injection protection.

## Gate 4 Action Required
This feature is paused awaiting Gate 4 sign-off. Please review implementation and record approval or supply feedback for contract addendum generation.
```
