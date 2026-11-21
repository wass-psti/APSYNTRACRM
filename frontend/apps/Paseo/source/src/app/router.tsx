import { createBrowserRouter, Link } from 'react-router-dom';
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
      { path: '/admin', lazy: async () => ({ Component: (await import('../pages/AdminOverviewPage')).AdminOverviewPage }) },
      { path: '/admin/courts', lazy: async () => ({ Component: (await import('../pages/AdminCourtsPage')).AdminCourtsPage }) },
      { path: '/admin/calendar', lazy: async () => ({ Component: (await import('../pages/AdminCalendarPage')).AdminCalendarPage }) },
      { path: '/admin/bookings', lazy: async () => ({ Component: (await import('../pages/AdminBookingsPage')).AdminBookingsPage }) },
      { path: '/admin/pricing', lazy: async () => ({ Component: (await import('../pages/AdminPricingPage')).AdminPricingPage }) },
      { path: '/admin/payments', lazy: async () => ({ Component: (await import('../pages/AdminPaymentsPage')).AdminPaymentsPage }) },
      { path: '/admin/customers', lazy: async () => ({ Component: (await import('../pages/AdminCustomersPage')).AdminCustomersPage }) },
      { path: '/admin/settings', lazy: async () => ({ Component: (await import('../pages/AdminSettingsPage')).AdminSettingsPage }) },
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
