
---
name: secure-auth
description: Audit, design, implement, and test secure authentication and authorization using Supabase Auth, Next.js, FastAPI, and PostgreSQL. Use whenever modifying login, registration, sessions, credentials, permissions, user data access, or authentication middleware.
---

# Secure Authentication Engineering

## Before implementation

- Inspect repository rules, architecture, dependencies, and existing auth flows.
- Read the official documentation for the installed framework and SDK versions.
- Identify the trust boundaries between browser, Next.js, FastAPI, and PostgreSQL.
- Confirm whether the application uses a BFF or direct API access.
- Never assume architecture or silently replace existing decisions.
- Present security-sensitive design decisions before implementing them.

## Authentication principles

- Use Supabase Auth as the identity provider.
- Do not build a custom password authentication system.
- Do not implement custom JWT issuance or signing.
- Never trust decoded but unverified tokens.
- Validate identity using a supported verification mechanism.
- Do not treat client-side user state as proof of identity.
- Use secure session handling and supported token refresh flows.
- Keep administrative credentials exclusively on trusted servers.

## Authorization principles

- Authenticate and authorize every protected API operation.
- Deny access by default.
- Enforce least privilege.
- Derive identity from verified credentials, not request-body user IDs.
- Verify resource ownership and tenant membership server-side.
- Never allow users to assign themselves privileged roles.
- Enforce PostgreSQL RLS where applicable.
- Never use a service-role client for ordinary user-scoped queries.
- Treat frontend route protection as a UX feature, not a security boundary.

## Session and application security

- Review cookie attributes, HTTPS, CSRF, XSS, CORS, and caching.
- Prevent session leakage through logs, URLs, analytics, or error messages.
- Handle expired, revoked, and refreshed credentials correctly.
- Review password recovery, email verification, logout, and session revocation.
- Apply rate limiting to sensitive endpoints.
- Avoid revealing whether an email address belongs to an account.
- Consider MFA for privileged accounts.

## Implementation workflow

1. Audit the current implementation.
2. Define the intended behavior and security boundaries.
3. Propose a small, reviewable implementation plan.
4. Implement one phase at a time.
5. Write tests for successful flows and adversarial cases.
6. Run existing tests, type checks, linting, and relevant security checks.
7. Review the diff for regressions, secrets, and authorization gaps.
8. Report what was verified, what failed, and what remains unresolved.

## Required security tests

- Missing, malformed, expired, and invalid credentials.
- Unauthorized and forbidden requests.
- Cross-user and cross-tenant access attempts.
- Privilege escalation attempts.
- Logout and refresh behavior.
- Password recovery and email verification.
- RLS enforcement.
- Cookie, CSRF, and CORS behavior where applicable.

Never claim the implementation is secure merely because the application runs or the tests pass. Report limitations and unverified assumptions explicitly.
