import { Card } from '../../components/ui/primitives';
import { ArrowRightIcon } from '../../components/ui/icons';
import { formatINR } from '../../lib/format';

export type Balance = { opening: number; closing: number; net: number };

export function BalanceCard({ balance }: { balance: Balance | null | undefined }) {
  return (
    <Card>
      <div className="text-[11px] text-ink-muted uppercase tracking-wider font-medium">Balance</div>
      {balance ? (
        <>
          <div className="flex items-center justify-between gap-2 mt-2">
            <div>
              <div className="text-[10px] text-ink-subtle">Opening</div>
              <div className="text-[15px] font-semibold tabular">{formatINR(balance.opening)}</div>
            </div>
            <ArrowRightIcon width={14} height={14} className="text-ink-subtle shrink-0" />
            <div className="text-right">
              <div className="text-[10px] text-ink-subtle">Closing</div>
              <div className="text-[15px] font-semibold tabular">{formatINR(balance.closing)}</div>
            </div>
          </div>
          <div className={`mt-2 text-[11px] font-semibold tabular ${balance.net >= 0 ? 'text-gain' : 'text-loss'}`}>
            {balance.net >= 0 ? '+' : '−'}{formatINR(Math.abs(balance.net))}
          </div>
        </>
      ) : (
        <>
          <div className="text-[15px] font-semibold text-ink-subtle mt-2">{'—'}</div>
          <div className="mt-2 text-[11px] text-ink-subtle">No bank balance data this month</div>
        </>
      )}
    </Card>
  );
}
