/**
 * The previous server-side embed probe fetched a user-supplied URL and followed
 * redirects. That was an SSRF risk, and a successful header read still does not
 * prove a browser will allow the iframe. The probe is intentionally gone.
 * Use planEmbed() and the real frame instead.
 */
export { planEmbed } from "./embed-policy.ts";
