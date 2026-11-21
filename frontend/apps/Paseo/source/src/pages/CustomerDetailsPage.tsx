import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { useBookingDraft } from '../booking/BookingDraftContext';
import { BookingProgress } from '../components/booking/BookingProgress';
import { customerSchema, isValidScheduleChoice, type CustomerDetails } from '../booking/bookingDraft';
import { BookingSummary } from '../components/booking/BookingSummary';
import { MissingDraft } from '../components/booking/MissingDraft';

export function CustomerDetailsPage() {
  const navigate = useNavigate();
  const { schedule, customer, saveCustomer } = useBookingDraft();
  const { register, handleSubmit, formState: { errors } } = useForm<CustomerDetails>({
    resolver: zodResolver(customerSchema),
    defaultValues: customer ?? { fullName: '', email: '', phone: '' },
  });

  if (!isValidScheduleChoice(schedule)) {
    return <MissingDraft message="Choose a valid court and time before entering customer information." />;
  }

  function submitDetails(details: CustomerDetails) {
    saveCustomer(customerSchema.parse(details));
    navigate('/book/review');
  }

  return (
    <section className="container section booking-section">
      <div className="eyebrow eyebrow-dark">BOOKING / FE-04 CUSTOMER DETAILS</div>
      <h1 className="page-title">Your details.</h1>
      <p className="page-lede">Enter your contact information to review the booking. Your details are used to prepare the booking and are not submitted until you continue.</p>
      <BookingProgress stage="details" />
      <div className="demo-banner" role="note"><strong>Not a reservation</strong><p>No slot is held at this stage. The reservation service must validate and accept your submission before a receipt is issued.</p></div>
      <BookingSummary schedule={schedule} />
      <form className="booking-panel customer-form" onSubmit={handleSubmit(submitDetails)} noValidate>
        <div className="form-field">
          <label htmlFor="customer-name">Full name</label>
          <input id="customer-name" autoComplete="name" aria-invalid={!!errors.fullName}
            aria-describedby={errors.fullName ? 'name-error' : undefined} {...register('fullName')} />
          {errors.fullName && <p className="form-error" id="name-error" role="alert">{errors.fullName.message}</p>}
        </div>
        <div className="form-field">
          <label htmlFor="customer-email">Email address</label>
          <input id="customer-email" type="email" autoComplete="email" aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined} {...register('email')} />
          {errors.email && <p className="form-error" id="email-error" role="alert">{errors.email.message}</p>}
        </div>
        <div className="form-field">
          <label htmlFor="customer-phone">Phone number</label>
          <input id="customer-phone" type="tel" autoComplete="tel" aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? 'phone-error' : undefined} {...register('phone')} />
          {errors.phone && <p className="form-error" id="phone-error" role="alert">{errors.phone.message}</p>}
        </div>
        <div className="booking-actions">
          <Link className="button button-secondary" to="/book">Back to schedule</Link>
          <button className="button button-primary" type="submit">Review details</button>
        </div>
      </form>
    </section>
  );
}
