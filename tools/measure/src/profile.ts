// A V8 CPU profile (`node --cpu-prof`) read into where a game's time goes (DL-233): self and
// inclusive time by function, by the engine's modules, and by the parts DL-231 measured.

export interface CpuProfile {
  nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] }[];
  samples: number[];
  timeDeltas: number[];
  startTime: number;
  endTime: number;
}

type Frame = CpuProfile['nodes'][number]['callFrame'];

/** A frame's file from the repository's root, or empty for V8's own. */
export function fileOf(url: string): string {
  const path = decodeURIComponent(url.replace(/^file:\/\/\/?/, '')).replace(/\\/g, '/');
  const at = path.search(/\/(?:engine|content|words|harness|cli|web|tools\/[^/]+)\/src\//);
  return at < 0 ? path : path.slice(at + 1);
}

/** The parts of a game DL-231's profile named, each a test of a frame: a sample counts once for a part if any frame of its stack is in it. */
export const parts: readonly [string, (frame: Frame) => boolean][] = [
  ['The quest estimate', (frame) => /^engine\/src\/quest-engine\/(estimate|degree)\.ts$/.test(fileOf(frame.url))],
  ["The Rivals' controllers", (frame) => fileOf(frame.url) === 'engine/src/controllers/rival.ts'],
  ['The policy', (frame) => fileOf(frame.url) === 'harness/src/policy.ts'],
  ['copyWorld', (frame) => frame.functionName === 'copyWorld'],
  ['applyAction', (frame) => frame.functionName === 'applyAction'],
  ["The yearly walk of the document (savedLength)", (frame) => frame.functionName === 'savedLength'],
  ['The validator', (frame) => fileOf(frame.url) === 'engine/src/validate.ts'],
  ['The garbage collector', (frame) => frame.functionName === '(garbage collector)'],
];

/** Each node's sampled microseconds. */
function sampledTime(profile: CpuProfile): Map<number, number> {
  const time = new Map<number, number>();
  profile.samples.forEach((id, at) => time.set(id, (time.get(id) ?? 0) + (profile.timeDeltas[at + 1] ?? profile.timeDeltas[at] ?? 0)));
  return time;
}

/** The profile's tables, as Markdown lines. */
export function profileTables(profile: CpuProfile, top = 25): string[] {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map<number, number>();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const time = sampledTime(profile);
  const total = [...time.values()].reduce((sum, us) => sum + us, 0);
  const share = (us: number): string => `${(us / 1000).toFixed(0)} | ${((100 * us) / total).toFixed(1)}%`;
  const name = (frame: Frame): string => `${frame.functionName || '(anonymous)'} ${fileOf(frame.url)}`.trim();
  const stack = (id: number): Frame[] => {
    const frames: Frame[] = [];
    for (let at: number | undefined = id; at !== undefined; at = parent.get(at)) {
      const node = nodes.get(at);
      if (node) frames.push(node.callFrame);
    }
    return frames;
  };

  const self = new Map<string, number>();
  const inclusive = new Map<string, number>();
  const modules = new Map<string, number>();
  const partTime = parts.map(() => 0);
  for (const [id, us] of time) {
    const frames = stack(id);
    const first = frames[0];
    if (first) self.set(name(first), (self.get(name(first)) ?? 0) + us);
    for (const key of new Set(frames.map(name))) inclusive.set(key, (inclusive.get(key) ?? 0) + us);
    const inModules = new Set(frames.map((frame) => fileOf(frame.url)).filter((file) => file.startsWith('engine/src/') || file.startsWith('harness/src/')));
    for (const file of inModules) modules.set(file, (modules.get(file) ?? 0) + us);
    parts.forEach(([, test], at) => {
      if (frames.some(test)) partTime[at] = (partTime[at] ?? 0) + us;
    });
  }

  const table = (title: string, rows: Map<string, number>): string[] => [
    '',
    `| ${title} | ms | Share |`,
    '|---|---:|---:|',
    ...[...rows].sort((a, b) => b[1] - a[1]).slice(0, top).map(([key, us]) => `| ${key.replace(/\|/g, '/')} | ${share(us)} |`),
  ];
  return [
    `Sampled ${(total / 1e6).toFixed(1)} s over ${profile.samples.length} samples; wall ${((profile.endTime - profile.startTime) / 1e6).toFixed(1)} s.`,
    '',
    '| Part of the game | ms | Share |',
    '|---|---:|---:|',
    ...parts.map(([part], at) => `| ${part} | ${share(partTime[at] ?? 0)} |`),
    ...table('Inclusive, by module', modules),
    ...table('Self, by function', self),
    ...table('Inclusive, by function', inclusive),
  ];
}
