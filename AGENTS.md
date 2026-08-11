# Agent Guidance

## Trace release gates before adding another gate

- Before adding CI, generated-project configuration, or release policy for an
  artifact, trace how users actually receive that artifact and which policy
  gates already apply along that path.
- Do not gate template dependencies before publishing a containing package when
  consumers can only receive that package through the same minimum-age policy.
  The containing package's age already makes exact versions baked into its
  template old enough; an earlier dependency-age check applies the same delay
  twice.
- Add a separate gate only when the generated artifact can bypass the containing
  package's gate, such as a template loaded from source, a bundled latest
  snapshot, or a floating dependency spec. State that bypass path explicitly.
- Before emitting project-local policy as a default, verify precedence. Do not
  add it when it can override a stricter user or global policy.
- Prefer fixing the actual resolver ambiguity, such as replacing a multi-version
  dependency range with one intended exact version, before adding enforcement
  infrastructure.
