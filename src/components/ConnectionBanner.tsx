import type { ConnectionStatus } from '../types';
import { Icon } from './Icon';

/** 只在斷線時出現在頂端 */
export function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  if (status === 'connected') return null;
  return (
    <div role="status" className="connection-banner">
      <Icon name="wifiOff" size={18} strokeWidth={2} />
      {status === 'reconnecting' ? '連線中斷，重新連線中…' : '連線已中斷，請重新整理頁面'}
    </div>
  );
}
