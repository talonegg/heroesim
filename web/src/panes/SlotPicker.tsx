import { useState } from 'react';
import type { Career } from '@heroesim/engine';
import { NAMED_SLOTS, type CareerStorage, type SlotIndexEntry } from '../state/storage';
import { Sheet } from '../ui/Sheet';

/**
 * Three named slots, saved and loaded by hand (E8-S4). The autosave is written after
 * every action and is not shown here: it is a safety net, not a slot to manage.
 *
 * Clearing asks once, in place, and a reload cannot undo it.
 */
export function SlotPicker({
  storage,
  career,
  onLoad,
  onMessage,
  onClose,
}: {
  storage: CareerStorage;
  career: Career | null;
  onLoad: (career: Career, slot: string) => void;
  onMessage: (message: string) => void;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<SlotIndexEntry[]>(() => storage.listSlots());
  const [confirming, setConfirming] = useState<string | null>(null);

  function refresh(): void {
    setEntries(storage.listSlots());
  }

  function save(slot: string): void {
    if (career === null) return;
    const savedOn = new Date().toISOString();
    const result = storage.save(slot, career, savedOn);
    refresh();
    onMessage(result.ok ? `Saved to slot ${slot}.` : (result.message ?? 'The save did not happen.'));
  }

  function load(slot: string): void {
    const result = storage.load(slot);
    if (!result.ok) {
      onMessage(result.message);
      return;
    }
    onLoad(result.career, slot);
  }

  function clear(slot: string): void {
    const result = storage.clear(slot);
    setConfirming(null);
    refresh();
    onMessage(result.ok ? `Slot ${slot} is empty.` : (result.message ?? 'The slot was not cleared.'));
  }

  return (
    <Sheet title="Saved Careers" onClose={onClose}>
      {storage.persistent ? null : (
        <p className="notice notice--warning">{storage.warning}</p>
      )}
      <ul className="cards">
        {NAMED_SLOTS.map((slot) => {
          const entry = entries.find((held) => held.slot === slot);
          const filled = storage.has(slot);
          return (
            <li className="card" key={slot} data-testid={`slot-${slot}`}>
              <h3 className="card__title">Slot {slot}</h3>
              <p className="card__line">
                {entry === undefined
                  ? filled
                    ? 'Holds a Career.'
                    : 'Empty.'
                  : `${entry.guildName} · Year ${String(entry.year)}, Day ${String(entry.day)} · ${String(entry.rosterSize)} on the Roster`}
              </p>
              <div className="sheet__actions">
                <button
                  type="button"
                  data-testid={`save-${slot}`}
                  disabled={career === null}
                  onClick={() => {
                    save(slot);
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  data-testid={`load-${slot}`}
                  disabled={!filled}
                  onClick={() => {
                    load(slot);
                  }}
                >
                  Load
                </button>
                {confirming === slot ? (
                  <>
                    <button
                      type="button"
                      className="button--primary"
                      data-testid={`clear-confirm-${slot}`}
                      onClick={() => {
                        clear(slot);
                      }}
                    >
                      Yes, clear slot {slot}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirming(null);
                      }}
                    >
                      Keep it
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    data-testid={`clear-${slot}`}
                    disabled={!filled}
                    onClick={() => {
                      setConfirming(slot);
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
