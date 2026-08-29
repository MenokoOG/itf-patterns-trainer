# 1. Record architecture decisions

Date: 2026-08-29

## Status

Accepted

## Context

Decisions on this project were living in chat and in commit messages. Commit
messages explain a change; they do not explain why an option was rejected, and
they are hard to find later. Provenance questions in particular -- whose content
is this, who authorised its use -- need a durable home.

## Decision

Record architecture decisions in `docs/adr/`, numbered sequentially, using the
format described by Michael Nygard. One decision per file. A decision that is
later reversed gets a new ADR that supersedes the old one; the old file stays.

## Consequences

Decisions are versioned with the code they affect. Reviewers can see what was
weighed. The cost is one short file per real decision -- ADRs are for choices
with alternatives, not for routine implementation.
