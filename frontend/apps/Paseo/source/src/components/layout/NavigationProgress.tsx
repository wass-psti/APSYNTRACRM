import { useNavigation } from 'react-router-dom';

// React Router retains the previous page while a lazy route loads.
// Keep users informed without blocking keyboard or screen-reader navigation.
export function NavigationProgress() {
  const navigation = useNavigation();
  if (navigation.state === 'idle') return null;
  return <p className="navigation-progress" role="status" aria-live="polite">Loading page…</p>;
}
