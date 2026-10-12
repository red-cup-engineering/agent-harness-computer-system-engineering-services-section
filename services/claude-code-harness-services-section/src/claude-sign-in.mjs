/**
 * A Claude Code session's own sign-in at a node's MetroPlat MCP face.
 *
 * An account is never a bearer: it is an organ of the character it signs in for (note on the two
 * bodies, "A sign-in is a hand"). The harness character's `metroplat` organ names the account and
 * the username; the password is a credential of the host's store. This module drives the node's own
 * password sign-in and authorization-code (S256 PKCE) flow, with no browser, so the token it ends
 * with carries the principal `password:<sha256(subject)>` the organ records as the account, and
 * not the founder's sign-in and not the node's machine client.
 *
 * Nothing here imports a package: the flow takes the network (`fetchImpl`), the clock and the
 * runtime directory from its caller, so it runs under test against a stand-in node. The one record
 * it writes is the access-token cache, under the user's runtime directory (mode 0600), never in a
 * repository or in ~/.config.
 */
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const PASSWORD_LOGIN_PATH = "/login/password";
const CALLBACK_PATH = "/oauth/harness-callback";
const CACHE_DIRECTORY = "claude-metroplat-sign-in";
const REFRESH_MARGIN_MS = 60_000;

const sha256Hex = (text) => createHash("sha256").update(text).digest("hex");
const base64Url = (bytes) => Buffer.from(bytes).toString("base64url");

/** The account a username signs in as: the enterprise host's `password:<sha256hex("password:<username>")>`. */
export const accountOfUsername = (username) => `password:${sha256Hex(`password:${String(username).trim().toLowerCase()}`)}`;

