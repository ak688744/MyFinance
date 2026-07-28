import { NavLink } from 'react-router-dom';
import type { ComponentType, SVGProps } from 'react';
import {
  NetWorthIcon, InvestmentsIcon, ExpensesIcon, LoansIcon, AssistantIcon,
  AIIcon, SettingsIcon, SupportIcon,
} from './icons';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const NAV: { to: string; label: string; end?: boolean; icon: Icon }[] = [
  { to: '/', label: 'Net Worth', end: true, icon: NetWorthIcon },
  { to: '/investments', label: 'Investments', icon: InvestmentsIcon },
  { to: '/expenses', label: 'Expenses', icon: ExpensesIcon },
  { to: '/loans', label: 'Loans', icon: LoansIcon },
  { to: '/assistant', label: 'Assistant', icon: AssistantIcon },
  { to: '/ai', label: 'AI', icon: AIIcon },
];

export function Sidebar() {
  return (
    <nav className="w-[248px] shrink-0 border-r border-border bg-surface h-screen sticky top-0 flex flex-col shadow-nav">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand to-brand-dark text-white flex items-center justify-center shadow-sm">
          <NetWorthIcon width={20} height={20} />
        </div>
        <div className="leading-tight">
          <div className="font-heading font-bold text-lg text-ink tracking-tight">MyFinance</div>
          <div className="text-[11px] text-ink-subtle font-medium">Wealth Manager</div>
        </div>
      </div>

      <div className="flex flex-col gap-0.5 px-3 flex-1">
        {NAV.map((n) => {
          const Ico = n.icon;
          return (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
                  isActive
                    ? 'bg-brand/10 text-brand shadow-sm border-l-[3px] border-l-brand -ml-px pl-[11px]'
                    : 'text-ink-muted hover:bg-canvas hover:text-ink border-l-[3px] border-l-transparent -ml-px pl-[11px]'
                }`
              }
            >
              <Ico className="shrink-0 opacity-80 group-hover:opacity-100" />
              {n.label}
            </NavLink>
          );
        })}
      </div>

      <div className="px-3 pb-2 flex flex-col gap-0.5 border-t border-border pt-3 mx-3">
        <button type="button" className="btn-ghost justify-start gap-3 w-full">
          <SettingsIcon /> Settings
        </button>
        <button type="button" className="btn-ghost justify-start gap-3 w-full">
          <SupportIcon /> Support
        </button>
      </div>

      <div className="flex items-center gap-3 px-5 py-4 border-t border-border mt-2">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand/20 to-brand/5 text-brand flex items-center justify-center text-sm font-semibold ring-2 ring-brand/10">
          U
        </div>
        <div>
          <div className="text-sm font-medium text-ink">User</div>
          <div className="text-[11px] text-ink-subtle">Personal portfolio</div>
        </div>
      </div>
    </nav>
  );
}
