/**
 * @payswap/command — the universal command grammar (P7-W3).
 *
 * PORTED from the old repository's universal Command Center grammar
 * (packages/ux/src/command-center.ts, the grammar section — the P7-W3
 * share of the ux package; the view-model/product share is P7-W1's). The
 * grammar contract is unchanged in semantics: the SIX verbs, one set
 * everywhere (pay · request · invoice · link · convert · withdraw;
 * withdraw routes to the Balances withdraw flow);
 * `<verb> [counterparty] [amount] [asset] [modifiers]` parses to a typed
 * PARTIAL intent — missing parameters are ABSENT, never a parse error
 * (the workflow form model pre-fills what parsed and asks for the rest);
 * the amount stays a VERBATIM string (never float-parsed: exact-money
 * law, INV-2 discipline — normalization belongs to the money layer);
 * ambiguity resolves through disambiguation chips (which Alice?), never
 * a dead end and never a guess; unrecognized tokens are preserved
 * honestly; a no-result query turns into the "Create payment for '<q>'"
 * intent turn (INV-24: no dead financial actions); the keyboard model +
 * create chords are DATA.
 *
 * THE AUTHORITY-FIREWALL LAW applies: a parsed command is a PROPOSAL
 * INPUT. `PartialCommandIntent` carries no authority field and no
 * settlement semantics; submitting it produces a command PROPOSAL
 * envelope (src/command-envelope.ts) — authorization happens out of band
 * on the trust lane (INV-9/INV-23).
 *
 * Deterministic by construction: pure, total, no DOM, no network, no
 * directory, no time, no randomness (machine-checked by the boundary
 * test).
 */

// ---------------------------------------------------------------------------
// The six verbs
// ---------------------------------------------------------------------------

/**
 * The SIX command grammar verbs, one set everywhere (pay · request ·
 * invoice · link · convert · withdraw). `withdraw` routes to the Balances
 * withdraw flow; the other five open their workflow modals.
 */
export const COMMAND_VERBS = ['pay', 'request', 'invoice', 'link', 'convert', 'withdraw'] as const;

export type CommandVerb = (typeof COMMAND_VERBS)[number];

/** Narrow an unknown value to a CommandVerb. */
export function isCommandVerb(value: unknown): value is CommandVerb {
  return typeof value === 'string' && (COMMAND_VERBS as readonly string[]).includes(value);
}

/**
 * Where each verb's workflow opens (typed routing data — no UI): `modal`
 * for the five workflow forms; `balances-withdraw-flow` for withdraw
 * (anchored on the object-noun Balances row).
 */
export type CommandWorkflowRouting =
  | { readonly kind: 'modal' }
  | { readonly kind: 'balances-withdraw-flow' };

export const COMMAND_VERB_ROUTING: Readonly<Record<CommandVerb, CommandWorkflowRouting>> = Object.freeze({
  pay: Object.freeze({ kind: 'modal' }),
  request: Object.freeze({ kind: 'modal' }),
  invoice: Object.freeze({ kind: 'modal' }),
  link: Object.freeze({ kind: 'modal' }),
  convert: Object.freeze({ kind: 'modal' }),
  withdraw: Object.freeze({ kind: 'balances-withdraw-flow' }),
});

/**
 * The create-menu keyboard chords: the shortcut lane into the same command
 * grammar. Withdraw deliberately has NO chord (not a create-menu item).
 */
export const COMMAND_CHORDS: Readonly<Record<Exclude<CommandVerb, 'withdraw'>, string>> = Object.freeze({
  pay: 'c p',
  request: 'c r',
  invoice: 'c i',
  link: 'c l',
  convert: 'c v',
});

/** Map a typed create-menu chord to its command verb; undefined for any other chord. */
export function chordToCommandVerb(chord: string): CommandVerb | undefined {
  for (const verb of COMMAND_VERBS) {
    if (verb === 'withdraw') {
      continue; // no create-menu chord
    }
    if (COMMAND_CHORDS[verb] === chord) {
      return verb;
    }
  }
  return undefined;
}

/** Map a command verb to its create-menu chord; undefined for withdraw (no chord). */
export function commandVerbChord(verb: CommandVerb): string | undefined {
  return verb === 'withdraw' ? undefined : COMMAND_CHORDS[verb];
}

/**
 * The keyboard model for the unified search/command surface: data, so a
 * component renders the "/" hint and binds the exact keys without
 * re-deriving the contract ("/" focuses from anywhere; Esc restores prior
 * focus — never a dead key; arrows within a group; Tab across groups;
 * Enter executes the top hit).
 */
export const SEARCH_COMMAND_KEYBOARD_MODEL = Object.freeze({
  /** "/" focuses the search/command bar from anywhere on an authenticated page. */
  focusFromAnywhere: '/',
  /** Esc restores the prior focus (never a dead key). */
  escapeRestoresPriorFocus: true,
  /** Up/Down move within a result group; Tab moves across groups; Enter executes. */
  withinGroup: 'arrow-up-down',
  acrossGroups: 'tab',
  execute: 'enter',
});

