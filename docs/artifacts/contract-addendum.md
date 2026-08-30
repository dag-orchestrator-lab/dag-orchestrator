# `contract-addendum-<n>.md` Artifact Fixture Template

Reference fixture for the Reviewer Agent's Gate 4 contract addendum, per `03-data.md` §2.3.
`ReviewerAgent.createContractAddendum` writes content matching this shape via
temp-file-then-rename (`.contract-addendum-<n>.md.tmp` → `contract-addendum-<n>.md`); once
written, a given `<n>` is immutable — a new round of feedback creates `<n+1>` instead.

## Required fields / section headers

- `# Contract Addendum #<n>`
- `- **Feature ID**: <feature-id>`
- `- **Addendum Sequence**: <n>`
- `- **Generated At**: <ISO-8601 Timestamp>`
- `- **Gate 4 Feedback Reference**: GateApproval(featureId=<feature-id>, gateNumber=4)`
- `## Requested Changes & Feedback Summary`
- `## Amended Contract Requirements`

## Fixture

```markdown
# Contract Addendum #<n>

- **Feature ID**: <feature-id>
- **Addendum Sequence**: <n>
- **Generated At**: <ISO-8601 Timestamp>
- **Gate 4 Feedback Reference**: GateApproval(featureId=<feature-id>, gateNumber=4)

## Requested Changes & Feedback Summary
<Feedback provided during Gate 4 rejection/amendment>

## Amended Contract Requirements
<Structured diff or additions to 02-contracts.md requirements>
```
