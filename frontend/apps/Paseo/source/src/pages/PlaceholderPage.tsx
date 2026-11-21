import { Link } from 'react-router-dom';

export function PlaceholderPage({ title, milestone, description }: { title: string; milestone: string; description: string }) {
  return <section className="container section placeholder"><div className="eyebrow eyebrow-dark">{milestone} / PLANNED MODULE</div><h1 className="page-title">{title}</h1><p className="page-lede">{description}</p><div className="notice" role="status"><strong>Frontend foundation only</strong><p>This module is a navigable placeholder. No server availability, reservation, administrative mutation, or payment operation is active.</p></div><Link className="text-link" to="/">← Back to home</Link></section>;
}
