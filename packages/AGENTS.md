# Provider-backed packages

- Do not duplicate validation already owned by an upstream provider. Pass provider-facing inputs
  through and normalize the provider's response, including HTTP 4xx errors.
- Validate only package-owned invariants, such as local schema conversion/parsing, or inputs that
  must be checked before executing local code safely.
- Do feel free to "steer." Meaning if a field "location" for a upstream provider expects a location to be iso format. `isLocation` may be a fitting variable name.
