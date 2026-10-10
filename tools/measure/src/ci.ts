// CI's minutes (DL-233): a workflow run's jobs and their steps, from `gh run view <id> --json
// jobs,displayTitle,headSha`. GitHub bills each job by the minute, rounded up (DL-231 Q6).

export interface CiRun {
  displayTitle?: string;
  headSha?: string;
  jobs: { name: string; conclusion: string; startedAt: string; completedAt: string; steps?: { name: string; startedAt: string; completedAt: string }[] }[];
}

/** Seconds between two of GitHub's times, or null where either is unset (`0001-01-01…`, a step skipped). */
export function secondsBetween(from: string, to: string): number | null {
  if (from.startsWith('0001') || to.startsWith('0001')) return null;
  const seconds = (Date.parse(to) - Date.parse(from)) / 1000;
  return Number.isNaN(seconds) ? null : seconds;
}

/** One run's jobs as Markdown lines: each job's seconds and its slowest steps, then the sum and the billed minutes. */
export function ciTables(id: string, run: CiRun): string[] {
  const lines = [`Run ${id}${run.headSha ? ` at ${run.headSha.slice(0, 7)}` : ''}${run.displayTitle ? `: ${run.displayTitle}` : ''}`, '', '| Job | Result | s | Slowest steps, s |', '|---|---|---:|---|'];
  let sum = 0;
  let billed = 0;
  for (const job of run.jobs) {
    const seconds = secondsBetween(job.startedAt, job.completedAt) ?? 0;
    sum += seconds;
    billed += Math.ceil(seconds / 60);
    const steps = (job.steps ?? [])
      .map((step) => ({ name: step.name, seconds: secondsBetween(step.startedAt, step.completedAt) }))
      .filter((step): step is { name: string; seconds: number } => step.seconds !== null && step.seconds >= 1)
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 4);
    lines.push(`| ${job.name} | ${job.conclusion} | ${seconds} | ${steps.map((step) => `${step.name} ${step.seconds}`).join('; ')} |`);
  }
  lines.push('', `Jobs' time ${sum} s (${(sum / 60).toFixed(1)} min); billed ${billed} min, each job rounded up to a minute.`);
  return lines;
}
