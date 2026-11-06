import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { WitnessPage } from './witness/WitnessPage';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const path = window.location.pathname.replace(/\/+$/, '');
const witness = path === '/witness' || path.endsWith('/witness');

createRoot(root).render(<StrictMode>{witness ? <WitnessPage /> : <App />}</StrictMode>);
