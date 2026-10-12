---
name: character-resource-file
description: A markdown-resource-file that additionally carries the predication cells characteristic of the character form — the dispositional nucleus identifying which acts are in-character and which are not.
specializing: markdown-resource-file
realizing: character
references:
  - id: maclane1971
    type: book
    title: Categories for the Working Mathematician
    publisher: Springer
    location: New York
    author:
      - literal: Mac Lane, Saunders
    issued:
      - year: 1971
---

A **character-resource-file** is a markdown-resource-file $F$ whose frontmatter mapping carries the predication cells characteristic of the character form: an identity (`name`), the dispositional cells (skills the character habitually wields, attitudes, voice cells) that constitute the character's nucleus $\chi$ on the Heyting algebra of the entity's fiber, and the governance cells (governance-regime, memory-source, soul-source) that situate the character in its containing collective.

The joint type is the pullback [@maclane1971, ch. III §3] in the diagram $$\begin{array}{ccc} \mathbf{CharacterResourceFile} & \longrightarrow & \mathbf{Character} \\ \downarrow & & \downarrow \\ \mathbf{MarkdownResourceFile} & \xrightarrow{\;\rho\;} & \mathbf{Character} \end{array}$$ where the realizing functor $\rho$ projects the frontmatter cells onto the components of a character — its identity, its $\chi$-nucleus, its skills generator-set, and its governance regime.

A character-resource-file typically appears as the principal record of a multi-file directory whose other entries supply the character's diary, memory, and per-character configuration.
The realizing cell records the projection from this principal file to the character; the directory-level realization is recorded separately on the containing resource-directory.
