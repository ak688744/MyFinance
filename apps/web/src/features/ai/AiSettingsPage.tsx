import { useState } from 'react';
import { ProvidersRoutingTab } from './ProvidersRoutingTab';
import { UsageCostTab } from './UsageCostTab';

type Tab = 'providers' | 'usage';

export function AiSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('providers');

  return (
    <div className="flex flex-col gap-5">
      {/* Tab Switcher */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('providers')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
            activeTab === 'providers'
              ? 'text-brand'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Providers & Routing
          {activeTab === 'providers' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('usage')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
            activeTab === 'usage'
              ? 'text-brand'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Usage & Cost
          {activeTab === 'usage' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />
          )}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'providers' && <ProvidersRoutingTab />}
      {activeTab === 'usage' && <UsageCostTab />}
    </div>
  );
}
