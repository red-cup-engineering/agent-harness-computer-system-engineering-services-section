---
title: "Specification: the agent harness as one platform in use"
description: "Specifies the agent harness as one platform in which Claude Code, Codex, ChatGPT and other providers are configurations over shared upstream software, controlled by a deterministic resource controller, reaching the machine through MCP tools, handing work between agents by context spacesuit, and generated and never handwritten."
date-created: 2026-10-10
type: specification
version: 0.1.0
provenance:
  utterances:
    - ni:///sha-256;Nr0tr1WzT2In1H4-gzsVtxjltVyuSM3pq_mn_g3mwUg
    - ni:///sha-256;5diiQxaS8JB1EkSzz0LRqogY3rKgfuesU2P_99TiiRU
    - ni:///sha-256;6Ojj7s0yyiZ15ebBn6emLriXtvlNtSpC_WThtAMHY30
    - ni:///sha-256;QbiBZFUe-COUpHldLHcPEds8MAjDdJS-RXGgn6CPGfM
    - ni:///sha-256;c0BAdFjNpmYPd6nF4yaOM3kHkzPTbRAOfgQwm4zLVGc
    - ni:///sha-256;z7TW9L6E7roTkyjVk4HHcjvo7Gssu412ItKAI4nX3q4
    - ni:///sha-256;NgAKSoKSG3JlxhyDmWL7xj9iYZmRnLwAxafYdhXa3ik
    - ni:///sha-256;RAnOZnwx1OBCTQUcLeWRkwkYEcGYSR5KBqwgUvtZFyc
    - ni:///sha-256;dyUfYbUFs7lCkSZWKWOw40vu6kihbwwBmCqflft07No
    - ni:///sha-256;jkxTX9h35IUQdG78Lm0DGk7HY59t8hztObD-QsohqKw
    - ni:///sha-256;ZRp4-WejBhM_hMUYCaZT6UAGt6N7Tn6vK-sinbiVUto
    - ni:///sha-256;Luy_nmN3Ba2tff93G6JW7O4BUbsxMVuyr8f3kyMvxP4
    - ni:///sha-256;jWmuKz8kNGXPbYRIXunCBcNMHUngbciOIxrrzxVo7zI
    - ni:///sha-256;MyAcJsgyHBWYs0jTMm3se1394pUmBYY8MbXOTUxG4v4
    - ni:///sha-256;dCfWqNo60ai3THIevuOA1tIROZGZtntiS1lku4lbNJk
    - ni:///sha-256;5m-_Z72bU6SJ17_DCEnXe_EbOc_NKL2SUe212l9UCXE
    - ni:///sha-256;B7Qt9dyYfuusmb3c8HCDGg0_HM7imggmKfbWglrpeVY
    - ni:///sha-256;REqv57hoQKVpuiQzAbQk1lrlxAVVxeoAummlJqEaN6E
    - ni:///sha-256;EVYmaTal4gXivxrfqxkzSv3enMczwrxA22cDWzl5uUg
    - ni:///sha-256;0ntUk8Wz_k1C8tjESYw8wOmGXk0TZKOYfAJSPScrRdQ
    - ni:///sha-256;PQvHbkMcTF9L_Qw7QjmIkpWfv5SxRlJhWamAUGZenKY
    - ni:///sha-256;x2cwn1XbtJe9EJ7O4UbL8oRfyTpZ2v-WjVOjiCKOAMQ
    - ni:///sha-256;gCVd5nLtL_sUylmNvA37jZu5WzU98C2oRhNwNHx3IFA
    - ni:///sha-256;on6olH4Vq6fidY9NxSq5z-3f-b43YwWvyjSe3XX4-ak
    - ni:///sha-256;lWP0r5SXb0YW4S2-YFzu-oBW5i7ECq6ph76pdqwKmTA
    - ni:///sha-256;3WdVVvj0cHXXW09zF4wCc_Ky-TxnZwtV-cvTYAyzryM
    - ni:///sha-256;8Ht98pIFK40M_vmh3TKg7C8Ga8cpn2Mhq1DVOrf8zgg
    - ni:///sha-256;wNGXaIFj1J0cV76Lfg7d-x6wi7Pxd9l4mENh9YiNFL8
    - ni:///sha-256;6wmcO3WjddLLES6dfCVvR2RAtulTHT1i9Z8tqyRRkgk
    - ni:///sha-256;oU5ytBwKYJFfX-lccyjRp_1LMsVyrU5wxzD3Ev-KqTg
    - ni:///sha-256;J21j5QVb0-2riUJjPA-3AKkm9_JKo2le4nzVRoKbb3o
    - ni:///sha-256;cvRjZ5kmKq8fSAlYxJlKuFk8oCpGDgw71rVwHQH9YfM
    - ni:///sha-256;ORswzAu5yektERr7ojvEZj68JxNPpZlGdakKiOtlSMU
    - ni:///sha-256;4niMWT21sP19iqIMiPsdQOo88-6mT7FjpLkPauG36-A
    - ni:///sha-256;fJCiF20H8Ji6_x-im7wvsIT4klJiE_Gr5LfNoO0pnaU
    - ni:///sha-256;sy9T3ODK2txpzZVk7V4GXdBYt1zoCenJSRzQ2ShO2Bw
    - ni:///sha-256;lOEb94td-q33OhdV-E0j4ohRdsHyDe93RIEv9IZrGdg
    - ni:///sha-256;XgFWDfoJn8OOzSIeqSohVR0a9hmWvkJw8fSncapGCpY
    - ni:///sha-256;XyTqEJaD_6Q716ktvSgscsPBLciI3yQR9XMtntZ_cU4
    - ni:///sha-256;MZR8gZxCbPuzuFZfmg20Qotd6CMnuFiVS3pw1PhXhy4
    - ni:///sha-256;WCJBLpS2ZheFr3JY_VWIet5tvsNSWuijms6PYvYxu2s
    - ni:///sha-256;bJiHdL2rZkMNt-1ITtp8hIC1B5VA0vFuUqjchIHwRo4
    - ni:///sha-256;MAGMxvjqX9M5cTz2a7l9JMHH45SJUmixK4zR0hRMUTk
    - ni:///sha-256;4AjPjWs2gRD81Wta81pbgx0pWAHkl-dTis4oYU-eOOI
    - ni:///sha-256;kqV0R7IiEDKPS04yqy-TmrYtb-m3qluxqoMxE_fJDTU
    - ni:///sha-256;rupcPFC4Qr0tE63rULKUtdGxJLDP8flQ0yav8GC3rhg
    - ni:///sha-256;1Z3z8eY24179KcJ4U6ZEESBFWHGtDcHJHCN5WURcXU0
    - ni:///sha-256;L6E8YqJMyuUXwBxSOInYZ6pX8xl3i5U3UOXoEe_1CyA
    - ni:///sha-256;oWg4qItU55CftCgVY-fmp1G_cgz0Imm-UoRQIsFUbII
    - ni:///sha-256;pu7VEls4-mcPYYt62ybvcpMJpMgY1py9opDJuDVUpgM
    - ni:///sha-256;087I2SF74AiBYShOg3nSiNJUkBrRGJbZZ2ITNeaJm08
    - ni:///sha-256;J0mRw263kjjH5C2n-04InWDMzS6pr6YGNh9lYfV2zho
    - ni:///sha-256;dym-Hd4a04ILIejmoxCEoBA32qrpAUrIytaCwcsJSr8
    - ni:///sha-256;6txdCzorQxJsadK0tKEkDV5W6PTwSGRSDvNugG-k_rY
    - ni:///sha-256;4ekzr2f9RJ7_8dT9pAayUD8mENjeAWRghe62-CvbByk
    - ni:///sha-256;PQuF5FP81Qv0JsSL4Hy7I6QwJjgu9lPfpXeUcWrfdi4
    - ni:///sha-256;W5HY4Y8_H-j4RnoH8gmoUbKZuUyNMmRGwRCRwXkiboU
    - ni:///sha-256;bwIpBY9zsqpPEuEUgL2yS9i85uU1RjN74St_7tFgCs0
    - ni:///sha-256;7WA1ZErzxI63tGHzTLdJRZoTU1vSw-irJyRBLmup6Z0
    - ni:///sha-256;dMTvZYRpAdUM7w2FQnomelNjQM4PKofHCA2eqeQFb48
    - ni:///sha-256;C-dYPGviqVkyox6TsDsGZLlGMaikvAow53vcKInGfOw
    - ni:///sha-256;QbtX6B0ovL_cVoOBijx8X9nwzetT0XR0aMndZnjMmPY
    - ni:///sha-256;F_Z9aOWIFF0bdCvMd_2ILGVzblAE3mrm1cvYaWAJfBo
    - ni:///sha-256;esWqZCNS-SY3kDPVt2yjTuT4TKbyj5e1rkW0sZc10og
    - ni:///sha-256;fPW8hF43-2kcRTcRZ-jhCOYXj0DGqWblAtRuqJqrd10
    - ni:///sha-256;O5tszvZH-u4PhjVTGurKebeGlPmOx61s6GNfu4xbhgk
    - ni:///sha-256;Pt3hmvumA0Gx6q1HRZzvyXsc2ll69nh-0_jqis-YT4U
    - ni:///sha-256;AgSUSn8MGldlBIRdnVM7oupjTOr0gG46fzNHWiSfpWc
    - ni:///sha-256;onHYRdPrn7qpzP_dpDmt-FQlGSqwTNVh0o42mQG8UzM
    - ni:///sha-256;vzvBBRCEyr0Z30MoXSjva5KhS5-hxAjDHi4u_aENV2U
    - ni:///sha-256;nSNEKowYVHJZ3TRJJiy9f8iUxqprDoUUr89k3SD9K_0
    - ni:///sha-256;-OhFZVjInf7j81QKzeddyfzePs6dlXCA8u7YSOVEIFc
    - ni:///sha-256;DSFtQi3IreoYCJ4EwsI_bCrvnByQYniQhsY0V3RZ_TE
    - ni:///sha-256;vOwAgVnN3NJiEaaPzvva4elLaoiM0HrqqKeJiLsy3mc
    - ni:///sha-256;2vExbTbz0dHlUmppRYHgcdTqANU33eFqHGAOqUvCLxY
    - ni:///sha-256;epZdXu4K1zKAxYghjfeRhsXVF5P1mrey1CHdNdZ4Gt4
    - ni:///sha-256;eh8Ax2EgsJHFjiu93vVrWG6PTWqYFip-_EMoNd4S9cQ
    - ni:///sha-256;NxUsZzK2PLC_6FQH6EhIt6PvgocGRIOQX66V3rPOwaA
    - ni:///sha-256;Q15R_D3ypBWMgd2qwERqXP5Xlu6_CklKL0A6juC4zJc
    - ni:///sha-256;6k2dRHKTSQKKfvHgJJKUSNtoGigtJV97CwYvI117IWM
    - ni:///sha-256;kzQ1vqesRmOFToK1TmNSdVCgsGT0kXC6oByK3hi-O2I
    - ni:///sha-256;yiAaWmLIR6fuXuM1sMfD_1IXKEiRqizBumxlrUmPvqI
    - ni:///sha-256;X48Gmd8RplatD9FDwGH6rGOGtUT5UGU6IUQUbrb7Eb8
    - ni:///sha-256;lw1iHZNboCWN214vvV6wNwGD-BFwF-QnfixbEPdIqLE
    - ni:///sha-256;uIwFI2Y5jfxN182bsSGENr1qILb-PSFw1uaP97iq3gk
    - ni:///sha-256;CHpzexk3HKvSjP2VMsU6LKvyselEES46x9AHk24V_84
    - ni:///sha-256;Ffm7KYDWGqRCbynuJk71wRk0UdSRWfA4Kv1a9yBhyCo
    - ni:///sha-256;PRd-zPuyEKkank_J8ocg_YvpBYHNjLc2kfeuXSnD_0s
    - ni:///sha-256;716QY80DCqO1k7BoqG_QtchoFzOzgX-wZI4tN9-bJlM
    - ni:///sha-256;UvF_XVvElhLcYc0N_dZH-BVlQk5Kiqg5ryjaA6HgZTg
    - ni:///sha-256;V4GsjSyaYuR2z8FeiYrk0E80pBEV6SOpPGLsg9w_m0Y
    - ni:///sha-256;NXrW-FIYe2G6B9t4Bp7CpcgKx3Ai-RmVQMiqK59B3CI
  requirements: content/requirements/the-agent-harness-is-one-platform-in-use.json
  theory: the 2026-10-10 note on how agents fail in this environment, in agent-harness-science-services-section
