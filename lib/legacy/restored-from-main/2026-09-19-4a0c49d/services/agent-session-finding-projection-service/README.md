# Agent Session Finding Projection Service

This service owns the pure session-memory operations formerly fused into the
Operations Manifold `record-finding` executable. It admits one charged finding
as an EAVT event and folds supplied events into finding and recall projections.

It does not locate a repository, read or append a journal, or write a snapshot.
Those effects belong to the application that composes this service with a
witness-journal provider.
