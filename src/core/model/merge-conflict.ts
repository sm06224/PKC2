export type ConflictKind = 'content-equal' | 'title-only' | 'title-only-multi';
export type Resolution = 'keep-current' | 'duplicate-as-branch' | 'skip';

export interface EntryConflict {
  imported_lid: string;
  host_lid: string;
  host_candidates?: string[];
  kind: ConflictKind;
  imported_title: string;
  host_title: string;
  archetype: string;
  imported_content_hash: string;
  host_content_hash: string;
  imported_body_preview: string;
  host_body_preview: string;
  imported_created_at: string;
  imported_updated_at: string;
  host_created_at: string;
  host_updated_at: string;
}
