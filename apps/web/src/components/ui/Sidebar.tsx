import { NavLink } from 'react-router-dom';

const NAV = [
  { to: '/', label: 'Net Worth', end: true },
  { to: '/investments', label: 'Investments' },
  { to: '/expenses', label: 'Expenses' },
  { to: '/loans', label: 'Loans' },
  { to: '/assistant', label: 'Assistant' },
];

export function Sidebar() {
  return (
    <nav className="w-56 shrink-0 border-r border-gray-200 bg-white h-screen p-4 flex flex-col gap-1">
      <div className="font-heading font-extrabold text-lg px-3 py-4 text-brand">MyFinance</div>
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          className={({ isActive }) =>
            `px-3 py-2 rounded-lg text-sm font-medium ${isActive ? 'bg-brand/10 text-brand' : 'text-gray-600 hover:bg-gray-50'}`
          }
        >
          {n.label}
        </NavLink>
      ))}
    </nav>
  );
}