/** The KEY=VALUE pairs of a credentials env file (unquoted, or wrapped in one pair of quotes). */
export function parseEnvironmentFile(text) {
  const values = {};
  for (const line of String(text).split(/\r?\n/u)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(line);
    if (match === null) continue;
    let value = match[2].trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

/**
 * The sign-in a harness character wears at MetroPlat: the `metroplat` organ whose account is a password
 * principal (`password:<sha256>`; the character's other metroplat hands are agents and feeds) and whose
 * `of` names the character, by id or by name. The username is checked against the organ's account, so a record
 * that names a username its account is not the hand of is refused.
 *
 * @param {Iterable<{ of?: string[], platform?: string, account?: string, authored?: { username?: string } }>} organs
 * @param {{ id: string, name?: string }} character
 * @param {{ resolveCharacter?: (of: string, organ: object) => (string | undefined) }} [options]
 */
export function signInOf(organs, character, { resolveCharacter = () => undefined } = {}) {
  const found = [...organs].filter((organ) => organ.platform === "metroplat" && /^password:[0-9a-f]{64}$/u.test(organ.account ?? "")
    && (organ.of ?? []).some((of) => of === character.id || of === character.name || resolveCharacter(of, organ) === character.id));
  if (found.length === 0) throw new Error(`no metroplat sign-in organ is of ${character.name ?? character.id}`);
  if (found.length > 1) throw new Error(`${found.length} metroplat sign-in organs are of ${character.name ?? character.id}`);
  const [organ] = found;
  const username = organ.authored?.username ?? organ.username;
  if (typeof username !== "string" || username === "") throw new Error(`the sign-in organ ${organ.id ?? organ.account} names no username`);
  if (accountOfUsername(username) !== organ.account) throw new Error(`the username of the sign-in organ ${organ.id ?? organ.account} does not hash to its account`);
  return Object.freeze({ username: username.trim().toLowerCase(), account: organ.account, organ: organ.id });
}

/** A PKCE verifier and its S256 challenge (RFC 7636). */
export function pkcePair(random = randomBytes) {
  const verifier = base64Url(random(48));
  return { verifier, challenge: base64Url(createHash("sha256").update(verifier).digest()) };
}

/** A minimal cookie jar: the name=value of every Set-Cookie a response set, kept by name. */
function cookieJar() {
  const cookies = new Map();
  return Object.freeze({
    take(response) {
      for (const line of response.headers.getSetCookie?.() ?? []) {
        const [pair, ...attributes] = line.split(";");
        const at = pair.indexOf("=");
        if (at < 1) continue;
        const name = pair.slice(0, at).trim(), value = pair.slice(at + 1).trim();
        const expired = attributes.some((a) => /^\s*max-age=0\s*$/iu.test(a)) || value === "";
        if (expired) cookies.delete(name); else cookies.set(name, value);
      }
    },
    header: () => [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
  });
}

/** The CSRF token a sign-in form carries. */
export function csrfOf(html) {
  const match = /<input[^>]*name="csrf"[^>]*value="([^"]+)"/u.exec(html) ?? /<input[^>]*value="([^"]+)"[^>]*name="csrf"/u.exec(html);
  if (match === null) throw new Error("the sign-in form carries no csrf token");
  return match[1];
}

async function json(response, what) {
  if (!response.ok) throw new Error(`${what} answered ${response.status}`);
  return response.json();
}

/**
 * Sign in with the character's own password and obtain an access token for the node's MCP resource.
 * The authorization request names the issuer's own origin as its return address, which the
 * authorization server grants without a consent page (the site's own interface); the code is read
 * from that redirect and never followed.
 *
 * @param {{ mcpUrl: string, username: string, password: string, clientId?: string, fetchImpl?: typeof fetch, random?: typeof randomBytes, clientName?: string }} input
 * @returns {Promise<{ accessToken: string, expiresInSeconds: number, clientId: string }>}
 */
export async function signInForToken({ mcpUrl, username, password, clientId, fetchImpl = fetch, random = randomBytes, clientName = "Claude Code harness" }) {
  const origin = new URL(mcpUrl).origin;
  const at = (pathname) => new URL(pathname, origin).href;
  const request = (url, init = {}) => fetchImpl(url, { redirect: "manual", ...init });

  const metadata = await json(await request(at("/.well-known/oauth-authorization-server")), "authorization server metadata");
  const issuer = String(metadata.issuer ?? "").replace(/\/$/u, "");
  if (issuer === "") throw new Error("authorization server metadata names no issuer");
  // The endpoints are this origin's own: a node reached at its bind address declares its public one.
  const endpoint = (declared, fallback) => at(declared === undefined ? fallback : new URL(declared).pathname);
  const protectedResource = await request(at("/.well-known/oauth-protected-resource/mcp")).then((r) => (r.ok ? r.json() : {}), () => ({}));
  const resource = typeof protectedResource.resource === "string" ? protectedResource.resource : `${issuer}/mcp`;

  const redirectUri = `${issuer}${CALLBACK_PATH}`;
  let client = clientId;
  if (client === undefined) {
    const registered = await json(await request(endpoint(metadata.registration_endpoint, "/oauth/register"), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: clientName, redirect_uris: [redirectUri], token_endpoint_auth_method: "none", grant_types: ["authorization_code"], response_types: ["code"] }),
    }), "client registration");
    client = registered.client_id;
    if (typeof client !== "string") throw new Error("client registration returned no client_id");
  }

  const { verifier, challenge } = pkcePair(random);
  const state = base64Url(random(18));
  const authorize = new URL(endpoint(metadata.authorization_endpoint, "/oauth/authorize"));
  for (const [name, value] of Object.entries({ response_type: "code", client_id: client, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: "S256", resource, state })) authorize.searchParams.set(name, value);
  const returnTo = `${authorize.pathname}${authorize.search}`;

  const jar = cookieJar();
  const form = await request(`${at(PASSWORD_LOGIN_PATH)}?return_to=${encodeURIComponent(returnTo)}`);
  if (!form.ok) throw new Error(`the password sign-in form answered ${form.status}`);
  jar.take(form);
  const csrf = csrfOf(await form.text());
  const signedIn = await request(at(PASSWORD_LOGIN_PATH), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar.header() },
    body: new URLSearchParams({ csrf, return_to: returnTo, username, password }).toString(),
  });
  jar.take(signedIn);
  if (signedIn.status !== 303) throw new Error(`the password sign-in was refused (${signedIn.status})`);

  const granted = await request(authorize.href, { headers: { cookie: jar.header() } });
  const location = granted.headers.get("location");
  if (granted.status !== 302 || location === null) throw new Error(`the authorization request answered ${granted.status} where a redirect with a code was expected`);
  const returned = new URL(location, authorize.href);
  if (returned.searchParams.get("error") !== null) throw new Error(`the authorization request was refused: ${returned.searchParams.get("error")}`);
  if (`${returned.origin}${returned.pathname}` !== redirectUri) throw new Error("the authorization request returned somewhere other than the registered address");
  if (returned.searchParams.get("state") !== state) throw new Error("the authorization response carries another state");
  const code = returned.searchParams.get("code");
  if (code === null) throw new Error("the authorization response carries no code");

  const token = await json(await request(endpoint(metadata.token_endpoint, "/oauth/token"), {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: client, redirect_uri: redirectUri, resource }).toString(),
  }), "the token endpoint");
  if (typeof token.access_token !== "string") throw new Error("the token response carries no access_token");
  return { accessToken: token.access_token, expiresInSeconds: Number.isFinite(token.expires_in) ? token.expires_in : 3600, clientId: client };
}

