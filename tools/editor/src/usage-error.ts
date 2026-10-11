// A command line, or a call of the page's API, the editor cannot read: exit code 2, or 400 (DL-150
// item 7, DL-267).
export class UsageError extends Error {}
