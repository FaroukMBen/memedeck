import { useState } from 'react';
import {
  Compass,
  FolderHeart,
  Library,
  LogOut,
  Plus,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FeedbackProvider } from './context/FeedbackContext';
import { AuthModal } from './components/AuthModal';
import { UploadModal } from './components/UploadModal';
import { DiscoverView } from './components/DiscoverView';
import { LibraryView } from './components/LibraryView';
import { CollectionsView } from './components/CollectionsView';
import { CommunityView } from './components/CommunityView';
import { ProfileView } from './components/ProfileView';

type Tab = 'discover' | 'library' | 'collections' | 'community' | 'profile';

function AppContent() {
  const { user, username, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('discover');
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const handleNavigateToUser = (targetUserId: string) => {
    setProfileUserId(targetUserId);
    setActiveTab('profile');
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
            <path d="M10 9V4h15l4 4v15h-6" fill="none" stroke="currentColor" strokeWidth="2" />
            <path
              d="M3 9h16l4 4v16H3z"
              fill="var(--accent)"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path d="M8.5 25l9-12" fill="none" stroke="var(--on-accent)" strokeWidth="3" />
          </svg>
          <span className="brand-word" aria-label="MemeDeck">
            MEME<i aria-hidden="true">/</i>DECK
          </span>
        </div>

        <nav className="nav-tabs" aria-label="Main navigation">
          <button
            className={`nav-btn ${activeTab === 'discover' ? 'active' : ''}`}
            onClick={() => setActiveTab('discover')}
          >
            <Compass size={17} />
            <span className="nav-label">Discover</span>
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
            <Library size={17} />
            <span className="nav-label">My Library</span>
          </button>
          <button
            className={`nav-btn ${activeTab === 'collections' ? 'active' : ''}`}
            onClick={() => setActiveTab('collections')}
          >
            <FolderHeart size={17} />
            <span className="nav-label">Collections</span>
          </button>
          <button
            className={`nav-btn ${activeTab === 'community' ? 'active' : ''}`}
            onClick={() => setActiveTab('community')}
          >
            <Users size={17} />
            <span className="nav-label">Community</span>
          </button>
        </nav>

        <div className="nav-actions">
          {/* + Add Media to Library */}
          <button
            className="add-media-btn topbar-add-btn"
            onClick={() => {
              if (!user) {
                setIsAuthModalOpen(true);
              } else {
                setIsUploadModalOpen(true);
              }
            }}
            title="Add Media to Library"
            aria-label="Add Media to Library"
          >
            <Plus size={16} />
            <span className="add-media-label">Add Media</span>
          </button>

          {/* User Authentication state */}
          {user ? (
            <div
              className={`user-profile-badge clickable ${activeTab === 'profile' && profileUserId === user.id ? 'active' : ''
                }`}
              onClick={() => handleNavigateToUser(user.id)}
              title="View your Creator Profile"
            >
              <span className="user-avatar-circle">
                {(username?.[0] ?? 'U').toUpperCase()}
              </span>
              <span className="user-profile-name">{username}</span>
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

        {activeTab === 'community' && (
          <CommunityView
            onRequireAuth={() => setIsAuthModalOpen(true)}
            onNavigateToUser={handleNavigateToUser}
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
      <FeedbackProvider>
        <AppContent />
      </FeedbackProvider>
    </AuthProvider>
  );
}
