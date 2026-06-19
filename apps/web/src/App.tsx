import { createBrowserRouter, RouterProvider, Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './components/ui/Sidebar';
import { TopBar } from './components/ui/TopBar';
import { NetWorthPage } from './features/networth/NetWorthPage';
import { InvestmentsPage } from './features/investments/InvestmentsPage';
import { InvestmentAnalyzerPage } from './features/investments/InvestmentAnalyzerPage';
import { ExpensesPage } from './features/expenses/ExpensesPage';
import { LoansPage } from './features/loans/LoansPage';
import { AssistantPage } from './features/assistant/AssistantPage';

const TITLES: { match: (p: string) => boolean; title: string; subtitle?: string }[] = [
  { match: (p) => p === '/', title: 'Net Worth' },
  { match: (p) => p.startsWith('/investments'), title: 'Investments' },
  { match: (p) => p.startsWith('/expenses'), title: 'Expenses' },
  { match: (p) => p.startsWith('/loans'), title: 'Loans', subtitle: 'Manage your liabilities and amortization schedules.' },
  { match: (p) => p.startsWith('/assistant'), title: 'Assistant' },
];

function Layout() {
  const { pathname } = useLocation();
  const meta = TITLES.find((t) => t.match(pathname)) ?? { title: 'MyFinance', subtitle: undefined };
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
        <TopBar title={meta.title} subtitle={meta.subtitle} />
        <main className="p-8 max-w-[1400px] w-full"><Outlet /></main>
      </div>
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <NetWorthPage /> },
      { path: 'investments', element: <InvestmentsPage /> },
      { path: 'investments/:schemeId', element: <InvestmentAnalyzerPage /> },
      { path: 'expenses', element: <ExpensesPage /> },
      { path: 'loans', element: <LoansPage /> },
      { path: 'assistant', element: <AssistantPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
