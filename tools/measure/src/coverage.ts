// Coverage per package (DL-233), from the json-summary `npm run coverage` writes: reported, never
// enforced (DL-231 Q5). Each pruning batch and the close compare it with v1.1.9's first baseline.

/** A count of covered things and their total, as Istanbul's summary gives it. */
export interface Counted {
  total: number;
  covered: number;
}

export type Kind = 'lines' | 'branches' | 'functions' | 'statements';

export const kinds: readonly Kind[] = ['lines', 'branches', 'functions', 'statements'];

/** `coverage-summary.json`: a summary per file, by its absolute path, and the total. */
export type CoverageSummary = Record<string, Record<Kind, Counted>>;

/** A source file's package: the first folder, or `tools/<name>`. */
export function packageOf(file: string): string {
  const path = file.replace(/\\/g, '/');
  const at = path.search(/(?:^|\/)(?:engine|content|words|harness|cli|web|tools)\/(?:[^/]+\/)?src\//);
  const from = at < 0 ? path : path.slice(at + (path[at] === '/' ? 1 : 0));
  const [first, second] = from.split('/');
  return first === 'tools' ? `tools/${second ?? ''}` : (first ?? from);
}

const percent = ({ covered, total }: Counted): string => (total === 0 ? '—' : `${((100 * covered) / total).toFixed(1)}%`);

/** Each package's coverage, summed over its files. */
export function byPackage(summary: CoverageSummary): Map<string, { files: number } & Record<Kind, Counted>> {
  const packages = new Map<string, { files: number } & Record<Kind, Counted>>();
  for (const [file, counts] of Object.entries(summary)) {
    if (file === 'total') continue;
    const name = packageOf(file);
    const sum = packages.get(name) ?? { files: 0, lines: { total: 0, covered: 0 }, branches: { total: 0, covered: 0 }, functions: { total: 0, covered: 0 }, statements: { total: 0, covered: 0 } };
    sum.files += 1;
    for (const kind of kinds) sum[kind] = { total: sum[kind].total + counts[kind].total, covered: sum[kind].covered + counts[kind].covered };
    packages.set(name, sum);
  }
  return new Map([...packages].sort((a, b) => a[0].localeCompare(b[0])));
}

/** The per-package table, as Markdown lines, with the files no test reaches at all. */
export function coverageTables(summary: CoverageSummary): string[] {
  const lines = ['| Package | Files | Lines | Branches | Functions | Statements |', '|---|---:|---:|---:|---:|---:|'];
  for (const [name, sum] of byPackage(summary)) lines.push(`| ${name} | ${sum.files} | ${kinds.map((kind) => percent(sum[kind])).join(' | ')} |`);
  const total = summary['total'];
  if (total) lines.push(`| All | ${Object.keys(summary).length - 1} | ${kinds.map((kind) => percent(total[kind])).join(' | ')} |`);
  const untouched = Object.entries(summary).filter(([file, counts]) => file !== 'total' && counts.lines.total > 0 && counts.lines.covered === 0);
  if (untouched.length > 0) lines.push('', 'No line covered:', ...untouched.map(([file]) => `- ${packageOf(file)}: ${file.replace(/\\/g, '/').replace(/^.*?\/((?:engine|content|words|harness|cli|web|tools)\/)/, '$1')}`));
  return lines;
}
