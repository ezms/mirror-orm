# Security Policy

## Supported Versions

Only the latest minor release receives security fixes.

| Version | Supported |
| ------- | --------- |
| 1.0.x   | ✅        |
| < 1.0   | ❌        |

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Use [GitHub Private Vulnerability Reporting](https://github.com/mirror-community/mirror-orm/security/advisories/new) to submit a report confidentially.

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a minimal proof of concept
- The affected version(s)

## Response SLA

| Stage              | Target     |
| ------------------ | ---------- |
| Acknowledgement    | 72 hours   |
| Status update      | 14 days    |
| Patch release      | 30 days    |

These are best-effort targets for a solo-maintained project.

## Disclosure Policy

Once a fix is released, a [GitHub Security Advisory](https://github.com/mirror-community/mirror-orm/security/advisories) will be published with full details. Please allow the patch to be available before any public disclosure.

## Scope

Vulnerabilities that are in scope:

- SQL injection via query builder APIs
- Prototype pollution in query arguments or hydration
- Credential or connection string exposure
- Unsafe handling of user-supplied column/table names

## Credits

Reporters who responsibly disclose a valid vulnerability will be credited in the security advisory, unless they prefer to remain anonymous.

## Out of scope (not eligible for credit):

- Vulnerabilities in database engines themselves
- Issues requiring direct access to the host machine or database server
- Dependency vulnerabilities with no practical impact path through this package's public API
