import { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { useAiProviders, useCreateModel, useAiPricingHint } from '../../lib/hooks';

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit?: () => void;
};

export function ModelFormModal({ open, onClose, onSubmit }: Props) {
  const createModel = useCreateModel();
  const providers = useAiProviders();
  const [id, setId] = useState('');
  const [providerId, setProviderId] = useState('');
  const [modelString, setModelString] = useState('');
  const [label, setLabel] = useState('');
  const [inputPerM, setInputPerM] = useState('');
  const [outputPerM, setOutputPerM] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const pricingHint = useAiPricingHint(modelString);

  // Prefill pricing when hint arrives and fields are empty
  useEffect(() => {
    if (pricingHint.data && modelString) {
      if (!inputPerM) setInputPerM(String(pricingHint.data.inputPerM));
      if (!outputPerM) setOutputPerM(String(pricingHint.data.outputPerM));
    }
  }, [pricingHint.data, modelString, inputPerM, outputPerM]);

  const submit = async () => {
    setErr(null);
    if (!id || !providerId || !modelString || !label) {
      setErr('All fields except pricing are required.');
      return;
    }
    const inNum = parseFloat(inputPerM);
    const outNum = parseFloat(outputPerM);
    if (isNaN(inNum) || isNaN(outNum)) {
      setErr('Pricing must be valid numbers.');
      return;
    }
    try {
      await createModel.mutateAsync({ id, providerId, modelString, label, inputPerM: inNum, outputPerM: outNum });
      if (onSubmit) onSubmit();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create model.');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Model">
      <div className="flex flex-col gap-3">
        <label className="text-sm">
          ID
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            className="w-full border rounded p-2 mt-1"
            placeholder="e.g., gemini-pro"
          />
        </label>
        <label className="text-sm">
          Provider
          <select
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className="w-full border rounded p-2 mt-1"
          >
            <option value="">Select provider…</option>
            {providers.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Model string
          <input
            value={modelString}
            onChange={(e) => setModelString(e.target.value)}
            onBlur={() => {
              // Trigger pricing hint fetch on blur
              if (modelString) {
                pricingHint.refetch();
              }
            }}
            className="w-full border rounded p-2 mt-1"
            placeholder="e.g., gemini-1.5-pro-002"
          />
        </label>
        <label className="text-sm">
          Label
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full border rounded p-2 mt-1"
            placeholder="e.g., Gemini Pro 1.5"
          />
        </label>
        <label className="text-sm">
          Input price per million tokens (USD)
          <input
            type="number"
            step="0.01"
            value={inputPerM}
            onChange={(e) => setInputPerM(e.target.value)}
            className="w-full border rounded p-2 mt-1"
            placeholder="e.g., 1.25"
          />
        </label>
        <label className="text-sm">
          Output price per million tokens (USD)
          <input
            type="number"
            step="0.01"
            value={outputPerM}
            onChange={(e) => setOutputPerM(e.target.value)}
            className="w-full border rounded p-2 mt-1"
            placeholder="e.g., 5.00"
          />
        </label>
        {pricingHint.data && (
          <div className="text-xs text-gray-600 bg-gray-50 rounded p-2">
            Pricing hint loaded: ${pricingHint.data.inputPerM} in / ${pricingHint.data.outputPerM} out per million tokens
          </div>
        )}
        {err && <div className="text-loss text-sm">{err}</div>}
        <button
          onClick={submit}
          disabled={createModel.isPending}
          className="bg-brand text-white rounded-lg py-2 mt-2"
        >
          {createModel.isPending ? 'Saving…' : 'Add model'}
        </button>
      </div>
    </Modal>
  );
}
