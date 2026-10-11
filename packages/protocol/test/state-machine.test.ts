import { describe, expect, it } from 'vitest';
import {
  IllegalTransitionError,
  InvalidStateMachineDefinitionError,
  type StateMachine,
  TerminalStateViolationError,
  TransitionGuardError,
  UndeclaredEventError,
  defineStateMachine,
} from '../src/index.ts';

interface DoorContext {
  readonly isAdmin: boolean;
}

const doorMachine: StateMachine<'closed' | 'opened' | 'locked', 'OPEN' | 'CLOSE' | 'LOCK' | 'UNLOCK', DoorContext> =
  defineStateMachine<'closed' | 'opened' | 'locked', 'OPEN' | 'CLOSE' | 'LOCK' | 'UNLOCK', DoorContext>({
    name: 'door',
    initial: 'closed',
    states: ['closed', 'opened', 'locked'],
    events: ['OPEN', 'CLOSE', 'LOCK', 'UNLOCK'],
    transitions: [
      { from: 'closed', on: 'OPEN', to: 'opened', guard: (context) => !context.isAdmin },
      { from: 'opened', on: 'CLOSE', to: 'closed' },
      { from: 'closed', on: 'LOCK', to: 'locked' },
    ],
    terminalStates: ['locked'],
  });

describe('state machines: definition validation (ported from old state-machine.test.ts)', () => {
  it('rejects a missing name, empty states, duplicates, bad initial/terminal combos', () => {
    expect(() => defineStateMachine({ name: '', initial: 'a', states: ['a'], events: [], transitions: [], terminalStates: [] })).toThrow(
      InvalidStateMachineDefinitionError,
    );
    expect(() => defineStateMachine({ name: 'm', initial: 'a', states: [], events: [], transitions: [], terminalStates: [] })).toThrow(
      InvalidStateMachineDefinitionError,
    );
    expect(() =>
      defineStateMachine({ name: 'm', initial: 'a', states: ['a', 'a'], events: [], transitions: [], terminalStates: [] }),
    ).toThrow(InvalidStateMachineDefinitionError);
    expect(() =>
      defineStateMachine({ name: 'm', initial: 'x', states: ['a'], events: [], transitions: [], terminalStates: [] }),
    ).toThrow(InvalidStateMachineDefinitionError);
    expect(() =>
      defineStateMachine({ name: 'm', initial: 'a', states: ['a'], events: [], transitions: [], terminalStates: ['a'] }),
    ).toThrow(InvalidStateMachineDefinitionError);
    expect(() =>
      defineStateMachine({ name: 'm', initial: 'a', states: ['a'], events: [], transitions: [], terminalStates: ['z'] }),
    ).toThrow(InvalidStateMachineDefinitionError);
  });

  it('rejects duplicate events and duplicate (from, on) rules', () => {
    expect(() =>
      defineStateMachine({ name: 'm', initial: 'a', states: ['a'], events: ['e', 'e'], transitions: [], terminalStates: [] }),
    ).toThrow(InvalidStateMachineDefinitionError);
    expect(() =>
      defineStateMachine({
        name: 'm',
        initial: 'a',
        states: ['a', 'b'],
        events: ['e'],
        transitions: [
          { from: 'a', on: 'e', to: 'b' },
          { from: 'a', on: 'e', to: 'a' },
        ],
        terminalStates: [],
      }),
    ).toThrow(InvalidStateMachineDefinitionError);
  });

  it('rejects transitions referencing undeclared states/events', () => {
    expect(() =>
      defineStateMachine({ name: 'm', initial: 'a', states: ['a'], events: ['e'], transitions: [{ from: 'a', on: 'e', to: 'z' }], terminalStates: [] }),
    ).toThrow(InvalidStateMachineDefinitionError);
    expect(() =>
      defineStateMachine({ name: 'm', initial: 'a', states: ['a'], events: ['e'], transitions: [{ from: 'z', on: 'e', to: 'a' }], terminalStates: [] }),
    ).toThrow(InvalidStateMachineDefinitionError);
    expect(() =>
      defineStateMachine({ name: 'm', initial: 'a', states: ['a'], events: ['e'], transitions: [{ from: 'a', on: 'x', to: 'a' }], terminalStates: [] }),
    ).toThrow(InvalidStateMachineDefinitionError);
  });

  it('non-recovery transitions may not originate in a terminal state; recovery may ONLY originate in one', () => {
    expect(() =>
      defineStateMachine({
        name: 'm',
        initial: 'a',
        states: ['a', 't'],
        events: ['e', 'r'],
        transitions: [{ from: 't', on: 'e', to: 'a' }],
        terminalStates: ['t'],
      }),
    ).toThrow(InvalidStateMachineDefinitionError);
    expect(() =>
      defineStateMachine({
        name: 'm',
        initial: 'a',
        states: ['a', 't'],
        events: ['e', 'r'],
        transitions: [{ from: 'a', on: 'e', to: 't' }],
        terminalStates: ['t'],
        recovery: [{ from: 'a', on: 'r', to: 'a' }],
      }),
    ).toThrow(InvalidStateMachineDefinitionError);
  });
});

