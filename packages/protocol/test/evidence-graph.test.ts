import { describe, expect, it } from 'vitest';
import {
  EvidenceGraph,
  EvidenceMutationError,
  UnknownEvidenceNodeError,
  ValidationError,
  type EvidenceNodeDraft,
} from '../src/index.ts';

function draft(overrides: Partial<EvidenceNodeDraft> = {}): EvidenceNodeDraft {
  return {
    nodeId: 'ev-1',
    kind: 'AUTHORIZATION',
    actionRef: 'SI:ns-1:alice>bob:USD',
    claimedLevel: 'P2',
    provenance: { source: 'PROTOCOL_LEDGER' },
    payload: 'authorization artifact bytes',
    links: [],
    recordedAt: 1_000n,
    ...overrides,
  };
}

describe('evidence graph (adapted from old evidence-graph.test.ts; INV-05/INV-03)', () => {
  it('records nodes immutably and indexes them by action', () => {
    const graph = new EvidenceGraph();
    const node = graph.record(draft());
    expect(node.nodeId).toBe('ev-1');
    expect(node.payloadHash).toMatch(/^evh:[0-9a-f]+$/);
    expect(Object.isFrozen(node)).toBe(true);
    expect(graph.node('ev-1')).toBe(node);
    expect(graph.allNodes()).toHaveLength(1);
  });

  it('re-recording identical content is an idempotent replay; ANY difference mutates history (INV-03)', () => {
    const graph = new EvidenceGraph();
    graph.record(draft());
    expect(graph.record(draft())).toBe(graph.node('ev-1')); // replay
    expect(() => graph.record(draft({ payload: 'tampered' }))).toThrow(EvidenceMutationError);
    expect(() => graph.record(draft({ claimedLevel: 'P5' }))).toThrow(EvidenceMutationError);
    expect(() => graph.record(draft({ recordedAt: 9_999n }))).toThrow(EvidenceMutationError);
    expect(graph.allNodes()).toHaveLength(1);
  });

  it('lineage links must reference already-recorded parents (bottom-up recording)', () => {
    const graph = new EvidenceGraph();
    expect(() => graph.record(draft({ links: ['ev-never-recorded'] }))).toThrow(UnknownEvidenceNodeError);
    graph.record(draft());
    const child = graph.record(
      draft({ nodeId: 'ev-2', kind: 'PAYOUT', links: ['ev-1'], claimedLevel: 'P3' }),
    );
    expect(child.links).toEqual(['ev-1']);
    // chainOf walks the transitive lineage deterministically
    const chain = graph.chainOf('ev-2');
    expect(chain.map((n) => n.nodeId)).toEqual(['ev-2', 'ev-1']);
  });

  it('validates node shape (kind, actionRef, level, provenance, payload, timestamp, links)', () => {
    const graph = new EvidenceGraph();
    expect(() => graph.record(draft({ kind: 'NOT_A_KIND' as never }))).toThrow(ValidationError);
    expect(() => graph.record(draft({ actionRef: '' }))).toThrow(ValidationError);
    expect(() => graph.record(draft({ claimedLevel: '' }))).toThrow(ValidationError);
    expect(() => graph.record(draft({ provenance: { source: 'MYSTERY' } as never }))).toThrow(ValidationError);
    expect(() => graph.record(draft({ payload: 42 as never }))).toThrow(ValidationError);
    expect(() => graph.record(draft({ recordedAt: 1 as never }))).toThrow(ValidationError);
    expect(() => graph.record(draft({ links: 'nope' as never }))).toThrow(ValidationError);
    expect(() => graph.record(draft({ nodeId: '' }))).toThrow(ValidationError);
  });

  it('canonicalNode renders byte-identical output for identical nodes', () => {
    const graph = new EvidenceGraph();
    graph.record(draft());
    const first = graph.canonicalNode('ev-1');
    const second = graph.canonicalNode('ev-1');
    expect(first).toBe(second);
    expect(first).toContain('kind:AUTHORIZATION');
    expect(first).toContain('action:SI:ns-1:alice>bob:USD');
  });

  it('conflictsWith is the non-throwing immutability probe', () => {
    const graph = new EvidenceGraph();
    graph.record(draft());
    expect(graph.conflictsWith(draft())).toBe(false);
    expect(graph.conflictsWith(draft({ payload: 'different' }))).toBe(true);
  });
});

