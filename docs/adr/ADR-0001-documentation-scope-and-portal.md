# ADR-0001 Documentation Scope and Portal

- Date: 2026-03-13
- Status: Accepted

## Context

The repository already contains useful technical documents, but they are mixed with planning material such as backlog notes, implementation plans, and sprint-oriented working documents.

The main reader for the long-lived documentation set is a product manager who needs:

- a clear architecture overview
- a map of services and integrations
- runtime diagrams
- stable explanations of important design choices

That reader does not benefit from publishing backlog and implementation-plan material as part of the primary documentation portal.

## Decision

The repository will maintain a dedicated documentation portal focused on durable technical reference material.

The published documentation set will include:

- architecture overview pages
- service and integration descriptions
- runtime and data-flow diagrams
- architecture decision records

The published documentation set will exclude:

- implementation plans
- sprint plans
- backlog notes
- temporary execution checklists

MkDocs with Material for MkDocs will be used as the initial documentation portal.

## Consequences

### Positive

- The portal remains readable for non-developer stakeholders.
- Architecture and decision documentation become easier to find and maintain.
- Planning artifacts can stay in the repository without polluting the published docs experience.

### Tradeoffs

- The repository will contain two kinds of written material: durable reference docs and working documents.
- Authors need to decide whether a new document is a stable reference or a temporary planning artifact before adding it.

## Follow-up

New long-lived technical decisions should be recorded as ADRs in this directory.
