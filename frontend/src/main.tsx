import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './shell.css';
import './identity.css';
import './profile.css';
import './library.css';
import './features.css';
import './themes/volt.css';
import { applyTheme } from './lib/theme';

applyTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

