import type { ReactNode } from 'react';

export type IconName =
  | 'logo'
  | 'moon'
  | 'sun'
  | 'monitor'
  | 'bell'
  | 'bellOff'
  | 'chevronDown'
  | 'chevronUp'
  | 'image'
  | 'send'
  | 'close'
  | 'trash'
  | 'wifiOff'
  | 'refresh'
  | 'arrowDown'
  | 'alert'
  | 'spinner';

const PATHS: Record<IconName, ReactNode> = {
  logo: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M12 6a6 6 0 0 1 6 6" />
      <path d="M12 2a10 10 0 0 1 10 10" />
      <path d="M12 18a6 6 0 0 1-6-6" />
      <path d="M12 22A10 10 0 0 1 2 12" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  bell: <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0" />,
  bellOff: <path d="M6 8a6 6 0 0 1 9.3-5M18 8c0 4 1 6 2 7H5M10 21a2 2 0 0 0 4 0M3 3l18 18" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronUp: <path d="m18 15-6-6-6 6" />,
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m21 16-5-5-9 9" />
    </>
  ),
  send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  wifiOff: <path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01M3 3l18 18" />,
  refresh: <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16.5h.01" />
    </>
  ),
  spinner: <path d="M21 12a9 9 0 1 1-6.2-8.6" />,
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

/** 純裝飾的圖示。需要讓讀屏軟體念出來的，由外面的按鈕加 aria-label。 */
export function Icon({ name, size = 22, className, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
