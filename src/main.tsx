// First import, deliberately: it installs the `Buffer` global that Midnight's
// SDK relies on. See the comment in polyfills.ts for what breaks without it.
import './polyfills';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element in index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