// --- The grammar: <verb> [counterparty] [amount] [asset] [modifiers] ---

/** One typed modifier token of the form `key:value` (e.g. `rail:ethereum`). */
export interface CommandModifier {
  readonly key: string;
  readonly value: string;
}

/**
 * A typed PARTIAL intent — the grammar's promise: missing parameters are
 * ABSENT (never a parse error); the workflow form model pre-fills what
 * parsed and asks for the rest. `amount` is the VERBATIM digit token
 * (e.g. "100.50"), never parsed into a float: money is exact minor-unit
 * arithmetic (INV-2 discipline) — normalization belongs to the money layer.
 */
export interface PartialCommandIntent {
  readonly verb: CommandVerb;
  /** Counterparty as typed (resolution against a directory is a separate step). */
  readonly counterparty?: string;
  /** Amount as typed (verbatim string, never float-parsed). */
  readonly amount?: string;
  /** Asset as typed (e.g. "usdc"). */
  readonly asset?: string;
  /** Typed modifiers (`key:value` pairs, plus the `to` conversion target). */
  readonly modifiers: readonly CommandModifier[];
  /** Tokens the grammar could not classify — preserved honestly, never silently dropped. */
  readonly unrecognized: readonly string[];
}

/**
 * The parse result: either a (partial) command, or NOT_A_COMMAND — meaning
 * the text belongs to the SEARCH lane (the unified surface does both). A
 * missing parameter is NOT a parse failure; it is an absent field.
 */
export type CommandParse =
  | { readonly kind: 'COMMAND'; readonly intent: PartialCommandIntent }
  | { readonly kind: 'NOT_A_COMMAND' };

const AMOUNT_TOKEN = /^\d+(?:\.\d+)?$/;
const MODIFIER_TOKEN = /^[a-z0-9-]+:[^:]+$/i;

/**
 * Parse `<verb> [counterparty] [amount] [asset] [modifiers]` (pure, total,
 * deterministic — no DOM, no network, no directory, no time): token 0
 * (case-insensitive) must be a grammar verb, else NOT_A_COMMAND; the first
 * numeric token is the amount (verbatim); the token directly after it,
 * when alphabetic, is the asset; the first remaining alphabetic token is
 * the counterparty (the positional order — "pay alice 100 usdc");
 * `key:value` tokens are modifiers; `to <asset>` is the conversion-target
 * modifier ("convert 2 eth to usdc"); anything else is preserved in
 * `unrecognized` — the grammar never throws and never drops tokens.
 */
export function parseCommand(text: string): CommandParse {
  const tokens = text.trim().split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return Object.freeze({ kind: 'NOT_A_COMMAND' });
  }
  const [first, ...rest] = tokens;
  const verbToken = first?.toLowerCase() ?? '';
  if (!isCommandVerb(verbToken)) {
    return Object.freeze({ kind: 'NOT_A_COMMAND' });
  }
  const verb: CommandVerb = verbToken;

  let counterparty: string | undefined;
  let amount: string | undefined;
  let asset: string | undefined;
  let lastTokenWasAmount = false;
  let expectToTarget = false;
  const modifiers: CommandModifier[] = [];
  const unrecognized: string[] = [];

  for (const token of rest) {
    const lower = token.toLowerCase();

    if (expectToTarget) {
      expectToTarget = false;
      if (/^[a-z0-9]+$/i.test(token)) {
        modifiers.push({ key: 'to', value: lower });
        continue;
      }
      // The "to" was not followed by an asset token — keep both honestly.
      unrecognized.push('to', token);
      continue;
    }

    if (lower === 'to') {
      expectToTarget = true;
      continue;
    }

    if (MODIFIER_TOKEN.test(token)) {
      const separator = token.indexOf(':');
      modifiers.push({ key: token.slice(0, separator).toLowerCase(), value: token.slice(separator + 1) });
      lastTokenWasAmount = false;
      continue;
    }

    if (AMOUNT_TOKEN.test(token)) {
      if (amount === undefined) {
        amount = token;
        lastTokenWasAmount = true;
        continue;
      }
      unrecognized.push(token);
      lastTokenWasAmount = false;
      continue;
    }

    if (lastTokenWasAmount && asset === undefined && /^[a-z0-9]+$/i.test(token)) {
      asset = lower;
      lastTokenWasAmount = false;
      continue;
    }
    lastTokenWasAmount = false;

    if (counterparty === undefined) {
      counterparty = token;
      continue;
    }

    unrecognized.push(token);
  }

  if (expectToTarget) {
    // A trailing bare "to" with nothing after it — preserved, never dropped.
    unrecognized.push('to');
  }

  const intent: PartialCommandIntent = Object.freeze({
    verb,
    ...(counterparty === undefined ? {} : { counterparty }),
    ...(amount === undefined ? {} : { amount }),
    ...(asset === undefined ? {} : { asset }),
    modifiers: Object.freeze(modifiers.map((modifier) => Object.freeze(modifier))),
    unrecognized: Object.freeze([...unrecognized]),
  });
  return Object.freeze({ kind: 'COMMAND', intent });
}

// --- Workflow form pre-fill (missing parameters PRE-FILL — never a parse error) ---

