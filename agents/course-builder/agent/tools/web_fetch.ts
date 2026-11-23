// eve's built-in web_fetch, re-enabled (the agent sets `defaultTools: false`). It is SSRF-safe on
// its own: https only, every destination (and each of up to 10 redirects) checked against
// private/loopback/link-local/reserved addresses, the address re-checked at connect time, 5 MB cap.
export { default } from "eve/tools/web_fetch";
