import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { preloadDiceTextures } from './utils/diceTextures.js';

// Preload 3D dice textures immediately on app initialization
preloadDiceTextures();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
