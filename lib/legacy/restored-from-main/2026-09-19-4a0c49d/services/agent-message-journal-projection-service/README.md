# Agent message journal projection service

This service owns pure message admission, journal folding, bounded reading, and
Knowing lesson projection. It does not read or write journals and performs no
network inference. Applications compose those effects around these carriers.
