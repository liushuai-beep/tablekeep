# Contributing

Start with an issue describing the source app, macOS version, input format, expected output, and actual output. Share a minimal, anonymized HTML/Markdown fixture where possible. Please do not upload personal clipboard history or confidential documents.

For changes, run `npm ci`, `npm test`, and `npm start`. Verify the empty popover, a complex merged table, detailed loss inspection, and return to the popover without losing edits. Keep clipboard reads explicitly user initiated, preserve input until the user clears it, and report unsupported content visibly.

Good first contributions include compatibility fixtures, English interface strings, and office-rendering comparisons. New fidelity claims need reproducible examples and a meaningful regression check. The simulated degraded mode is a demonstration, not a competing-product benchmark.
