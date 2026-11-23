import { useState } from "react";

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/**
 * Local edit state over a live server copy. A clean form follows the server; a dirty form keeps
 * its edits and reports `conflict` until the admin discards them. Never overwrites either side silently.
 */
export function useServerSync<T>(server: T) {
  const serverJson = stable(server);
  const [local, setLocal] = useState<T>(server);
  const [base, setBase] = useState(serverJson);
  const [saved, setSaved] = useState<{ expected: string; before: string } | null>(null);
  const dirty = stable(local) !== base;
  let conflict = false;

  if (saved) {
    if (serverJson !== saved.before) {
      setSaved(null);
      if (serverJson === saved.expected) setBase(saved.expected);
    }
  } else if (serverJson !== base) {
    if (!dirty) {
      setLocal(server);
      setBase(serverJson);
    } else conflict = true;
  }

  return {
    value: local,
    setValue: setLocal,
    dirty,
    conflict,
    discard() {
      setLocal(server);
      setBase(serverJson);
      setSaved(null);
    },
    markSaved(value: T) {
      setLocal(value);
      setBase(stable(value));
      setSaved({ expected: stable(value), before: serverJson });
    },
  };
}