---

## 1. Scope

This specification realizes requirements R1 to R31 of `the-agent-harness-is-one-platform-in-use`. It is a high-level design. It names no code to write and no agent to write it; it places each function at the section that owns it, by the rule that science holds theory, engineering derives generic tools, operations parameterizes them, and the 561 Group and public services compose them.

## 2. Platformization

The harness is platformized, not normalized. Two leaves are not merged; every piece of harness code is made a live, conformant part of one system. The survey that begins it covers the Bare Cedar Fog machine, the legacy cold-red-gate VPS and GitHub, for Codex, Claude and other agent-harness and orchestration code, and records each find with a judgment (aligned, misaligned, superseded, landed) before anything is deleted. Code in the legacy tree that offers a capability the current architecture lacks is migrated before it is retired; it is never deleted blind. Stale copies on the server are retired once their capability lives in the platform.

## 3. Structure

| Layer | Holds | Owner |
|---|---|---|
| Upstream engine | computer-system-engine; git-engine, jsnode-engine and the like as specializations | computer-systems-engineering/apps |
| Platform | computer-system-platform: hosts apps, lets them talk to the engine | computer-systems-engineering/apps |
| Provider configuration | one configuration per provider (Claude Code, Codex, ChatGPT Web, ChatGPT Dot, Claude Cloud, Codex Cloud, Antigravity) over the same upstream | the provider's harness section (claude-code-harness-services-section and siblings) |
| Projection | generation of .claude, .agents, dev/, .mcp.json and permission mode from office records; nothing handwritten | this section's projector |
| Resource controller | deterministic limits on concurrent agents, memory, paging and disk I/O | this section |
| Tool surface | MCP tools: git without disc scans, local-jsnode-package-search, planning, SPARQL over datasets, knowledge lookup | this section and the knowledge system |
| Handoff | context spacesuits and records through which work passes between agents | multi-agent sections |

