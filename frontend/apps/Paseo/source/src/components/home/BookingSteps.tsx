const steps = [
  { title: 'Choose your court', detail: 'Explore three separately identified courts.' },
  { title: 'Pick a date and time', detail: 'Choose an available time and review approved prices.' },
  { title: 'Review and select payment', detail: 'Review the booking amount and confirmed payment instructions before transferring funds.' },
];

export function BookingSteps() {
  return (
    <section className="steps-section" aria-labelledby="booking-steps-title">
      <div className="container steps-inner">
        <div>
          <div className="eyebrow">02 / SIMPLE BY DESIGN</div>
          <h2 id="booking-steps-title">Less planning.<br /><em>More playing.</em></h2>
        </div>
        <ol className="steps-list">
          {steps.map((step, index) => (
            <li key={step.title}>
              <b aria-hidden="true">{String(index + 1).padStart(2, '0')}</b>
              <span><strong>{step.title}</strong><small>{step.detail}</small></span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
