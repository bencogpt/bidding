import type { CSSProperties, ReactNode } from 'react';
import type { ApprovalTag as ApprovalTagKind, ChipTone } from '@obms/shared';

const CHIP_TONE: Record<ChipTone, string> = {
  neutral: '',
  run: 'agent-chip-run',
  ok: 'agent-chip-ok',
  wrn: 'agent-chip-wrn',
  blk: 'agent-chip-blk',
};

/** The agent's status chip and the severity chip of a finding (prototype .agchip, lines 221–225). */
export function AgentChip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return <span className={`agent-chip ${CHIP_TONE[tone]}`}>{children}</span>;
}

/** Severity chip of a finding: blocking = solid red, warning = amber outline. */
export function SeverityChip({ severity }: { severity: 'block' | 'warn' }) {
  return <AgentChip tone={severity === 'block' ? 'blk' : 'wrn'}>{severity === 'block' ? 'חוסם' : 'אזהרה'}</AgentChip>;
}

const APPR_CLASS: Record<ApprovalTagKind, string> = {
  approved: 'appr-tag-approved',
  on_behalf: 'appr-tag-approved',
  pending: 'appr-tag-pending',
};

/** Approval state: approved = solid green, waiting = grey (prototype .ap, lines 1189–1193). */
export function ApprovalTag({ tag, children, title }: { tag: ApprovalTagKind; children: ReactNode; title?: string }) {
  return (
    <span className={`appr-tag ${APPR_CLASS[tag]}`} title={title}>
      {children}
    </span>
  );
}

/** Stage tag: filled = the case is in this stage, outlined = not reached yet (prototype .st-tag). */
export function StageTag({ label, color, upcoming = false, title }: { label: string; color: string; upcoming?: boolean; title?: string }) {
  return (
    <span className={`stage-tag ${upcoming ? 'stage-tag-upcoming' : ''}`} style={{ '--stage': color } as CSSProperties} title={title}>
      {label}
    </span>
  );
}
