# Repository Instructions

- Work directly on `main` for this repository.
- Do not create feature branches or pull request branches unless the user explicitly asks for them.
- Commit completed changes and push them directly to `origin/main`.
- Put tests in the owning workspace's `test/` directory; never colocate test files with source files.

## Product delivery

- Deliver end-to-end products by default, not demos, prototypes, or showcase UIs, unless the user explicitly requests one
- Define acceptance criteria around the real user's core workflow before implementation; visual completeness is not product completeness
- Get explicit approval before narrowing scope to an MVP or substituting mocks, canned results, heuristics, manual steps, or placeholders for requested capabilities
- Start new production workspaces with honest empty states, not seeded fictional customer data. Keep fixtures in tests; include demo data or modes only when explicitly requested, clearly labeled, and opt-in
- Verify the core workflow in production from a clean state using non-sensitive, representative inputs and real integrations, including required authentication, persistence, editing, and outputs
- UI polish, passing fixture-based tests, and successful deployment alone do not establish completion. Report unverified requirements and blockers explicitly; do not claim the product is done until the acceptance criteria pass

## Brand identity

- Do not copy another product's complete visual identity into a new product unless the user requests a shared brand
- When `/skill:brand-direction` is invoked, establish the product's brand guideline before UI implementation and preserve the chosen identity afterward
- Treat the product's brand guideline as the visual contract. UI-polish skills refine details and usability within it; they must not replace it with a default house style
