import { useState } from 'react';
import { Card } from '../../components/ui/primitives';
import { DataState } from '../../components/ui/DataState';
import { ProviderFormModal } from './ProviderFormModal';
import { ModelFormModal } from './ModelFormModal';
import {
  useAiProviders,
  useAiModels,
  useAiTasks,
  useDeleteProvider,
  useDeleteModel,
  useUpdateProvider,
  useUpdateModel,
  useSetTaskRoute,
} from '../../lib/hooks';
import type { AiProviderDTO, AiModelDTO } from './types';

export function ProvidersRoutingTab() {
  const providers = useAiProviders();
  const models = useAiModels();
  const tasks = useAiTasks();
  const deleteProvider = useDeleteProvider();
  const deleteModel = useDeleteModel();
  const updateProvider = useUpdateProvider();
  const updateModel = useUpdateModel();
  const setTaskRoute = useSetTaskRoute();

  const [showProviderModal, setShowProviderModal] = useState(false);
  const [showModelModal, setShowModelModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AiProviderDTO | null>(null);
  const [editingModel, setEditingModel] = useState<AiModelDTO | null>(null);

  const handleDeleteProvider = (id: string, label: string) => {
    if (confirm(`Delete provider "${label}"?`)) {
      deleteProvider.mutate(id);
    }
  };

  const handleDeleteModel = (id: string, label: string) => {
    if (confirm(`Delete model "${label}"?`)) {
      deleteModel.mutate(id);
    }
  };

  const handleTaskRoute = (task: string, modelId: string) => {
    setTaskRoute.mutate({ task, modelId });
  };

  // Group models by provider
  const modelsByProvider = models.data?.reduce(
    (acc, model) => {
      if (!acc[model.providerId]) acc[model.providerId] = [];
      acc[model.providerId].push(model);
      return acc;
    },
    {} as Record<string, typeof models.data>,
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Providers Section */}
      <Card>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-heading text-lg">Providers</h3>
          <button
            onClick={() => setShowProviderModal(true)}
            className="bg-brand text-white text-sm px-3 py-1.5 rounded-lg"
          >
            Add provider
          </button>
        </div>
        <DataState
          isLoading={providers.isLoading}
          error={providers.error}
          isEmpty={!providers.data || providers.data.length === 0}
          emptyMessage="No providers configured yet."
        >
          <div className="flex flex-col gap-3">
            {providers.data?.map((p) => (
              <div key={p.id} className="border rounded-lg p-3 flex justify-between items-center">
                <div className="flex flex-col gap-1">
                  <div className="font-semibold">{p.label}</div>
                  <div className="flex gap-2 items-center">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded uppercase font-semibold">
                      {p.dialect}
                    </span>
                    {p.dialect === 'bedrock' ? (
                      <span className="text-xs text-gray-500">Bedrock: SSO</span>
                    ) : (
                      <span className="text-xs text-gray-500">
                        {p.hasSecret ? 'key set ✓' : 'no key'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEditingProvider(p)}
                    className="text-brand text-sm hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteProvider(p.id, p.label)}
                    className="text-loss text-sm hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </DataState>
      </Card>

      {/* Models Section */}
      <Card>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-heading text-lg">Models</h3>
          <button
            onClick={() => setShowModelModal(true)}
            className="bg-brand text-white text-sm px-3 py-1.5 rounded-lg"
          >
            Add model
          </button>
        </div>
        <DataState
          isLoading={models.isLoading}
          error={models.error}
          isEmpty={!models.data || models.data.length === 0}
          emptyMessage="No models configured yet."
        >
          <div className="flex flex-col gap-4">
            {providers.data?.map((provider) => {
              const providerModels = modelsByProvider?.[provider.id] || [];
              if (providerModels.length === 0) return null;
              return (
                <div key={provider.id}>
                  <div className="text-sm font-semibold text-gray-600 mb-2">{provider.label}</div>
                  <div className="flex flex-col gap-2">
                    {providerModels.map((m) => (
                      <div key={m.id} className="border rounded-lg p-3 flex justify-between items-center">
                        <div className="flex flex-col gap-1">
                          <div className="font-semibold">{m.label}</div>
                          <div className="text-xs text-gray-500">{m.modelString}</div>
                          <div className="text-xs text-gray-400 tabular">
                            ${m.inputPerM.toFixed(2)} in / ${m.outputPerM.toFixed(2)} out per M tokens
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setEditingModel(m)}
                            className="text-brand text-sm hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteModel(m.id, m.label)}
                            className="text-loss text-sm hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </DataState>
      </Card>

      {/* Task Routing Section */}
      <Card>
        <h3 className="font-heading text-lg mb-4">Task Routing</h3>
        <DataState
          isLoading={tasks.isLoading}
          error={tasks.error}
          isEmpty={!tasks.data || tasks.data.length === 0}
          emptyMessage="No tasks available."
        >
          <div className="flex flex-col gap-3">
            {tasks.data?.map((task) => (
              <div key={task.task} className="border rounded-lg p-3 flex justify-between items-center gap-4">
                <div className="flex-1">
                  <div className="font-semibold">{task.label}</div>
                  <div className="text-xs text-gray-500">{task.description}</div>
                  {!task.configured && (
                    <span className="inline-block mt-1 text-xs border border-dashed border-amber-400 text-amber-700 bg-amber-50 rounded px-2 py-0.5">
                      Not configured
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={task.assignedModelId || ''}
                    onChange={(e) => handleTaskRoute(task.task, e.target.value)}
                    className="border rounded p-2 text-sm"
                    disabled={setTaskRoute.isPending}
                  >
                    <option value="">Select model…</option>
                    {models.data?.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </DataState>
      </Card>

      <ProviderFormModal
        open={showProviderModal}
        onClose={() => setShowProviderModal(false)}
        onSubmit={() => setShowProviderModal(false)}
      />
      <ModelFormModal
        open={showModelModal}
        onClose={() => setShowModelModal(false)}
        onSubmit={() => setShowModelModal(false)}
      />

      {/* Edit Provider Modal */}
      {editingProvider && (
        <EditProviderModal
          provider={editingProvider}
          onClose={() => setEditingProvider(null)}
          onSave={async (updates) => {
            await updateProvider.mutateAsync({ id: editingProvider.id, ...updates });
            setEditingProvider(null);
          }}
          isPending={updateProvider.isPending}
        />
      )}

      {/* Edit Model Modal */}
      {editingModel && (
        <EditModelModal
          model={editingModel}
          onClose={() => setEditingModel(null)}
          onSave={async (updates) => {
            await updateModel.mutateAsync({ id: editingModel.id, ...updates });
            setEditingModel(null);
          }}
          isPending={updateModel.isPending}
        />
      )}
    </div>
  );
}

// ── Edit Provider Modal ─────────────────────────────────────────────────────

function EditProviderModal({ provider, onClose, onSave, isPending }: {
  provider: AiProviderDTO;
  onClose: () => void;
  onSave: (updates: { label?: string; apiKey?: string; config?: Record<string, unknown> }) => Promise<void>;
  isPending: boolean;
}) {
  const [label, setLabel] = useState(provider.label);
  const [apiKey, setApiKey] = useState('');
  const [region, setRegion] = useState((provider.config as Record<string, string>)?.region ?? 'us-east-1');
  const [profile, setProfile] = useState((provider.config as Record<string, string>)?.profile ?? 'dev');
  const [err, setErr] = useState<string | null>(null);

  const isBedrock = provider.dialect === 'bedrock';

  const submit = async () => {
    setErr(null);
    const updates: { label?: string; apiKey?: string; config?: Record<string, unknown> } = {};
    if (label !== provider.label) updates.label = label;
    if (!isBedrock && apiKey) updates.apiKey = apiKey;
    if (isBedrock) updates.config = { region, profile };
    try {
      await onSave(updates);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-card shadow-card p-6 w-[480px] max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-heading text-lg">Edit Provider: {provider.label}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="flex flex-col gap-3">
          <label className="text-sm">
            Label
            <input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full border rounded p-2 mt-1" />
          </label>
          {!isBedrock && (
            <label className="text-sm">
              New API key (leave blank to keep current)
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full border rounded p-2 mt-1" placeholder="••••••••" />
            </label>
          )}
          {isBedrock && (
            <>
              <label className="text-sm">
                Region
                <input value={region} onChange={(e) => setRegion(e.target.value)} className="w-full border rounded p-2 mt-1" />
              </label>
              <label className="text-sm">
                Profile
                <input value={profile} onChange={(e) => setProfile(e.target.value)} className="w-full border rounded p-2 mt-1" />
              </label>
            </>
          )}
          {err && <div className="text-loss text-sm">{err}</div>}
          <button onClick={submit} disabled={isPending} className="bg-brand text-white rounded-lg py-2 mt-2">
            {isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Model Modal ────────────────────────────────────────────────────────

function EditModelModal({ model, onClose, onSave, isPending }: {
  model: AiModelDTO;
  onClose: () => void;
  onSave: (updates: { label?: string; inputPerM?: number; outputPerM?: number }) => Promise<void>;
  isPending: boolean;
}) {
  const [label, setLabel] = useState(model.label);
  const [inputPerM, setInputPerM] = useState(String(model.inputPerM));
  const [outputPerM, setOutputPerM] = useState(String(model.outputPerM));
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    const inNum = parseFloat(inputPerM);
    const outNum = parseFloat(outputPerM);
    if (isNaN(inNum) || isNaN(outNum) || inNum < 0 || outNum < 0) {
      setErr('Pricing must be valid non-negative numbers.');
      return;
    }
    const updates: { label?: string; inputPerM?: number; outputPerM?: number } = {};
    if (label !== model.label) updates.label = label;
    if (inNum !== model.inputPerM) updates.inputPerM = inNum;
    if (outNum !== model.outputPerM) updates.outputPerM = outNum;
    try {
      await onSave(updates);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-card shadow-card p-6 w-[480px] max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-heading text-lg">Edit Model: {model.label}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="flex flex-col gap-3">
          <label className="text-sm">
            Label
            <input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full border rounded p-2 mt-1" />
          </label>
          <div className="text-xs text-gray-500">Model string: {model.modelString} (not editable)</div>
          <label className="text-sm">
            Input price per million tokens (USD)
            <input type="number" step="0.01" value={inputPerM} onChange={(e) => setInputPerM(e.target.value)} className="w-full border rounded p-2 mt-1" />
          </label>
          <label className="text-sm">
            Output price per million tokens (USD)
            <input type="number" step="0.01" value={outputPerM} onChange={(e) => setOutputPerM(e.target.value)} className="w-full border rounded p-2 mt-1" />
          </label>
          {err && <div className="text-loss text-sm">{err}</div>}
          <button onClick={submit} disabled={isPending} className="bg-brand text-white rounded-lg py-2 mt-2">
            {isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
