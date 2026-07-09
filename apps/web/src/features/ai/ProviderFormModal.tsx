import { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { useCreateProvider } from '../../lib/hooks';

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit?: () => void;
};

export function ProviderFormModal({ open, onClose, onSubmit }: Props) {
  const createProvider = useCreateProvider();
  const [id, setId] = useState('');
  const [dialect, setDialect] = useState<'gemini' | 'openai-compatible' | 'bedrock'>('gemini');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [profile, setProfile] = useState('dev');
  const [err, setErr] = useState<string | null>(null);

  const showKeyFields = dialect === 'gemini' || dialect === 'openai-compatible';
  const showBedrockFields = dialect === 'bedrock';

  const submit = async () => {
    setErr(null);
    if (!id || !label) {
      setErr('ID and label are required.');
      return;
    }
    if (showKeyFields && !apiKey) {
      setErr('API key is required.');
      return;
    }
    const body: { id: string; dialect: string; label: string; apiKey?: string; config?: Record<string, unknown> } = {
      id,
      dialect,
      label,
    };
    if (showKeyFields) {
      body.apiKey = apiKey;
      if (baseURL) {
        body.config = { baseURL };
      }
    }
    if (showBedrockFields) {
      body.config = { region, profile };
    }
    try {
      await createProvider.mutateAsync(body);
      if (onSubmit) onSubmit();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create provider.');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Provider">
      <div className="flex flex-col gap-3">
        <label className="text-sm">
          ID
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            className="w-full border rounded p-2 mt-1"
            placeholder="e.g., my-gemini"
          />
        </label>
        <label className="text-sm">
          Dialect
          <select
            value={dialect}
            onChange={(e) => setDialect(e.target.value as 'gemini' | 'openai-compatible' | 'bedrock')}
            className="w-full border rounded p-2 mt-1"
          >
            <option value="gemini">Gemini</option>
            <option value="openai-compatible">OpenAI-compatible</option>
            <option value="bedrock">Bedrock</option>
          </select>
        </label>
        <label className="text-sm">
          Label
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full border rounded p-2 mt-1"
            placeholder="e.g., My Gemini Provider"
          />
        </label>
        {showKeyFields && (
          <>
            <label className="text-sm">
              API key
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full border rounded p-2 mt-1"
                placeholder="Your API key"
              />
            </label>
            <label className="text-sm">
              Base URL (optional)
              <input
                value={baseURL}
                onChange={(e) => setBaseURL(e.target.value)}
                className="w-full border rounded p-2 mt-1"
                placeholder="Custom API endpoint"
              />
            </label>
          </>
        )}
        {showBedrockFields && (
          <>
            <div className="text-xs text-gray-600 bg-gray-50 rounded p-2">
              Auth via your AWS SSO session — run <code className="font-mono text-xs">aws sso login</code> first.
            </div>
            <label className="text-sm">
              Region
              <input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full border rounded p-2 mt-1"
                placeholder="us-east-1"
              />
            </label>
            <label className="text-sm">
              Profile
              <input
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                className="w-full border rounded p-2 mt-1"
                placeholder="dev"
              />
            </label>
          </>
        )}
        {err && <div className="text-loss text-sm">{err}</div>}
        <button
          onClick={submit}
          disabled={createProvider.isPending}
          className="bg-brand text-white rounded-lg py-2 mt-2"
        >
          {createProvider.isPending ? 'Saving…' : 'Add provider'}
        </button>
      </div>
    </Modal>
  );
}
