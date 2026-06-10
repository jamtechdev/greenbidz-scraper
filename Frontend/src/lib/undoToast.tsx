import toast from 'react-hot-toast';

/**
 * Deferred, lossless delete with an Undo affordance.
 *
 * Shows a toast for `delayMs`. If the user clicks **Undo**, `commit` is never
 * called and nothing is deleted. Otherwise `commit` runs once the window
 * elapses. Because the actual deletion is deferred (not done-then-restored),
 * undo needs no restore endpoint and can never lose data.
 */
export function undoableDelete({
  message,
  commit,
  delayMs = 6000,
}: {
  message: string;
  commit: () => void;
  delayMs?: number;
}) {
  let undone = false;
  const id = toast(
    (t) => (
      <span className="flex items-center gap-3">
        <span>{message}</span>
        <button
          type="button"
          className="rounded-md bg-white/15 px-2 py-1 text-xs font-semibold text-white transition-colors hover:bg-white/25"
          onClick={() => {
            undone = true;
            toast.dismiss(t.id);
          }}
        >
          Undo
        </button>
      </span>
    ),
    { duration: delayMs, icon: '🗑️' },
  );
  setTimeout(() => {
    if (!undone) commit();
  }, delayMs);
  return id;
}
