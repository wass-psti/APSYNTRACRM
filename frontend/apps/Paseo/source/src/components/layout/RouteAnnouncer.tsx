import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

// Announce internal page changes and move keyboard focus to the new heading.
export function RouteAnnouncer() {
  const location = useLocation();
  const [announcement, setAnnouncement] = useState('');
  const previousPath = useRef(location.pathname);

  useEffect(() => {
    const heading = document.querySelector<HTMLElement>('#main h1');
    const headingText = heading?.textContent?.trim() ?? 'Page loaded';
    document.title = `${headingText} | Paseo de Lomboy`;
    setAnnouncement(headingText);
    // React StrictMode may rerun mount effects: never steal initial keyboard focus.
    if (previousPath.current === location.pathname) return;
    previousPath.current = location.pathname;
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>;
}