describe('DISTINCT evidence kinds (P1-W2 requirement: funding/conversion/payout/observation/finality never conflated)', () => {
  it('the seven kinds are declared and queryable separately per action', () => {
    const graph = new EvidenceGraph();
    const actionRef = 'SI:ns-1:alice>bob:USD';
    graph.record(draft({ nodeId: 'ev-auth', kind: 'AUTHORIZATION', actionRef }));
    graph.record(draft({ nodeId: 'ev-fund', kind: 'FUNDING', actionRef, claimedLevel: 'P2' }));
    graph.record(draft({ nodeId: 'ev-conv', kind: 'CONVERSION', actionRef, claimedLevel: 'P3' }));
    graph.record(draft({ nodeId: 'ev-pay', kind: 'PAYOUT', actionRef, claimedLevel: 'P3' }));
    graph.record(draft({ nodeId: 'ev-obs', kind: 'OBSERVATION', actionRef, claimedLevel: 'P3' }));
    graph.record(draft({ nodeId: 'ev-fin', kind: 'FINALITY', actionRef, claimedLevel: 'P5' }));
    graph.record(draft({ nodeId: 'ev-rec', kind: 'RECONCILIATION', actionRef, claimedLevel: 'P2' }));

    const lineage = graph.lineageForAction(actionRef);
    expect(lineage.authorization.map((n) => n.nodeId)).toEqual(['ev-auth']);
    expect(lineage.funding.map((n) => n.nodeId)).toEqual(['ev-fund']);
    expect(lineage.conversion.map((n) => n.nodeId)).toEqual(['ev-conv']);
    expect(lineage.payout.map((n) => n.nodeId)).toEqual(['ev-pay']);
    expect(lineage.observation.map((n) => n.nodeId)).toEqual(['ev-obs']);
    expect(lineage.finality.map((n) => n.nodeId)).toEqual(['ev-fin']);
    expect(lineage.reconciliation.map((n) => n.nodeId)).toEqual(['ev-rec']);
    expect(lineage.all).toHaveLength(7);
  });

  it('a PAYOUT record is NOT an OBSERVATION record (distinct kinds by construction)', () => {
    const graph = new EvidenceGraph();
    const actionRef = 'SI:x';
    graph.record(draft({ nodeId: 'ev-payout-sent', kind: 'PAYOUT', actionRef }));
    const lineage = graph.lineageForAction(actionRef);
    // "payout sent" is execution evidence, NOT beneficiary-account credit:
    expect(lineage.payout).toHaveLength(1);
    expect(lineage.observation).toHaveLength(0); // no external observation recorded yet
    // once the beneficiary account is externally observed, it is its OWN kind:
    graph.record(draft({ nodeId: 'ev-beneficiary-observed', kind: 'OBSERVATION', actionRef }));
    const after = graph.lineageForAction(actionRef);
    expect(after.payout.map((n) => n.nodeId)).toEqual(['ev-payout-sent']);
    expect(after.observation.map((n) => n.nodeId)).toEqual(['ev-beneficiary-observed']);
  });

  it('provenance distinguishes authenticated provider, observer, operator and UI artifacts', () => {
    const graph = new EvidenceGraph();
    graph.record(
      draft({
        nodeId: 'ev-prov',
        kind: 'OBSERVATION',
        provenance: { source: 'AUTHENTICATED_PROVIDER', providerName: 'wise' },
      }),
    );
    graph.record(
      draft({
        nodeId: 'ev-obs2',
        kind: 'OBSERVATION',
        provenance: { source: 'INDEPENDENT_OBSERVER', observerRef: 'observer-7' },
      }),
    );
    graph.record(
      draft({
        nodeId: 'ev-ui',
        kind: 'OBSERVATION',
        provenance: { source: 'UI_BROWSER_ARTIFACT', authenticated: true },
      }),
    );
    expect(graph.canonicalNode('ev-prov')).toContain('provenance:AUTHENTICATED_PROVIDER:wise');
    expect(graph.canonicalNode('ev-obs2')).toContain('provenance:INDEPENDENT_OBSERVER:observer-7');
    expect(graph.canonicalNode('ev-ui')).toContain('provenance:UI_BROWSER_ARTIFACT:AUTHENTICATED');
  });
});
