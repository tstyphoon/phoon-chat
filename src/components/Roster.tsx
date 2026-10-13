import type { PresenceMember } from '../types';
import { nickColorIndex } from '../utils/format';
import { Icon } from './Icon';

interface RosterListProps {
  id?: string;
  members: PresenceMember[];
  meSessionId: string | undefined;
}

/** 在線名單：自己排第一並標示「（你）」，其餘依加入時間 */
export function RosterList({ id, members, meSessionId }: RosterListProps) {
  const sorted = [...members].sort((a, b) => {
    if (a.session_id === meSessionId) return -1;
    if (b.session_id === meSessionId) return 1;
    return a.joined_at < b.joined_at ? -1 : 1;
  });
  return (
    <ul id={id} className="roster" aria-label="在線名單">
      {sorted.map((member) => (
        <li key={member.session_id} className="roster-item">
          <span className="online-dot" aria-hidden="true" />
          <span className={`nick nick-${nickColorIndex(member.nickname)}`}>{member.nickname}</span>
          {member.session_id === meSessionId && <span className="roster-self">（你）</span>}
        </li>
      ))}
    </ul>
  );
}

interface OnlineBarProps {
  count: number;
  open: boolean;
  controlsId: string;
  onToggle: () => void;
}

/** 手機上的人數列：點一下展開或收合名單 */
export function OnlineBar({ count, open, controlsId, onToggle }: OnlineBarProps) {
  return (
    <button
      type="button"
      className="online-bar"
      aria-expanded={open}
      aria-controls={controlsId}
      onClick={onToggle}
    >
      <span className="online-dot" aria-hidden="true" />
      <span className="online-count">{count} 人在線</span>
      <Icon name={open ? 'chevronUp' : 'chevronDown'} size={20} className="online-chevron" strokeWidth={2} />
    </button>
  );
}
