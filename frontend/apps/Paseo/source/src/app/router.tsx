import { createBrowserRouter, Link, Navigate } from 'react-router-dom';
import { SiteLayout } from '../components/layout/SiteLayout';
import { RouteErrorPage } from '../components/layout/RouteErrorPage';

// Each route imports its page only when visited. Keep the shared layout loaded once.
export const router = createBrowserRouter([
  {
    element: <SiteLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/', lazy: async () => ({ Component: (await import('../pages/HomePage')).HomePage }) },
      { path: '/courts', lazy: async () => ({ Component: (await import('../pages/CourtsPage')).CourtsPage }) },
      { path: '/courts/:courtId', lazy: async () => ({ Component: (await import('../pages/CourtDetailsPage')).CourtDetailsPage }) },
      { path: '/how-it-works', lazy: async () => ({ Component: (await import('../pages/HowItWorksPage')).HowItWorksPage }) },
      { path: '/book', lazy: async () => ({ Component: (await import('../pages/BookingPage')).BookingPage }) },
      { path: '/book/details', lazy: async () => ({ Component: (await import('../pages/CustomerDetailsPage')).CustomerDetailsPage }) },
      { path: '/book/review', lazy: async () => ({ Component: (await import('../pages/BookingReviewPage')).BookingReviewPage }) },
      { path: '/book/payment', lazy: async () => ({ Component: (await import('../pages/PaymentPage')).PaymentPage }) },
      { path: '/book/qr-payment', lazy: async () => ({ Component: (await import('../pages/GuestQrPaymentPage')).GuestQrPaymentPage }) },
      { path: '/reservation/receipt/:reservationId', lazy: async () => ({ Component: (await import('../pages/GuestReservationReceiptPage')).GuestReservationReceiptPage }) },
      { path: '/book/confirmation', lazy: async () => ({ Component: (await import('../pages/BookingStatusPage')).BookingStatusPage }) },
      { path: '/reservations', lazy: async () => ({ Component: (await import('../pages/ReservationsPage')).ReservationsPage }) },
      { path: '/admin/sign-in', lazy: async () => ({ Component: (await import('../pages/StagingAdminLoginPage')).StagingAdminLoginPage }) },
      { path: '/admin/live-reservations', lazy: async () => ({ Component: (await import('../pages/StagingAdminReservationsPage')).StagingAdminReservationsPage }) },
      { path: '/admin' , Component: () => <Navigate to="/admin/sign-in" replace /> },
      { path: '/admin/courts', Component: () => <Navigate to="/admin/sign-in" replace /> },
      { path: '/admin/calendar', Component: () => <Navigate to="/admin/sign-in" replace /> },
      { path: '/admin/bookings', Component: () => <Navigate to="/admin/sign-in" replace /> },
      { path: '/admin/pricing', Component: () => <Navigate to="/admin/sign-in" replace /> },
      { path: '/admin/payments', Component: () => <Navigate to="/admin/sign-in" replace /> },
      { path: '/admin/customers', Component: () => <Navigate to="/admin/sign-in" replace /> },
      { path: '/admin/settings', Component: () => <Navigate to="/admin/sign-in" replace /> },
      { path: '*', lazy: async () => ({
        Component: () => <div className="container section placeholder">
          <h1 className="page-title">Page not found.</h1>
          <p className="page-lede">The requested page does not exist.</p>
          <Link to="/">Return to home</Link>
        </div>,
      }) },
    ],
  },
], { basename: import.meta.env.BASE_URL });
