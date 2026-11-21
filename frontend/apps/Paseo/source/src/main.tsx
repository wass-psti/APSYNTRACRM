import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { MotionProvider } from './motion/MotionProvider';
import './styles/index.css';
import './styles/fe02.css';
import './styles/fe03.css';
import './styles/fe04.css';
import './styles/fe05.css';
import './styles/fe06.css';
import './styles/fe07.css';
import './styles/fe08.css';
import './styles/fe09.css';
import './styles/brand-logo.css';
import './design-system/tokens.css';
import './design-system/motion.css';
import './styles/fe-imm-02.css';
import './styles/fe-imm-03.css';
import './styles/fe-imm-04.css';
import './styles/fe-imm-05.css';
import './styles/fe-imm-06.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionProvider><RouterProvider router={router} /></MotionProvider>
  </React.StrictMode>,
);

import './styles/guest-reservations.css';
import './styles/pdl-live-admin.css';
import './styles/pdl-admin-session-skeleton.css';
import './styles/pdl-courts-ui.css';
import './styles/pdl-how-it-works.css';
import './styles/pdl-reservations-ui.css';
import './styles/pdl-booking-ui.css';
import './styles/pdl-app-ui.css';
import './styles/pdl-admin-signin-ui.css';