## 4. Behaviors

1. Every provider is a configuration. A provider-specific rule, hook or script is a parameter of the shared upstream; a divergence between Claude and Codex is a defect (R1, R2).
2. Agent calls that touch machine resources pass through the local handler platform. The resource controller measures memory, paging, disk I/O and agent count and acts by threshold, not by model reasoning; the concurrent-agent ceiling is its parameter. The house rule of four local agents is the present value, against the Leader's 2026-09-10 figure of about twelve (R3, R4).
3. Git: agents reach history, status and search through tools that do not read the whole disc, and a commit or checkout never discards another agent's uncommitted work; routine git operations are never blocked by the harness's own classifier (R5, R6, R7).
4. The projector writes the whole of the harness from upstream software, including MCP configuration without disabled servers (ops_, LSpace) and with no hardcoded identity, and sets the permission mode of projected agents in one place (R8, R15, R18, R26).
5. Rules are subject-predicate-object statements checkable by program; a conformance check on services-section names is the first such check (R9, R10).
6. Anything an agent installs into a provider's configuration (scheduled jobs, hooks, keys, extra worktrees) is recorded, approved and removable by a documented step; a blocked deletion is a defect of the harness to repair, not a stopping point (R12, R13).
7. The planning engine is one file with one log, named consistently as file and MCP tool (R14). The local JavaScript package search carries its honest name (R16). bare-cedar-fog-server is a persistent-linux-machine-server instance giving the local machine through its engines (R17). No MCP server scans the whole repository (R19).
8. computer-platform is renamed computer-system-platform, downstream of computer-system-engine. The directory exists on main; its remaining consumers file-touch, mcp-tool, serve-web and workspace-analysis move to networking or to computer-X-system/apps/computer-X-engine (R20, R21).
9. The markdown stack is built layer by layer, data, content, text, markdown, in a markdown-engineering-services-section with the legacy duplicates retired and the vault MCP repointed (R22).
10. Knowledge lookup answers from synthesized knowledge in the knowledge system, so agents stop re-searching the repo. SPARQL over the datasets and MCP tools replace routine Bash, grep and file edits. Arithmetic is code (R23, R24, R25).
11. Provider and model selection is configuration: providers and models are hot-swapped; Claude can be denied now and re-enabled later; Codex runs at a level chosen by task size (the 5.6 Sol class for large software, the 5.6 Luna class for small tweaks as the Leader named them on 2026-09-28) (R28).
12. The harness coordinates concurrent agents of several providers, including ChatGPT Web pulses at about twenty an hour, as one multi-agent system; work passes between agents with a context spacesuit and the records it needs (R29, R31). No Group knowledge sits in a provider's private memory (R27). Cloud agents work as first-class citizens over clean repositories, CI/CD, credentials, packages and registry (R30).
13. A new session starts within a measured time (R11).

