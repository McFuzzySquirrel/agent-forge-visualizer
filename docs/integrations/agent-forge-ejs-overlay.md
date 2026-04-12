# Optional Agent Forge / EJS Overlay Integration

This integration is optional and does not affect the base event capture path.

## What It Adds

- Extra context fields in event payloads (for example, journey metadata)
- Better correlation across sessions in downstream analysis

## How It Works

1. Base hook emitter captures canonical events first.
2. If overlay metadata is available, it is merged as optional `ejsMetadata`.
3. If overlay metadata is unavailable, events are emitted normally.

## Stability Rule

The canonical event schema remains valid with or without `ejsMetadata`.
