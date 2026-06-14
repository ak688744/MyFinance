import { useLiability } from '../../lib/hooks';
import { Modal } from '../../components/ui/Modal';
import { formatINR, formatDate } from '../../lib/format';

export function AmortizationDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detail = useLiability(id ?? '');
  return (
    <Modal open={id !== null} onClose={onClose} title="Amortization Schedule">
      {detail.isLoading && <div className="text-sm text-gray-400">Loading…</div>}
      {detail.data && (
        <table className="w-full text-xs tabular">
          <thead><tr className="text-gray-400 text-left">
            <th>#</th><th>Due</th><th>EMI</th><th>Principal</th><th>Interest</th><th>Balance</th>
          </tr></thead>
          <tbody>
            {detail.data.schedule.slice(0, 60).map((r) => (
              <tr key={r.period} className="border-t border-gray-50">
                <td>{r.period}</td><td>{formatDate(r.dueDate)}</td>
                <td>{formatINR(r.emi)}</td><td>{formatINR(r.principalComponent)}</td>
                <td>{formatINR(r.interestComponent)}</td><td>{formatINR(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
