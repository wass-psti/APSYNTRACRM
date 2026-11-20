import React from 'react';
import {createRoot} from 'react-dom/client';
import {AccessPreview} from './AccessPreview.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><AccessPreview/></React.StrictMode>
);
