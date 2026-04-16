# Tutorial Screenshot Assets

This folder stores screenshots used by the split tutorial parts.

## Automated Capture (v1)

Generate all tutorial screenshots with:

```bash
npm run tutorial:screenshots
```

If Chromium is not installed for Playwright yet:

```bash
npx playwright install chromium
```

Options:

- Render HTML capture cards only (no screenshots):

	```bash
	npm run tutorial:screenshots -- --render-only
	```

- Capture one track only:

	```bash
	npm run tutorial:screenshots -- --track bash
	npm run tutorial:screenshots -- --track ps1
	```

The script writes intermediate HTML cards to `.tmp/tutorial-screenshot-html/`
and PNG files to this folder.

## Naming Convention

Use this filename pattern:

- `from-vanilla-bash-part-<n>.png`
- `from-vanilla-ps1-part-<n>.png`

Where `<n>` is `1` through `6`.

Examples:

- `from-vanilla-bash-part-1.png`
- `from-vanilla-bash-part-4.png`
- `from-vanilla-ps1-part-2.png`
- `from-vanilla-ps1-part-6.png`

## Image Guidance

- Format: PNG preferred.
- Resolution: target at least 1600px width for readability.
- Include terminal/editor context and key evidence (event types, JSONL lines, validation errors, replay state) per each part's placeholder checklist.
- Avoid including secrets, tokens, personal data, or machine-specific sensitive paths.

## Mapping

Bash tutorial parts reference:

- `docs/tutorials/from-vanilla-to-visualizer/part-1.md` -> `from-vanilla-bash-part-1.png`
- `docs/tutorials/from-vanilla-to-visualizer/part-2.md` -> `from-vanilla-bash-part-2.png`
- `docs/tutorials/from-vanilla-to-visualizer/part-3.md` -> `from-vanilla-bash-part-3.png`
- `docs/tutorials/from-vanilla-to-visualizer/part-4.md` -> `from-vanilla-bash-part-4.png`
- `docs/tutorials/from-vanilla-to-visualizer/part-5.md` -> `from-vanilla-bash-part-5.png`
- `docs/tutorials/from-vanilla-to-visualizer/part-6.md` -> `from-vanilla-bash-part-6.png`

PowerShell tutorial parts reference:

- `docs/tutorials/from-vanilla-to-visualizer-ps1/part-1.md` -> `from-vanilla-ps1-part-1.png`
- `docs/tutorials/from-vanilla-to-visualizer-ps1/part-2.md` -> `from-vanilla-ps1-part-2.png`
- `docs/tutorials/from-vanilla-to-visualizer-ps1/part-3.md` -> `from-vanilla-ps1-part-3.png`
- `docs/tutorials/from-vanilla-to-visualizer-ps1/part-4.md` -> `from-vanilla-ps1-part-4.png`
- `docs/tutorials/from-vanilla-to-visualizer-ps1/part-5.md` -> `from-vanilla-ps1-part-5.png`
- `docs/tutorials/from-vanilla-to-visualizer-ps1/part-6.md` -> `from-vanilla-ps1-part-6.png`
