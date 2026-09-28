// The header (M7-S3): the player's Guild, its Wealth and Fame, the Day and time of day, its place
// in the Rankings and the seed, each read from `headerView` (the engine's `rankingPlaces`, `dayOf`,
// `timeOfDay`); and, while the Guild is below the Bankruptcy floor, the countdown to Bankruptcy
// (`bankruptcyCountdown`, v1.0.1-S4, DL-95).

import type { HeaderView } from '../state/selectors';

export function Header({ view }: { view: HeaderView }) {
  return (
    <header className="guild" aria-labelledby="guild-name">
      <h1 id="guild-name">{view.guildName}</h1>
      <dl className="facts">
        <div>
          <dt>Wealth</dt>
          <dd data-testid="wealth">{view.wealth}</dd>
        </div>
        <div>
          <dt>Fame</dt>
          <dd data-testid="fame">{view.fame}</dd>
        </div>
        <div>
          <dt>When</dt>
          <dd data-testid="time">{view.time}</dd>
        </div>
        <div>
          <dt>Rankings</dt>
          <dd data-testid="rankings">{view.rankings}</dd>
        </div>
        <div>
          <dt>Seed</dt>
          <dd data-testid="seed">{view.seed}</dd>
        </div>
      </dl>
      {view.countdown === null ? null : (
        <p className="countdown" data-testid="countdown">
          {view.countdown}
        </p>
      )}
      {view.ended === null ? null : (
        <p className="ended" role="status">
          {view.ended}
        </p>
      )}
    </header>
  );
}