/** The form fields a verb's workflow asks for. */
export type WorkflowFormField = 'counterparty' | 'amount' | 'asset';
/**
 * The PRE-FILLED workflow form model: what the verb's form opens with
 * (text fields exactly as parsed) plus the fields it must still ask for.
 * Constructed for ANY verb-leading text — never an error (missing
 * parameters are the form's job).
 */
export interface WorkflowFormPrefill {
  readonly verb: CommandVerb;
  readonly counterpartyText: string;
  readonly amountText: string;
  readonly assetText: string;
  readonly modifiers: readonly CommandModifier[];
  /** Fields the parse could not fill — the form asks for exactly these. */
  readonly missingFields: readonly WorkflowFormField[];
}

/** Build the pre-filled form model from a parsed (partial) intent. */
export function workflowFormPrefillFromIntent(intent: PartialCommandIntent): WorkflowFormPrefill {
  const missingFields: WorkflowFormField[] = [];
  if (intent.counterparty === undefined) {
    missingFields.push('counterparty');
  }
  if (intent.amount === undefined) {
    missingFields.push('amount');
  }
  if (intent.asset === undefined) {
    missingFields.push('asset');
  }
  return Object.freeze({
    verb: intent.verb,
    counterpartyText: intent.counterparty ?? '',
    amountText: intent.amount ?? '',
    assetText: intent.asset ?? '',
    modifiers: intent.modifiers,
    missingFields: Object.freeze(missingFields),
  });
}

/**
 * Parse text and build the pre-filled form model in one step. Returns
 * `undefined` when the text does not lead with a grammar verb — that text
 * belongs to the SEARCH lane (the unified surface); a missing PARAMETER
 * never produces undefined and never throws.
 */
export function workflowFormPrefillFromText(text: string): WorkflowFormPrefill | undefined {
  const parse = parseCommand(text);
  if (parse.kind === 'NOT_A_COMMAND') {
    return undefined;
  }
  return workflowFormPrefillFromIntent(parse.intent);
}

// ---------------------------------------------------------------------------
// Ambiguity model — disambiguation chips (never dead-ends)
// ---------------------------------------------------------------------------

/** One entry of the operator's contact directory (an authority dataset, injected). */
export interface ContactDirectoryEntry {
  readonly id: string;
  readonly displayName: string;
}

/**
 * An inline disambiguation chip: "which Alice?", "which rail?" — the data a
 * component renders; ambiguity is resolved by choice, never by a dead end
 * and never by a guess.
 */
export interface DisambiguationChip {
  readonly kind: 'counterparty-candidate' | 'add-contact' | 'asset-candidate' | 'rail-candidate';
  readonly label: string;
  readonly value: string;
}

/** The resolution of a parsed counterparty token against the injected directory. */
export interface CounterpartyResolution {
  readonly raw: string;
  /** Fuzzy matches (case-insensitive containment on the display name), in directory order. */
  readonly matches: readonly ContactDirectoryEntry[];
  /** The chips to render: one per candidate, or the single "Add contact" chip when none match. */
  readonly chips: readonly DisambiguationChip[];
}

/**
 * Resolve a counterparty token against the operator's contact directory
 * (pure — the directory is injected, never fabricated here): zero matches
 * -> the inline "Add contact '<raw>'" chip; one or more matches -> one
 * counterparty-candidate chip per match (which Alice?) — the caller picks,
 * the grammar never guesses.
 */
export function resolveCounterparty(
  raw: string,
  directory: readonly ContactDirectoryEntry[],
): CounterpartyResolution {
  const needle = raw.toLowerCase();
  const matches = directory.filter((entry) => entry.displayName.toLowerCase().includes(needle));
  const chips: DisambiguationChip[] =
    matches.length === 0
      ? [{ kind: 'add-contact', label: `Add contact '${raw}'`, value: raw }]
      : matches.map((entry) => ({
          kind: 'counterparty-candidate' as const,
          label: entry.displayName,
          value: entry.id,
        }));
  return Object.freeze({
    raw,
    matches: Object.freeze(matches),
    chips: Object.freeze(chips.map((chip) => Object.freeze(chip))),
  });
}

// ---------------------------------------------------------------------------
// No-result intent-turn ("Create payment for '<q>'?")
// ---------------------------------------------------------------------------

/**
 * The no-result turn: when a query matches nothing, the miss becomes an
 * INTENT — "Create payment for '<q>'?" — never a dead end (INV-24: no
 * dead financial actions). The query text is carried verbatim as the
 * payment's pre-fill seed.
 */
export interface NoResultIntentTurn {
  readonly kind: 'create-payment';
  readonly verb: CommandVerb;
  readonly query: string;
  /** The rendered label, e.g. `Create payment for 'stripe fees'?`. */
  readonly label: string;
}

/** Turn a no-result query into the create-payment intent-turn (pure). */
export function noResultIntentTurn(query: string): NoResultIntentTurn {
  return Object.freeze({
    kind: 'create-payment',
    verb: 'pay',
    query,
    label: `Create payment for '${query}'?`,
  });
}