/**
 * Access tokens kept under the user's runtime directory until they expire. One file per (node,
 * holder), mode 0600 in a 0700 directory; a missing, unreadable or expired record is no record.
 */
export function tokenCache({ runtimeDirectory, now = Date.now }) {
  if (typeof runtimeDirectory !== "string" || runtimeDirectory === "") throw new Error("XDG_RUNTIME_DIR is unset: the access token has nowhere to be kept");
  const directory = path.join(runtimeDirectory, CACHE_DIRECTORY);
  const fileOf = (mcpUrl, holder) => path.join(directory, `${sha256Hex(`${mcpUrl}\n${holder}`).slice(0, 32)}.json`);
  return Object.freeze({
    fileOf,
    read(mcpUrl, holder) {
      try {
        const record = JSON.parse(readFileSync(fileOf(mcpUrl, holder), "utf8"));
        return typeof record.accessToken === "string" && Number.isFinite(record.expiresAt) && record.expiresAt - REFRESH_MARGIN_MS > now() ? record : undefined;
      } catch { return undefined; }
    },
    /** The client this holder registered at the node, kept so a sign-in does not register another each time. */
    clientOf(mcpUrl, holder) {
      try { const record = JSON.parse(readFileSync(fileOf(mcpUrl, holder), "utf8")); return typeof record.clientId === "string" ? record.clientId : undefined; } catch { return undefined; }
    },
    write(mcpUrl, holder, { accessToken, expiresInSeconds, clientId }) {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      chmodSync(directory, 0o700);
      const file = fileOf(mcpUrl, holder), staging = `${file}.${process.pid}.tmp`;
      writeFileSync(staging, `${JSON.stringify({ accessToken, clientId, expiresAt: now() + expiresInSeconds * 1000 })}\n`, { mode: 0o600 });
      chmodSync(staging, 0o600);
      renameSync(staging, file);
    },
  });
}

/** The header object Claude Code's `headersHelper` prints for a token (and the session that holds it). */
export function authorizationHeaders(accessToken, sessionId) {
  return { Authorization: `Bearer ${accessToken}`, ...(sessionId ? { "X-Harness-Session": sessionId } : {}) };
}

/**
 * The headers for a session: the cached token while it lives, else a fresh sign-in (kept in the cache).
 * `holder` names who the token is kept for (the harness character); `username` and `password` are
 * read only when a sign-in is needed, so a live token answers without reading the agency records.
 *
 * @param {{ mcpUrl: string, holder: string, username: () => string | Promise<string>, password: () => string | Promise<string>, cache: ReturnType<typeof tokenCache>, sessionId?: string, fetchImpl?: typeof fetch }} input
 */
export async function headersFor({ mcpUrl, holder, username, password, cache, sessionId, fetchImpl }) {
  const cached = cache.read(mcpUrl, holder);
  if (cached !== undefined) return authorizationHeaders(cached.accessToken, sessionId);
  const name = await username(), secret = await password();
  // A client the node no longer knows is registered again, once.
  const known = cache.clientOf(mcpUrl, holder);
  const signedIn = await signInForToken({ mcpUrl, username: name, password: secret, clientId: known, fetchImpl })
    .catch((error) => { if (known === undefined) throw error; return signInForToken({ mcpUrl, username: name, password: secret, fetchImpl }); });
  cache.write(mcpUrl, holder, signedIn);
  return authorizationHeaders(signedIn.accessToken, sessionId);
}
