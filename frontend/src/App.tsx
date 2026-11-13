import { useEffect, useState } from 'react';
import { Compass, FolderHeart, Library, Sparkles } from 'lucide-react';
import { memedeckApi } from './lib/api';

type Tab = 'discover' | 'library' | 'collections';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('discover');
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    memedeckApi
      .health()
      .then(() => setApiStatus('online'))
      .catch(() => setApiStatus('offline'));
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-badge">
            <Sparkles size={18} />
          </span>
          <span>MemeDeck</span>
        </div>

        <nav className="nav-tabs" aria-label="Main navigation">
          <button
            className={`nav-btn ${activeTab === 'discover' ? 'active' : ''}`}
            onClick={() => setActiveTab('discover')}
          >
            <Compass size={16} />
            Discover
          </button>
          <button
            className={`nav-btn ${activeTab === 'library' ? 'active' : ''}`}
            onClick={() => setActiveTab('library')}
          >
            <Library size={16} />
            My Library
          </button>
          <button
            className={`nav-btn ${activeTab === 'collections' ? 'active' : ''}`}
            onClick={() => setActiveTab('collections')}
          >
            <FolderHeart size={16} />
            Collections
          </button>
        </nav>

        <div className="status-pill" title="Fastify Backend Connection">
          <span
            className={`status-dot ${apiStatus === 'online' ? 'online' : apiStatus === 'offline' ? 'offline' : ''
              }`}
          />
          API: {apiStatus}
        </div>
      </header>
    </div>
  );
}

