# CLAUDE.md

## Purpose

This repository should maintain product-facing technical documentation that helps a product manager understand:

- the overall system architecture
- the services and external integrations the product depends on
- the most important runtime flows
- the key design and architecture decisions behind the system

The documentation should optimize for clarity over implementation detail.

## Primary Audience

The primary audience is a product manager who understands technical concepts but is not a developer and should not need deep code-level knowledge to understand the system.

Write for fast comprehension:

- explain the intent before the mechanism
- prefer system responsibilities over code internals
- define acronyms the first time they appear
- keep jargon precise but readable

## Documentation Scope

Include:

- system context and architecture overviews
- service maps and building-block descriptions
- external dependencies and integrations
- runtime flows and sequence diagrams
- deployment and environment context
- data flow, privacy, and compliance-relevant architecture notes
- architecture decision records and major design decisions
- glossary pages where helpful

Do not include in the maintained architecture docs set:

- implementation plans
- sprint plans
- backlog items
- task lists and TODO collections
- speculative scratch notes that are not yet decisions
- low-level code walkthroughs unless required to explain architecture

## Preferred Documentation Structure

Use the docs set for durable reference material, not delivery planning.

Preferred sections:

- `docs/architecture/` for system overviews, runtime flows, deployment views, service boundaries, and data flow documentation
- `docs/adr/` for architecture decision records
- `README.md` for product summary, local setup, and a short top-level overview

Avoid publishing `docs/plans/`, `docs/backlog/`, or other planning folders as part of the primary documentation portal.

## Writing Rules

When creating or updating architecture documentation:

- start with a short purpose statement
- describe what a component does, why it exists, and what it depends on
- prefer diagrams for system context, containers, runtime flows, and integrations
- use Mermaid by default unless another diagram format is clearly better
- call out external services explicitly, including their responsibility in the system
- use concrete names for API routes, services, and modules when they are important to understanding the design
- keep pages focused on stable concepts; move transient details out of architecture docs
- note important tradeoffs and constraints, not just the final decision

## ADR Rules

Store design decisions as ADRs in `docs/adr/`.

Each ADR should include:

- title
- date
- status
- context
- decision
- consequences
- supersedes or superseded-by references when relevant

ADR topics should include decisions such as:

- service boundaries
- provider selection
- architecture patterns
- privacy and data retention choices
- deployment and hosting tradeoffs
- major UI or voice-interaction design decisions that affect system structure

## Update Triggers

Update the documentation when changes affect:

- system boundaries
- external integrations
- major user flows
- API surface area
- data handling or privacy behavior
- deployment topology
- architecture decisions or their consequences

Do not create or update backlog or implementation-plan documents unless explicitly requested.
