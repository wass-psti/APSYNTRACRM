import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';

// A route failure never implies that a booking or payment succeeded.
export function RouteErrorPage() {
  const error = useRouteError();
  const isNotFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <main className="container section" role="main">
      <h1 className="page-title" tabIndex={-1}>{isNotFound ? 'Page not found.' : 'This page could not be loaded.'}</h1>
      <p className="page-lede">
        {isNotFound
          ? 'The requested page does not exist.'
          : 'The page encountered a temporary problem. No booking or payment confirmation can be inferred from this error.'}
      </p>
      <Link className="button button-primary" to="/">Return to home</Link>
    </main>
  );
}
