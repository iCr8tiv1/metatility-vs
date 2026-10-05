# Genesis

Genesis is Metatility's AI Marketing Operating System. Bilden is its first downstream operating customer.

## v0.1 scope

- Command Center
- Supabase authentication and RLS-backed workspace
- agent registry and autonomy levels
- objectives, campaigns, leads, touchpoints, qualifications, opportunities
- event, approval, recommendation, integration, and knowledge-source registries
- Bilden API/event contract

## Architecture

```text
Metatility
  |
  +-- Genesis
       |
       +-- Genesis Director
       +-- Market Intelligence
       +-- Content + SEO
       +-- Lead Intelligence
       +-- Nurture
       +-- Analytics
       |
       +-- Bilden bridge
```

The app is isolated under `apps/genesis` and should remain on `genesis-v0.1` until the first lead -> qualification -> approval -> Bilden handoff -> outcome loop is verified.
