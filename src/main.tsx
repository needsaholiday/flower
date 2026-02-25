import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Reset default styles
const style = document.createElement('style');
style.textContent = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body, #root { height: 100%; width: 100%; overflow: hidden; }
  body { background: #11111b; color: #cdd6f4; }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #45475a; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #585b70; }

  /* ReactFlow overrides for dark theme */
  .react-flow__controls button {
    background: #1e1e2e !important;
    border-color: #45475a !important;
    color: #cdd6f4 !important;
    fill: #cdd6f4 !important;
  }
  .react-flow__controls button:hover {
    background: #313244 !important;
  }
  .react-flow__controls button svg {
    fill: #cdd6f4 !important;
  }
`;
document.head.appendChild(style);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