## 5. Obsmetrologia

The coordination framework of rule `complex-inter-office-conflict-uses-formal-coordination` applies where offices disagree about harness state; this specification adds no Obsmetrologia result of its own.

## 6. Verification

Inspection: each requirement R1 to R31 has a conformance check placed with its owner. Demonstration: a Claude Code session and a Codex session projected from the same upstream differ only in provider configuration files.

## 7. Clone custody after a failed directory change

The existing host-resource controller MUST refuse a clone whose destination
cannot be resolved within its existing scratch-custody contract. A directory
named by `cd` or `pushd` is not an observed successful directory change. In
particular, a missing directory followed by `; git clone` MUST NOT acquire
permission from that intended directory. An unresolved inferred repository
basename MUST NOT silently bypass clone custody.

The shared `host-resource-hook.mjs` remains the owner and the directly consumed
Claude/Codex entry; no second hook, configuration or shell wrapper is introduced.
Its existing scan-directory heuristic remains separate from a clone-directory
candidate. A literal directory change supplies that candidate only when the
target currently exists as a directory; an unknown or missing target invalidates
it. Explicit absolute clone destinations remain independently judgeable by the
existing custody rule. Relative destinations require the candidate; an omitted
destination additionally requires a resolvable source basename. Nested shell
and Git `-C` calls carry the same distinction.

