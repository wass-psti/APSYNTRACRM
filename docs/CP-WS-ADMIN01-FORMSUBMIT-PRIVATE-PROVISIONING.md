# APSYNTRA CRM — Administrator-Controlled Account Requests

## Architecture
FormSubmit.co request → manual administrator review → private local TypeScript provisioner → official Supabase Auth Admin API → protected PostgreSQL approval ticket → employee profile and private Main Workspace → centralized User Role Management.

FormSubmit is only a request mailbox. It never creates Auth accounts, assigns roles, receives passwords, or invokes the private provisioning process.

## FormSubmit setup (pending recipient selection)
The request form collects only full name, email and privacy consent. Native POST retains FormSubmit's default CAPTCHA and provider acknowledgment; a honeypot rejects basic spam. The CSP permits posts only to formsubmit.co.

The public configuration in frontend/request-access.js intentionally leaves FORM_SUBMIT_RECIPIENT_ALIAS blank until the administrator confirms a real FormSubmit.co recipient. This is an 8–128 character opaque alias; public endpoints are visible, so never use a privileged credential as the alias. The site disables the request submit button until configured. The alias requires initial recipient email verification by FormSubmit. Do not infer the recipient from existing provider identities.

FormSubmit handles personally identifying name and email data and reports 30-day submission retention. Its privacy, reliability and data-processing terms must be accepted before production use. Never request documents, passwords, tokens or sensitive data.

Official documentation: https://formsubmit.co/documentation
Privacy notice: https://formsubmit.co/privacy.pdf

## Private TypeScript provisioner
The script, compiled output and pinned dependencies are installed only at:
~/.apsyntra-private/apsyntra-crm-provisioner/

It is outside the public APSYNTRA CRM repository and outside GitHub Pages. The folder has owner-only permissions. Supabase privileged credentials must be supplied by the local operator's trusted process environment, never by GitHub, ChatGPT, CLI arguments or browser code.

The official Supabase JS SDK creates approved users. Account creation requires an interactive local terminal, a reviewed email, an explicit verification attestation, and a typed confirmation. The script uses crypto-generated one-use approval proof and temporary password; a service-role-only RPC stages the hashed proof for ten minutes and the Auth insert trigger atomically consumes it. No role or workspace claims are accepted from prospective users.

No automatic retry occurs on an uncertain createUser outcome. The operator must inspect actual Supabase users and the approval record. The temporary password is shown only once locally for secure out-of-band handoff and never sent via FormSubmit or logged to disk.

Local commands: npm run check, npm run build, npm run test. Provisioning requires npm run provision -- --execute and a private SUPABASE_SERVICE_ROLE_KEY environment variable.

## Migration and release gates
The additive candidate sql/cp-ws-admin01-private-approved-provisioning-candidate.sql is staged only. It requires separate authorization before production Auth/permission modifications. Public signup remains denied; the current live private signup flag remains false.

Approved user creation yields employee platform role and an independent Main Workspace, with no board/application grants. Existing users and bootstrap administrators are untouched. Centralized Role Management continues to control access. Auth email confirmation and signed security remain authoritative.

Acceptance requires disposable PostgreSQL 17 denial tests, confirmed FormSubmit recipient and delivery, private CLI SDK tests, then an explicitly authorized live approved user and cross-workspace denial. No real users were created during implementation.
