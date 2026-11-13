import { useEffect, useState } from 'react';
import {
  Compass,
  FolderHeart,
  Library,
  LogOut,
  Plus,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
import { memedeckApi } from './lib/api';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthModal } from './components/AuthModal';
import { UploadModal } from './components/UploadModal';
import { DiscoverView } from './components/DiscoverView';
import { LibraryView } from './components/LibraryView';
import { CollectionsView } from './components/CollectionsView';
import { ProfileView } from './components/ProfileView';

type Tab = 'discover' | 'library' | 'collections' | 'profile';

function AppContent() {
  const { user, username, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('discover');
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  useEffect(() => {
    memedeckApi
      .health()
      .then(() => setApiStatus('online'))
      .catch(() => setApiStatus('offline'));
  }, []);

  const handleNavigateToUser = (targetUserId: string) => {
    setProfileUserId(targetUserId);
    setActiveTab('profile');
  };

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
            onClick={() => {
              if (!user) {
                setIsAuthModalOpen(true);
              } else {
                setActiveTab('library');
              }
            }}
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

        <div className="nav-actions">
          {/* + Add Media to Library */}
          <button
            className="add-media-btn"
            onClick={() => {
              if (!user) {
                setIsAuthModalOpen(true);
              } else {
                setIsUploadModalOpen(true);
              }
            }}
            title="Add Media to Library"
          >
            <Plus size={16} />
            <span>Add Media</span>
          </button>

          {/* User Authentication state */}
          {user ? (
            <div
              className={`user-profile-badge clickable ${
                activeTab === 'profile' && profileUserId === user.id ? 'active' : ''
              }`}
              onClick={() => handleNavigateToUser(user.id)}
              title="View your Creator Profile"
            >
              <span className="user-avatar-circle">
                {(username?.[0] ?? 'U').toUpperCase()}
              </span>
              <span>{username}</span>
              <button
                className="signout-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  signOut();
                }}
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <button
              className="connect-btn"
              onClick={() => setIsAuthModalOpen(true)}
            >
              <UserIcon size={15} />
              <span>Connect</span>
            </button>
          )}

          {/* Backend Status indicator */}
          <div className="status-pill" title="Fastify Backend Connection">
            <span
              className={`status-dot ${
                apiStatus === 'online'
                  ? 'online'
                  : apiStatus === 'offline'
                  ? 'offline'
                  : ''
              }`}
            />
            API: {apiStatus}
          </div>
        </div>
      </header>

      <main className="main-content">
        {activeTab === 'discover' && (
          <DiscoverView
            onRequireAuth={() => setIsAuthModalOpen(true)}
            onOpenUpload={() => {
              if (!user) {
                setIsAuthModalOpen(true);
              } else {
                setIsUploadModalOpen(true);
              }
            }}
            onNavigateToUser={handleNavigateToUser}
          />
        )}

        {activeTab === 'library' && (
          <LibraryView
            onRequireAuth={() => setIsAuthModalOpen(true)}
            onOpenUpload={() => {
              if (!user) {
                setIsAuthModalOpen(true);
              } else {
                setIsUploadModalOpen(true);
              }
            }}
          />
        )}

        {activeTab === 'collections' && (
          <CollectionsView
            onRequireAuth={() => setIsAuthModalOpen(true)}
          />
        )}

        {activeTab === 'profile' && profileUserId && (
          <ProfileView
            userId={profileUserId}
            onRequireAuth={() => setIsAuthModalOpen(true)}
            onNavigateToUser={handleNavigateToUser}
          />
        )}
      </main>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      {/* Upload Media Modal */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onRequireAuth={() => setIsAuthModalOpen(true)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
