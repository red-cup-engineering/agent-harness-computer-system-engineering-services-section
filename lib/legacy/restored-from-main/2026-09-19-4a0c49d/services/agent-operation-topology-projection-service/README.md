# Agent operation topology projection service

This service owns pure transformations over explicit agent-operation carriers:
agent topology, cards, handoff packets, and federation projections. It neither
discovers an application, chooses its agent policy, performs transport, nor
writes a witness journal.

Each script face reads one JSON declaration from standard input and writes one
JSON projection to standard output.