This is bounded source maintenance of the existing refusal contract, not a full
Bash control-flow or race proof. It does not prepend `set -e`, execute a clone,
or alter intentional error recovery. Receiving covers the original missing-cd
semicolon loop through the installed hook, an existing directory and permitted
destination, an explicit permitted destination after handled failure, unknown
destination refusal, and unchanged `if ! cd ...; then ...` recovery without a
clone. Native tests use a harmless marker in place of Git effects.

## 8. Open

- The value of the concurrent-agent ceiling for the 8 GB WSL VM.
- Which of the platform's apps already carry file-touch, mcp-tool, serve-web and workspace-analysis.


## Source ownership and measured cost receiving, 2026-10-28

The continuing Leader request is preserved verbatim in the original requirement record under `x-provenance.leader-request-2026-10-28` and native Work `ni:///sha-256;gvYofELy1gvjVhJB0U-YDd2qrsLdAgLp8ZnJ4eIRvt0`. Existing-source maintenance preserves these invariants:

- Qualified office duty and skill references resolve to their current actual section, under an explicit corpus. The Codex projector uses the same address law for both. Discovery holds source references, never copied method bodies. Source custody retains each actual method and its linked-source digests. Moving a method replaces only a reference proven by prior custody; unrelated content, conflicting discovery names and unavailable sources refuse before the received image changes. Original source-only projection custody upgrades before retirement.
- The current user objective governs session context. The journal and headless Codex carrier expose matching original Work without mandating an estate archive search or replacing the assignment with unrelated older obligations. Carrier workspace defaults derive from the section data law; explicit existing resource bindings retain their separate custody.
- Ordinary efficiency conformance uses 32,768 prior-context bytes and 16,384 result bytes, with explicit larger stress inputs available. It measures injected bytes and hook execution, labels token counts as estimates and operating cost as unmeasured, and keeps no invented process or baseline latency measurements. Its tests retire their owned synthetic state.
- The token-accounting checkpoint retains native device, inode, size, modification and change-time coordinates only after a stable complete read. An unchanged read may be reused. Replacement, truncation, same-size mutation and incomplete coordinates cannot establish reuse. A changed transcript reuses an admitted row frontier only when the provider, harness session and measured-event prefix still match; same-inode growth is insufficient. Empty replacement input updates the current summary rather than retaining obsolete usage. This does not yet make a growing transcript incremental or establish an operating cost reduction.

The machine-owned Codex-home record receives the original shared house-context installer through its existing harness scope and hourly timer. Actual installed source invocation, provider trust, running-session uptake, useful work and independent acceptance are distinct receiving conditions. A source test or synthetic result closes none of the unobserved conditions.

The harness selects Organizing `0.8.0-dev.1103` with law-version schema identities and JSON Schema `0.5.2`. The supplier admits competing explicit contracts but refuses ambiguous implicit lookup and conflicting explicit reference closures. Native receiving preserves retained contract identity, allocation validation and mixed-carrier refusal. No global flattening of host and harness Work laws is permitted.

Ordinary house-context startup uses cached carrier state only: no GitHub issue or PR refresh is necessary to inject general context. The original live refresh remains available through explicit `--live-carriers`; `--offline` still prevents it. Reference carriers and checklists must not select unrelated work, and missing context must not redirect the session into a mandatory archive or campaign survey. The active request stays authoritative through both normal and failure paths.
