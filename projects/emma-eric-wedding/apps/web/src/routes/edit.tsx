import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { WeddingEditor, type WeddingEditorActions } from "../components/wedding-editor.tsx";
import {
  loadWeddingEditor,
  publishWeddingPage,
  restoreWeddingDraft,
  saveWeddingDraft,
} from "../lib/wedding-content-server-functions.ts";
import type { WeddingEditorState } from "../lib/wedding-content-service.ts";

type EditSearch = { readonly error?: string };

export const Route = createFileRoute("/edit")({
  validateSearch: (search: Record<string, unknown>): EditSearch => {
    const error = Reflect.get(search, "error");
    return typeof error === "string" ? { error } : {};
  },
  loader: () => loadWeddingEditor(),
  component: EditRoute,
});

function EditRoute() {
  const loaderData = Route.useLoaderData();
  const search = Route.useSearch();
  if (loaderData.access !== "authorized") {
    return <EditorSignIn access={loaderData.access} oauthError={search.error !== undefined} />;
  }

  return <ConnectedWeddingEditor initialState={loaderData.state} />;
}

function ConnectedWeddingEditor({ initialState }: { readonly initialState: WeddingEditorState }) {
  const saveDraft = useServerFn(saveWeddingDraft);
  const publish = useServerFn(publishWeddingPage);
  const restore = useServerFn(restoreWeddingDraft);
  const actions: WeddingEditorActions = { saveDraft, publish, restore };
  return <WeddingEditor initialState={initialState} actions={actions} />;
}

function EditorSignIn({
  access,
  oauthError,
}: {
  readonly access: "signed-out" | "forbidden";
  readonly oauthError: boolean;
}) {
  const hasError = access === "forbidden" || oauthError;
  return (
    <main className="admin-auth-shell">
      <section className="admin-auth-card">
        <p className="eyebrow">Private wedding editor</p>
        <h1>Emma & Eric</h1>
        <p className="admin-auth-copy">
          Sign in with your own authorized Google account through Breli App.
        </p>
        {hasError ? (
          <p className="admin-auth-error" role="alert">
            {access === "forbidden"
              ? "This account is signed in but does not have wedding editor access."
              : "Sign-in could not be completed. Please try again."}
          </p>
        ) : null}
        {access === "forbidden" ? (
          <form action="/api/auth/sign-out?returnTo=/edit" method="post">
            <button className="button button-primary admin-auth-button" type="submit">
              Sign out and use another account
            </button>
          </form>
        ) : (
          <a
            className="button button-primary admin-auth-button"
            href="/api/auth/sign-in?returnTo=/edit"
          >
            Continue with Google
          </a>
        )}
        <a className="editor-auth-home" href="/">
          Return to the wedding website
        </a>
      </section>
    </main>
  );
}
