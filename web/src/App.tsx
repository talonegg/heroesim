import { useEffect, useMemo, useState } from 'react';
import { content } from './content';
import { Shell, type PaneName } from './layout/Shell';
import { Applicants } from './panes/Applicants';
import { Former } from './panes/Former';
import { Hall } from './panes/Hall';
import { History } from './panes/History';
import { League } from './panes/League';
import { More } from './panes/More';
import { Patrons } from './panes/Patrons';
import { Rivals } from './panes/Rivals';
import { PartyPicker } from './panes/PartyPicker';
import { SlotPicker } from './panes/SlotPicker';
import { useCareer } from './state/careerReducer';
import { commissionById } from './state/selectors';
import { AUTOSAVE_SLOT, browserStore, createCareerStorage } from './state/storage';
import { randomSeed } from './seed';

/**
 * The whole client: one Career, one reducer, three panes and two sheets. There is no
 * router — the panes are a bottom bar under 600px and columns above it (architecture §9).
 *
 * @param seed the seed the start screen is filled with. A fresh random-looking one by
 * default; a test passes a fixed one so that the Heroes and Commissions it names are real.
 */
export function App({ seed }: { seed?: string }) {
  const [state, dispatch] = useCareer();
  const [pane, setPane] = useState<PaneName>('board');
  const [picking, setPicking] = useState<string | null>(null);
  const [slotsOpen, setSlotsOpen] = useState(false);
  const [hallOpen, setHallOpen] = useState(false);
  const [applicantsOpen, setApplicantsOpen] = useState(false);
  const [rivalsOpen, setRivalsOpen] = useState(false);
  const [leagueOpen, setLeagueOpen] = useState(false);
  // The three views E8-S6 added, reached through the More sheet so the header stays two
  // rows deep at 360px (DL-27 §8).
  const [moreOpen, setMoreOpen] = useState(false);
  const [patronsOpen, setPatronsOpen] = useState(false);
  const [formerOpen, setFormerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [starting, setStarting] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [seedText, setSeedText] = useState(() => seed ?? randomSeed());
  const [yearsText, setYearsText] = useState('');

  const storage = useMemo(() => createCareerStorage(browserStore()), []);
  const { career } = state;

  // Autosave after every action, so a closed tab never costs more than the current Day.
  // The history follows the autosave, so what led up to a Career is never a Day behind it
  // (E8-S6).
  useEffect(() => {
    if (career === null) return;
    const result = storage.save(AUTOSAVE_SLOT, career, new Date().toISOString(), state.history);
    if (!result.ok && result.message !== undefined) setNotice(result.message);
  }, [career, state.history, storage]);

  const commission = picking === null || career === null ? undefined : commissionById(career, picking);

  function begin(): void {
    const years = Number.parseInt(yearsText, 10);
    dispatch(
      Number.isFinite(years) && years > 0
        ? { type: 'newCareer', seed: seedText, years }
        : { type: 'newCareer', seed: seedText },
    );
    setStarting(false);
    setPane('board');
  }

  if (career === null || starting) {
    return (
      <div className="app">
        {notice === null ? null : (
          <div className="notice">
            <p>{notice}</p>
            <button
              type="button"
              onClick={() => {
                setNotice(null);
              }}
            >
              Dismiss
            </button>
          </div>
        )}
        {storage.persistent ? null : <p className="notice notice--warning">{storage.warning}</p>}
        <main className="start">
          <h1>Heroesim</h1>
          <p className="lede">
            Take over a Guild, take paid work from Patrons, choose who to send, and read what
            happened to them.
          </p>
          <label className="field">
            <span>Seed</span>
            <input
              type="text"
              data-testid="seed"
              value={seedText}
              onChange={(event) => {
                setSeedText(event.target.value);
              }}
            />
          </label>
          <label className="field">
            <span>Years (optional — leave empty for a full Career)</span>
            <input
              type="number"
              min="1"
              data-testid="years"
              value={yearsText}
              onChange={(event) => {
                setYearsText(event.target.value);
              }}
            />
          </label>
          <div className="sheet__actions">
            <button type="button" className="button--primary" data-testid="begin" onClick={begin}>
              Begin a Career
            </button>
            <button
              type="button"
              data-testid="open-saves"
              onClick={() => {
                setSlotsOpen(true);
              }}
            >
              Load a saved Career
            </button>
            {career === null ? null : (
              <button
                type="button"
                data-testid="keep-playing"
                onClick={() => {
                  setStarting(false);
                }}
              >
                Back to {career.guild.name}
              </button>
            )}
          </div>
        </main>
        {slotsOpen ? (
          <SlotPicker
            storage={storage}
            career={career}
            history={state.history}
            onLoad={(loaded, history) => {
              dispatch({ type: 'load', career: loaded, history });
              setSlotsOpen(false);
              setStarting(false);
              setPane('report');
            }}
            onMessage={setNotice}
            onClose={() => {
              setSlotsOpen(false);
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <>
      {state.message === null ? null : (
        <div className="notice" role="status" data-testid="message">
          <p>{state.message}</p>
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'dismiss' });
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      {notice === null ? null : (
        <div className="notice" role="status" data-testid="notice">
          <p>{notice}</p>
          <button
            type="button"
            onClick={() => {
              setNotice(null);
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      {storage.persistent ? null : <p className="notice notice--warning">{storage.warning}</p>}

      <Shell
        career={career}
        content={content}
        paragraphs={state.paragraphs}
        pane={pane}
        onPane={setPane}
        busy={state.busy}
        onAdvance={() => {
          dispatch({ type: 'advance' });
          setPane('report');
        }}
        onAnswer={(partyId, optionId) => {
          dispatch({ type: 'answer', partyId, optionId });
          setPane('report');
        }}
        onSend={setPicking}
        onOpenSaves={() => {
          setSlotsOpen(true);
        }}
        onOpenHall={() => {
          setHallOpen(true);
        }}
        onOpenApplicants={() => {
          setApplicantsOpen(true);
        }}
        onOpenRivals={() => {
          setRivalsOpen(true);
        }}
        onOpenLeague={() => {
          setLeagueOpen(true);
        }}
        onOpenMore={() => {
          setMoreOpen(true);
        }}
        onNewCareer={() => {
          setSeedText(randomSeed());
          setStarting(true);
        }}
      />

      {commission === undefined ? null : (
        <PartyPicker
          career={career}
          commission={commission}
          disabled={state.busy}
          onCommit={(heroIds, insist) => {
            dispatch({ type: 'commit', commissionId: commission.id, heroIds, insist });
            setPicking(null);
            setPane('report');
          }}
          onClose={() => {
            setPicking(null);
          }}
        />
      )}

      {applicantsOpen ? (
        <Applicants
          career={career}
          disabled={state.busy}
          onAccept={(applicantId) => {
            dispatch({ type: 'accept', applicantId });
          }}
          onDecline={(applicantId) => {
            dispatch({ type: 'decline', applicantId });
          }}
          onClose={() => {
            setApplicantsOpen(false);
          }}
        />
      ) : null}

      {rivalsOpen ? (
        <Rivals
          career={career}
          disabled={state.busy}
          onTransfer={(rivalId, heroId) => {
            dispatch({ type: 'transfer', rivalId, heroId });
          }}
          onPoach={(rivalId, heroId) => {
            dispatch({ type: 'poach', rivalId, heroId });
          }}
          onClose={() => {
            setRivalsOpen(false);
          }}
        />
      ) : null}

      {leagueOpen ? (
        <League
          career={career}
          onClose={() => {
            setLeagueOpen(false);
          }}
        />
      ) : null}

      {moreOpen ? (
        <More
          onOpenPatrons={() => {
            setMoreOpen(false);
            setPatronsOpen(true);
          }}
          onOpenFormer={() => {
            setMoreOpen(false);
            setFormerOpen(true);
          }}
          onOpenHistory={() => {
            setMoreOpen(false);
            setHistoryOpen(true);
          }}
          onClose={() => {
            setMoreOpen(false);
          }}
        />
      ) : null}

      {patronsOpen ? (
        <Patrons
          career={career}
          onClose={() => {
            setPatronsOpen(false);
          }}
        />
      ) : null}

      {formerOpen ? (
        <Former
          career={career}
          onClose={() => {
            setFormerOpen(false);
          }}
        />
      ) : null}

      {historyOpen ? (
        <History
          history={state.history}
          onClose={() => {
            setHistoryOpen(false);
          }}
        />
      ) : null}

      {hallOpen ? (
        <Hall
          career={career}
          disabled={state.busy}
          onBuy={(improvement) => {
            dispatch({ type: 'improveHall', improvement });
          }}
          onClose={() => {
            setHallOpen(false);
          }}
        />
      ) : null}

      {slotsOpen ? (
        <SlotPicker
          storage={storage}
          career={career}
          history={state.history}
          onLoad={(loaded, history) => {
            dispatch({ type: 'load', career: loaded, history });
            setSlotsOpen(false);
            setPane('report');
          }}
          onMessage={setNotice}
          onClose={() => {
            setSlotsOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
