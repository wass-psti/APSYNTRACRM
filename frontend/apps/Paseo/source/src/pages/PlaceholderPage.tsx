import { Link } from 'react-router-dom';

export function PlaceholderPage({ title, milestone, description }: { title: string; milestone: string; description: string }) {
  return <section className="container section placeholder"><div className="eyebrow eyebrow-dark">{milestone} / PLANNED MODULE</div><h1 className="page-title">{title}</h1><p className="page-lede">{description}</p><div className="notice" role="status"><strong>This feature is coming soon</strong><p>This feature is not available yet. No bookings or payments can be completed here.</p></div><Link className="text-link" to="/">← Back to home</Link></section>;
}
