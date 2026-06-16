import { NavLink } from 'react-router-dom';
import type { ComponentType, SVGProps } from 'react';
import {
  NetWorthIcon, InvestmentsIcon, ExpensesIcon, LoansIcon, AssistantIcon,
  SettingsIcon, SupportIcon,
} from './icons';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const NAV: { to: string; label: string; end?: boolean; icon: Icon }[] = [
  { to: '/', label: 'Net Worth', end: true, icon: NetWorthIcon },
  { to: '/investments', label: 'Investments', icon: InvestmentsIcon },
  { to: '/expenses', label: 'Expenses', icon: ExpensesIcon },
  { to: '/loans', label: 'Loans', icon: LoansIcon },
  { to: '/assistant', label: 'Assistant', icon: AssistantIcon },
];

export function Sidebar() {
  return (
    <nav className="w-60 shrink-0 border-r border-gray-200 bg-white h-screen sticky top-0 flex flex-col">
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-5">
        <div className="w-9 h-9 rounded-lg bg-brand/10 text-brand flex items-center justify-center">
          <NetWorthIcon width={20} height={20} />
        </div>
        <div className="leading-tight">
          <div className="font-heading font-extrabold text-lg text-brand">MyFinance</div>
          <div className="text-[11px] text-gray-400 font-medium">Wealth Manager</div>
        </div>
      </div>

      <div className="flex flex-col gap-1 px-3 flex-1">
        {NAV.map((n) => {
          const Ico = n.icon;
          return (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-brand/10 text-brand' : 'text-gray-600 hover:bg-gray-50'
                }`
              }
            >
              <Ico />
              {n.label}
            </NavLink>
          );
        })}
      </div>

      <div className="px-3 pb-3 flex flex-col gap-1 border-t border-gray-100 pt-3">
        <button className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50">
          <SettingsIcon /> Settings
        </button>
        <button className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50">
          <SupportIcon /> Support
        </button>
      </div>

      <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-100">
        <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center text-sm font-semibold">U</div>
        <div className="text-sm font-medium text-gray-700">User</div>
      </div>
    </nav>
  );
}
