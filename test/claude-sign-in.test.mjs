import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  accountOfUsername, authorizationHeaders, csrfOf, headersFor, parseEnvironmentFile, pkcePair, signInForToken, signInOf, tokenCache,
} from "../services/claude-code-harness-services-section/src/claude-sign-in.mjs";

const CHARACTER = { id: "actor:bZH6KBOlPVWbYpqp04izN_Xtwykn0XgsMBStm_FkPPw", name: "bare-cedar-fog-claude" };
const organ = (over = {}) => ({ id: "claude-sign-in", of: [CHARACTER.id], platform: "metroplat", account: accountOfUsername("emsenn.claude"), authored: { username: "emsenn.claude" }, ...over });

test("a username signs in as the enterprise host's password account", () => {
  assert.equal(accountOfUsername("emsenn.claude"), "password:4a74e335cbac905bc40d9202c51b10ffba43a8a7ded5c95cd14d812b9155c06a");
  assert.equal(accountOfUsername(" Emsenn.Claude "), accountOfUsername("emsenn.claude"));
});

test("a credentials env file reads unquoted and quoted values", () => {
  assert.deepEqual(parseEnvironmentFile("A=plain\nexport B='two words'\n# c\nC=\"q=1\"\n"), { A: "plain", B: "two words", C: "q=1" });
});

test("the sign-in of a character is its metroplat password organ, by id or by name", () => {
  const feed = organ({ id: "feed", account: "bare-cedar-fog-claude-services-section:session-frictions", authored: {} });
  const hand = organ({ id: "model-hand", account: "agent:claude-opus-5-5", authored: {} });
  assert.deepEqual(signInOf([feed, organ(), hand], CHARACTER), { username: "emsenn.claude", account: accountOfUsername("emsenn.claude"), organ: "claude-sign-in" });
  assert.equal(signInOf([organ({ of: [CHARACTER.name] })], CHARACTER).username, "emsenn.claude");
  assert.equal(signInOf([organ({ of: ["alias"] })], CHARACTER, { resolveCharacter: (of) => (of === "alias" ? CHARACTER.id : undefined) }).username, "emsenn.claude");
});

test("a character with no sign-in, another's sign-in, or two sign-ins has none to use", () => {
  assert.throws(() => signInOf([], CHARACTER), /no metroplat sign-in organ/u);
  assert.throws(() => signInOf([organ({ of: ["someone-else"] })], CHARACTER), /no metroplat sign-in organ/u);
  assert.throws(() => signInOf([organ(), organ({ id: "second" })], CHARACTER), /2 metroplat sign-in organs/u);
});

test("a username that does not hash to the organ's account is refused", () => {
  assert.throws(() => signInOf([organ({ authored: { username: "someone.else" } })], CHARACTER), /does not hash to its account/u);
  assert.throws(() => signInOf([organ({ authored: {} })], CHARACTER), /names no username/u);
});

test("a PKCE pair is an S256 challenge of its verifier", () => {
  const { verifier, challenge } = pkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/u);
  assert.equal(challenge, createHash("sha256").update(verifier).digest("base64url"));
});

test("the csrf token is read from the sign-in form in either attribute order", () => {
  assert.equal(csrfOf('<form><input type="hidden" name="csrf" value="abc_-1"><input name="x"></form>'), "abc_-1");
  assert.equal(csrfOf('<input value="zz9" type="hidden" name="csrf">'), "zz9");
  assert.throws(() => csrfOf("<form></form>"), /no csrf token/u);
});

/** A stand-in node: the authorization server's endpoints and the password sign-in, as they answer a client. */
function standInNode({ username = "emsenn.claude", password = "correct horse", publicOrigin = "https://node.example" } = {}) {
  const state = { registered: new Map(), codes: new Map(), formCsrf: new Set(), sessions: new Set(), tokens: [], registrations: 0 };
  const cookies = (req) => Object.fromEntries((req.headers.cookie ?? "").split(/;\s*/u).filter(Boolean).map((c) => [c.slice(0, c.indexOf("=")), c.slice(c.indexOf("=") + 1)]));
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://stand-in");
    const body = await new Promise((resolve) => { const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => resolve(Buffer.concat(chunks).toString())); });
    const send = (status, headers, text = "") => { res.writeHead(status, headers); res.end(text); };
    const json = (status, value) => send(status, { "content-type": "application/json" }, JSON.stringify(value));
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      // The node declares its public origin, as a node reached at its bind address does.
      return json(200, { issuer: publicOrigin, authorization_endpoint: `${publicOrigin}/oauth/authorize`, token_endpoint: `${publicOrigin}/oauth/token`, registration_endpoint: `${publicOrigin}/oauth/register` });
    }
    if (url.pathname === "/.well-known/oauth-protected-resource/mcp") return json(200, { resource: `${publicOrigin}/mcp` });
    if (url.pathname === "/oauth/register") {
      const request = JSON.parse(body);
      assert.deepEqual(request.redirect_uris.map((u) => new URL(u).origin), [publicOrigin]);
      state.registrations += 1;
      const client = { client_id: `client_${state.registrations}`, redirect_uris: request.redirect_uris };
      state.registered.set(client.client_id, client);
      return json(201, client);
    }
    if (url.pathname === "/login/password" && req.method === "GET") {
      const csrf = `csrf-${state.formCsrf.size}`;
      state.formCsrf.add(csrf);
      return send(200, { "content-type": "text/html", "set-cookie": [`form=${csrf}; Path=/; HttpOnly; Secure`] }, `<form method="post"><input type="hidden" name="csrf" value="${csrf}"></form>`);
    }
    if (url.pathname === "/login/password" && req.method === "POST") {
      const form = new URLSearchParams(body);
      if (cookies(req).form !== form.get("csrf") || !state.formCsrf.has(form.get("csrf"))) return send(403, {});
      if (form.get("username") !== username || form.get("password") !== password) return send(401, {});
      state.sessions.add(`session-${state.sessions.size}`);
      return send(303, { location: form.get("return_to"), "set-cookie": [`session=session-${state.sessions.size - 1}; Path=/`, "form=; Max-Age=0; Path=/"] });
    }
    if (url.pathname === "/oauth/authorize") {
      if (!state.sessions.has(cookies(req).session)) return send(302, { location: `/sign-in?return_to=${encodeURIComponent(url.pathname + url.search)}` });
      const client = state.registered.get(url.searchParams.get("client_id"));
      assert.ok(client, "the client is registered");
      assert.equal(url.searchParams.get("code_challenge_method"), "S256");
      assert.equal(url.searchParams.get("redirect_uri"), client.redirect_uris[0]);
      assert.equal(url.searchParams.get("resource"), `${publicOrigin}/mcp`);
      const code = `code-${state.codes.size}`;
      state.codes.set(code, { challenge: url.searchParams.get("code_challenge"), client: client.client_id, redirectUri: client.redirect_uris[0] });
      const back = new URL(client.redirect_uris[0]);
      back.searchParams.set("code", code); back.searchParams.set("state", url.searchParams.get("state"));
      return send(302, { location: back.href });
    }
    if (url.pathname === "/oauth/token") {
      const form = new URLSearchParams(body);
      const code = state.codes.get(form.get("code"));
      state.codes.delete(form.get("code"));
      if (!code || code.client !== form.get("client_id") || code.redirectUri !== form.get("redirect_uri")) return json(400, { error: "invalid_grant" });
      if (createHash("sha256").update(form.get("code_verifier")).digest("base64url") !== code.challenge) return json(400, { error: "invalid_grant" });
      const access_token = `token-${state.tokens.length}`;
      state.tokens.push(access_token);
      return json(200, { access_token, token_type: "Bearer", expires_in: 3600 });
    }
    return send(404, {});
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ state, origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

