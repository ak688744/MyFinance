import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom';
import { Sidebar } from './components/ui/Sidebar';
import { NetWorthPage } from './features/networth/NetWorthPage';
import { InvestmentsPage } from './features/investments/InvestmentsPage';
import { InvestmentAnalyzerPage } from './features/investments/InvestmentAnalyzerPage';
import { ExpensesPage } from './features/expenses/ExpensesPage';
import { LoansPage } from './features/loans/LoansPage';
import { AssistantPage } from './features/assistant/AssistantPage';

function Layout() {
  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8 max-w-[1400px]"><Outlet /></main>
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