describe('state machines: transitions (deterministic, typed failures)', () => {
  it('applies declared transitions and reports them', () => {
    const record = doorMachine.transition('closed', 'OPEN', { isAdmin: false });
    expect(record).toEqual({ from: 'closed', on: 'OPEN', to: 'opened', viaRecovery: false });
    expect(doorMachine.transition('opened', 'CLOSE')).toEqual({ from: 'opened', on: 'CLOSE', to: 'closed', viaRecovery: false });
  });

  it('guards can refuse declared transitions (typed error)', () => {
    expect(() => doorMachine.transition('closed', 'OPEN', { isAdmin: true })).toThrow(TransitionGuardError);
    expect(doorMachine.canTransition('closed', 'OPEN', { isAdmin: true })).toBe(false);
    expect(doorMachine.canTransition('closed', 'OPEN', { isAdmin: false })).toBe(true);
  });

  it('undeclared events and states throw typed errors', () => {
    expect(() => doorMachine.transition('closed', 'SMASH' as 'OPEN')).toThrow(UndeclaredEventError);
    expect(() => doorMachine.transition('ajar' as 'closed', 'OPEN')).toThrow(IllegalTransitionError);
  });

  it('(state, event) pairs without rules throw IllegalTransitionError', () => {
    expect(() => doorMachine.transition('opened', 'OPEN')).toThrow(IllegalTransitionError);
  });

  it('terminal states are monotonic: no exit without a declared recovery rule', () => {
    expect(doorMachine.isTerminal('locked')).toBe(true);
    expect(() => doorMachine.transition('locked', 'OPEN')).toThrow(TerminalStateViolationError);
    expect(() => doorMachine.transition('locked', 'CLOSE')).toThrow(TerminalStateViolationError);
    expect(doorMachine.canTransition('locked', 'OPEN')).toBe(false);
  });

  it('canTransition is the non-throwing probe', () => {
    expect(doorMachine.canTransition('closed', 'LOCK')).toBe(true);
    expect(doorMachine.canTransition('closed', 'CLOSE')).toBe(false);
    expect(doorMachine.canTransition('locked', 'LOCK')).toBe(false);
  });
});

describe('state machines: recovery (the only exit from terminality)', () => {
  const recoveryMachine = defineStateMachine({
    name: 'with-recovery',
    initial: 'start',
    states: ['start', 'dead', 'recovered'],
    events: ['DIE', 'REVIVE'],
    transitions: [{ from: 'start', on: 'DIE', to: 'dead' }],
    terminalStates: ['dead', 'recovered'],
    recovery: [{ from: 'dead', on: 'REVIVE', to: 'recovered', description: 'explicit declared recovery' }],
  });

  it('a declared recovery rule is the only legal exit from a terminal state', () => {
    const record = recoveryMachine.transition('dead', 'REVIVE');
    expect(record).toEqual({ from: 'dead', on: 'REVIVE', to: 'recovered', viaRecovery: true });
  });

  it('other events on the terminal state still throw TerminalStateViolationError', () => {
    expect(() => recoveryMachine.transition('dead', 'DIE')).toThrow(TerminalStateViolationError);
  });

  it('the recovered state is itself terminal (monotonic)', () => {
    expect(recoveryMachine.isTerminal('recovered')).toBe(true);
    expect(() => recoveryMachine.transition('recovered', 'REVIVE')).toThrow(TerminalStateViolationError);
  });
});
