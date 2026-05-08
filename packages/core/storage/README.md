# Storage Adapters

Abstracts config and sync state storage behind a common interface.

## Implementations planned

| Adapter | Target | Package |
|---|---|---|
| PropertiesServiceAdapter | Apps Script | Built-in |
| FirestoreAdapter | Marketplace app | firebase-admin |
| DatabaseAdapter | Self-hosted | prisma / pg |

## TODO
- [ ] Define StorageAdapter interface
- [ ] Implement FirestoreAdapter
- [ ] Implement DatabaseAdapter with Prisma
- [ ] Per-user config isolation for multi-tenant self-hosted
