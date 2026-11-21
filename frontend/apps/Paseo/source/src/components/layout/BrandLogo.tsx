import logo from '../../assets/branding/lomboy-peaks-logo.jpg';

interface BrandLogoProps {
  variant?: 'header' | 'footer';
}

/** The supplied Lomboy Peaks artwork, reused without recreating or modifying it. */
export function BrandLogo({ variant = 'header' }: BrandLogoProps) {
  return (
    <span className={`brand-logo brand-logo--${variant}`}>
      <img src={logo} alt="" loading={variant === 'footer' ? 'lazy' : 'eager'} decoding="async" />
    </span>
  );
}
