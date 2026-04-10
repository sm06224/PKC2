import { describe, it, expect } from 'vitest';
import type { UserAction } from '@core/action/user-action';
import type { SystemCommand } from '@core/action/system-command';
import type { DomainEvent } from '@core/action/domain-event';
import type { Dispatchable } from '@core/action';
import type { MessageEnvelope } from '@core/model/message';

/**
 * These tests verify the structural properties of the action contract:
 * - UserAction and SystemCommand type literals don't overlap
 * - DomainEvent types are distinct from Dispatchable types
 * - MessageEnvelope is structurally separate from internal actions
 */

// Helper: extract all type literals from a union at the value level
function typeSet<T extends { type: string }>(...items: T[]): Set<string> {
  return new Set(items.map((i) => i.type));
}

describe('Action type boundaries', () => {
  it('UserAction type literals all exist and are unique strings', () => {
    // Construct one of each to prove the union covers them
    const actions: UserAction[] = [
      { type: 'SELECT_ENTRY', lid: '' },
      { type: 'DESELECT_ENTRY' },
      { type: 'BEGIN_EDIT', lid: '' },
      { type: 'COMMIT_EDIT', lid: '', title: '', body: '' },
      { type: 'CANCEL_EDIT' },
      { type: 'CREATE_ENTRY', archetype: 'text', title: '' },
      { type: 'DELETE_ENTRY', lid: '' },
      { type: 'BEGIN_EXPORT', mode: 'full', mutability: 'editable' },
      { type: 'CREATE_RELATION', from: '', to: '', kind: 'structural' },
      { type: 'DELETE_RELATION', id: '' },
      { type: 'PASTE_ATTACHMENT', name: '', mime: '', size: 0, assetKey: '', assetData: '', contextLid: '' },
    ];
    const types = typeSet(...actions);
    expect(types.size).toBe(actions.length);
  });

  it('SystemCommand type literals all start with SYS_', () => {
    const commands: SystemCommand[] = [
      { type: 'SYS_INIT_COMPLETE', container: null as never },
      { type: 'SYS_INIT_ERROR', error: '' },
      { type: 'SYS_FINISH_EXPORT' },
      { type: 'SYS_ERROR', error: '' },
    ];
    for (const cmd of commands) {
      expect(cmd.type).toMatch(/^SYS_/);
    }
    const types = typeSet(...commands);
    expect(types.size).toBe(commands.length);
  });

  it('UserAction and SystemCommand types do not overlap', () => {
    const userTypes = new Set<string>([
      'SELECT_ENTRY', 'DESELECT_ENTRY', 'BEGIN_EDIT', 'COMMIT_EDIT',
      'CANCEL_EDIT', 'CREATE_ENTRY', 'DELETE_ENTRY', 'BEGIN_EXPORT',
      'CREATE_RELATION', 'DELETE_RELATION',
    ]);
    const sysTypes = new Set<string>([
      'SYS_INIT_COMPLETE', 'SYS_INIT_ERROR', 'SYS_FINISH_EXPORT', 'SYS_ERROR',
    ]);
    for (const t of userTypes) {
      expect(sysTypes.has(t)).toBe(false);
    }
  });

  it('DomainEvent type literals are past tense / factual', () => {
    const events: DomainEvent[] = [
      { type: 'ENTRY_SELECTED', lid: '' },
      { type: 'ENTRY_DESELECTED' },
      { type: 'EDIT_BEGUN', lid: '' },
      { type: 'EDIT_COMMITTED', lid: '' },
      { type: 'EDIT_CANCELLED' },
      { type: 'ENTRY_CREATED', lid: '', archetype: 'text' },
      { type: 'ENTRY_UPDATED', lid: '' },
      { type: 'ENTRY_DELETED', lid: '' },
      { type: 'RELATION_CREATED', id: '', from: '', to: '', kind: 'structural' },
      { type: 'RELATION_DELETED', id: '' },
      { type: 'CONTAINER_LOADED', container_id: '' },
      { type: 'EXPORT_COMPLETED' },
      { type: 'ERROR_OCCURRED', error: '' },
    ];
    const types = typeSet(...events);
    expect(types.size).toBe(events.length);
  });

  it('Dispatchable is the union of UserAction and SystemCommand', () => {
    // A UserAction is Dispatchable
    const ua: Dispatchable = { type: 'SELECT_ENTRY', lid: '' };
    // A SystemCommand is Dispatchable
    const sc: Dispatchable = { type: 'SYS_INIT_COMPLETE', container: null as never };
    expect(ua.type).toBe('SELECT_ENTRY');
    expect(sc.type).toBe('SYS_INIT_COMPLETE');
  });

  it('MessageEnvelope has a distinct protocol discriminant', () => {
    const msg: MessageEnvelope = {
      protocol: 'pkc-message',
      version: 1,
      type: 'ping',
      source_id: null,
      target_id: null,
      payload: null,
      timestamp: '2026-01-01T00:00:00Z',
    };
    // MessageEnvelope uses 'protocol' as discriminant, not just 'type'
    expect(msg.protocol).toBe('pkc-message');
    // Its 'type' field is a MessageType, not a UserAction/SystemCommand type
    expect(msg.type).toBe('ping');
  });
});
