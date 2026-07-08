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
  useSetTaskRoute,
} from '../../lib/hooks';

export function ProvidersRoutingTab() {
  const providers = useAiProviders();
  const models = useAiModels();
  const tasks = useAiTasks();
  const deleteProvider = useDeleteProvider();
  const deleteModel = useDeleteModel();
  const setTaskRoute = useSetTaskRoute();

  const [showProviderModal, setShowProviderModal] = useState(false);
  const [showModelModal, setShowModelModal] = useState(false);

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
                <button
                  onClick={() => handleDeleteProvider(p.id, p.label)}
                  className="text-loss text-sm hover:underline"
                >
                  Delete
                </button>
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
                        <button
                          onClick={() => handleDeleteModel(m.id, m.label)}
                          className="text-loss text-sm hover:underline"
                        >
                          Delete
                        </button>
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
    </div>
  );
}
