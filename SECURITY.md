# Security Policy
## Supported Versions
Security updates are provided for the **latest release**.
| Version | Supported |
| ------- | ------------------ |
| Latest Release | ✅ Yes |
| Older releases | ❌ No |
## Reporting a Vulnerability
**🛑 Please do NOT report security vulnerabilities through public GitHub Issues.**
If you believe you have found a security vulnerability:
1. **Contact me privately** by creating a new **Issue** and marking it with the `security` label.
2. Provide a clear description and steps to reproduce.
3. I will respond within **48 hours**.
### What to Expect
*   **If accepted:** I will work on a fix and release an update.
*   **If declined:** I will explain why.
## Security Considerations for This Project
This is a **client-side browser extension**. Its primary function is to send network requests (pings) to user-provided URLs. Reports related to the following are **within scope**:
*   Insecure input validation of user-provided URLs (e.g., allowing dangerous protocols like `file://`, `javascript:`).
*   Vulnerabilities that could lead to unintended network requests or SSRF-like behavior.
*   Permission misuse of the extension's browser APIs.
General web security issues not directly caused by this extension's code are **out of scope**.
