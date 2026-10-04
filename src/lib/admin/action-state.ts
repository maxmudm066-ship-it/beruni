/** Shared shape for every admin Server Action used with useActionState. */
export interface ActionState {
  error?: string;
  /** Success message to show after the action completes. */
  ok?: string;
  /** Route to navigate to, or the literal "two-factor". */
  next?: string;
  /** URL to open in a new tab — used by the Preview button so editing continues. */
  open?: string;
  /** Epoch ms of the save, sent by the action because the client must not read the clock during render. */
  savedAt?: number;
}

export const INITIAL_ACTION_STATE: ActionState = {};