test("the flow signs in with the password and trades the code for a token at the origin it reached", async (t) => {
  const node = await standInNode();
  t.after(node.close);
  const signedIn = await signInForToken({ mcpUrl: `${node.origin}/mcp`, username: "emsenn.claude", password: "correct horse" });
  assert.equal(signedIn.accessToken, "token-0");
  assert.equal(signedIn.expiresInSeconds, 3600);
  assert.equal(signedIn.clientId, "client_1");
});

test("a wrong password gets no code", async (t) => {
  const node = await standInNode();
  t.after(node.close);
  await assert.rejects(signInForToken({ mcpUrl: `${node.origin}/mcp`, username: "emsenn.claude", password: "wrong" }), /password sign-in was refused \(401\)/u);
  assert.equal(node.state.tokens.length, 0);
});

test("a registered client is reused rather than registered again", async (t) => {
  const node = await standInNode();
  t.after(node.close);
  const first = await signInForToken({ mcpUrl: `${node.origin}/mcp`, username: "emsenn.claude", password: "correct horse" });
  await signInForToken({ mcpUrl: `${node.origin}/mcp`, username: "emsenn.claude", password: "correct horse", clientId: first.clientId });
  assert.equal(node.state.registrations, 1);
});

test("the token cache keeps a token mode 0600 until it expires, and its client after", (t) => {
  const runtime = mkdtempSync(path.join(tmpdir(), "claude-sign-in-test-"));
  t.after(() => rmSync(runtime, { recursive: true, force: true }));
  let now = 1_000_000;
  const cache = tokenCache({ runtimeDirectory: runtime, now: () => now });
  assert.equal(cache.read("http://n/mcp", "alice"), undefined);
  cache.write("http://n/mcp", "alice", { accessToken: "tok", expiresInSeconds: 3600, clientId: "client_1" });
  const file = cache.fileOf("http://n/mcp", "alice");
  assert.ok(file.startsWith(runtime));
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(statSync(path.dirname(file)).mode & 0o777, 0o700);
  assert.equal(cache.read("http://n/mcp", "alice").accessToken, "tok");
  assert.equal(cache.read("http://n/mcp", "bob"), undefined);
  now += 3_600_000;
  assert.equal(cache.read("http://n/mcp", "alice"), undefined);
  assert.equal(cache.clientOf("http://n/mcp", "alice"), "client_1");
  assert.throws(() => tokenCache({ runtimeDirectory: undefined }), /XDG_RUNTIME_DIR/u);
});

test("headers sign in once, then answer from the cache, naming the session when it is told", async (t) => {
  const node = await standInNode();
  const runtime = mkdtempSync(path.join(tmpdir(), "claude-sign-in-test-"));
  t.after(() => { node.close(); rmSync(runtime, { recursive: true, force: true }); });
  const cache = tokenCache({ runtimeDirectory: runtime });
  let asked = 0;
  const input = { mcpUrl: `${node.origin}/mcp`, holder: CHARACTER.id, cache, username: () => "emsenn.claude", password: () => { asked += 1; return "correct horse"; } };
  assert.deepEqual(await headersFor({ ...input, sessionId: "s-1" }), { Authorization: "Bearer token-0", "X-Harness-Session": "s-1" });
  assert.deepEqual(await headersFor(input), { Authorization: "Bearer token-0" });
  assert.equal(asked, 1);
  assert.equal(node.state.tokens.length, 1);
  assert.doesNotMatch(readFileSync(cache.fileOf(input.mcpUrl, CHARACTER.id), "utf8"), /correct horse/u);
  assert.deepEqual(authorizationHeaders("t"), { Authorization: "Bearer t" });
});
