import { Link } from 'react-router-dom';

export function MissingDraft({ message }: { message: string }) {
  return (
    <section className="container section placeholder">
      <h1 className="page-title">Start with a court and time.</h1>
      <p className="page-lede">{message} No reservation has been created.</p>
      <Link className="button button-primary" to="/book">Return to scheduling</Link>
    </section>
  );
}
