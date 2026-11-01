import '@fontsource/cairo/arabic-400.css';
import '@fontsource/cairo/arabic-600.css';
import '@fontsource/cairo/arabic-700.css';
import '@fontsource/cairo/latin-400.css';
import '@fontsource/cairo/latin-600.css';
import '@fontsource/cairo/latin-700.css';
import './styles/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
