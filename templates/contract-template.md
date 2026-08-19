# Contracts — <feature name>

Frozen at Gate 1. Layer plans conform to this document or raise a conflict.

**Writing rule for this document:** every section leads with one or two
plain sentences — what this means, why it's shaped this way, what breaks if
it's wrong — before the exact technical spec. A reader should be able to
read only the plain sentences top to bottom and understand the feature. The
technical spec underneath must still be exact enough to implement from
without guessing. Neither replaces the other.

## In one paragraph

What this feature does, for someone who will never read the rest of this
document. No jargon, no type names. If you can't write this in three
sentences, the feature is probably two features.

## Ubiquitous language

_Plain: the words this feature uses and what they actually mean here —
especially any word that already means something different elsewhere in the
system._

Terms this feature introduces or overloads. One line each. Flag any term that
already means something else elsewhere in the system.

## Bounded context

_Plain: which team's territory this lives in, and who else it touches._

Which service owns this. Which services are affected. What crosses the
boundary between them.

## Aggregates and invariants

_Plain: the rules this feature must never break, stated as things that would
be visibly wrong if they broke — not as formal invariants._

Each aggregate, its identity, and the invariants that must hold at every
commit boundary. State each invariant as an assertion that can be tested.

## Ports

_Plain: what this feature needs from the outside world, and what it promises
back — described as a conversation, not a signature list._

```typescript
// paste the real signatures here
```

## Events

_Plain: what announcement this feature makes when something happens, and who
else is listening for it._

Published and consumed. For each: bus name, detail-type, source, and the full
payload type. Bus names are strings. Confirm every publisher receives a string
where a string is expected.

## Data

_Plain: what's being stored, and what would go wrong if a row were missing,
duplicated, or malformed._

Tables created or altered, with column types and nullability. Stored
procedures with full signatures. Indexes required by the access patterns
above. Migration ordering, expand phase and contract phase separated.

## API surface

_Plain: what a caller sends and what they get back, walked through as an
example request and response — not just the schema._

Routes, methods, request and response types.

## Failure semantics

_Plain: what happens when this goes wrong — retried automatically, retried by
a human, or silently dropped — and how would you notice._

For each operation: what is idempotent and under which key; what is retried by
whom; what is the observable behaviour on partial failure; what is logged at
WARN versus ERROR.

## Non-goals

_Plain: what people might reasonably expect this to do that it deliberately
does not._

What this feature explicitly does not do. Anything deferred, and to when.
