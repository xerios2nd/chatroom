/**
 * Promise-based confirm dialog: `if (await dialogs.confirm({...})) ...`
 */
export function createDialogs() {
  /** @type {{title: string, message: string, confirmLabel: string, danger: boolean, resolve: (v: boolean) => void} | null} */
  let current = $state(null);

  function confirm({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', danger = false } = {}) {
    current?.resolve(false);
    return new Promise((resolve) => {
      current = { title, message, confirmLabel, danger, resolve };
    });
  }

  function settle(value) {
    current?.resolve(value);
    current = null;
  }

  return {
    get current() {
      return current;
    },
    confirm,
    settle,
  };
}
