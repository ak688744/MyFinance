import type { SVGProps } from 'react';

// Minimal inline icon set (stroke-based, 24x24) so the shell matches the
// mockups without pulling in an icon dependency. `currentColor` lets callers
// drive color via text-* classes.
type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...props,
  };
}

export const NetWorthIcon = (p: IconProps) => (
  <svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M8 4v16" /></svg>
);
export const InvestmentsIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 17l6-6 4 4 7-7" /><path d="M14 8h6v6" /></svg>
);
export const ExpensesIcon = (p: IconProps) => (
  <svg {...base(p)}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
);
export const LoansIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6" /></svg>
);
export const AssistantIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 3a4 4 0 0 1 4 4v1a4 4 0 0 1-1 8H9a4 4 0 0 1-1-8V7a4 4 0 0 1 4-4Z" /><path d="M9 11h.01M15 11h.01" /></svg>
);
export const SettingsIcon = (p: IconProps) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.6 15H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 11 3V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 16 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 21 9h.09" /></svg>
);
export const SupportIcon = (p: IconProps) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 2.5" /><path d="M12 17h.01" /></svg>
);
export const SearchIcon = (p: IconProps) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
);
export const BellIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
);
export const AIIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><circle cx="12" cy="12" r="3" /></svg>
);
export const UploadIcon = (p: IconProps) => (
  <svg {...base(p)} aria-hidden>
    <path d="M12 15V4" />
    <path d="M8 8l4-4 4 4" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </svg>
);
export const SparkleIcon = ({ small = false, ...p }: IconProps & { small?: boolean }) => (
  <svg {...base(p)} aria-hidden>
    <path d="M12 3l1.9 4.9L19 9.8l-5.1 1.9L12 16.6l-1.9-4.9L5 9.8l5.1-1.9L12 3z" />
    {small && <path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />}
  </svg>
);
export const HistoryIcon = (p: IconProps) => (
  <svg {...base(p)} aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
);
export const PlusIcon = (p: IconProps) => (
  <svg {...base(p)} aria-hidden><path d="M12 5v14M5 12h14" /></svg>
);
export const SendIcon = (p: IconProps) => (
  <svg {...base(p)} aria-hidden><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
);
export const ChevronDownIcon = (p: IconProps) => (
  <svg {...base(p)} aria-hidden><path d="M6 9l6 6 6-6" /></svg>
);
export const CheckIcon = (p: IconProps) => (
  <svg {...base(p)} aria-hidden><path d="M4 12l5 5L20 7" /></svg>
);
export const ArrowRightIcon = (p: IconProps) => (
  <svg {...base(p)} aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const CloseIcon = (p: IconProps) => (
  <svg {...base(p)} aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
);
