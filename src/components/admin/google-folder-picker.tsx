"use client";

import Script from "next/script";
import { useCallback, useState, type FormEvent } from "react";

interface PickerConfig {
  accessToken: string;
  apiKey: string;
  appId: string;
  expiresAt: number | null;
}

interface ErrorEnvelope {
  error?: {
    message?: string;
  };
}

type PickerState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "success"; message: string };

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export function GoogleFolderPicker() {
  const [scriptReady, setScriptReady] = useState(false);
  const [state, setState] = useState<PickerState>({ kind: "idle" });
  const [folderName, setFolderName] = useState("");

  const saveFolder = useCallback(
    async (folderId: string) => {
      setState({ kind: "loading" });
      const response = await fetch("/api/drive/destination", {
        body: JSON.stringify({ folderId }),
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const body = await readJson<
        | { displayName: string; status: string; verifiedAt: string }
        | ErrorEnvelope
      >(response);

      if (!response.ok || !("displayName" in body)) {
        const errorBody = body as ErrorEnvelope;
        throw new Error(errorBody.error?.message ?? "Folder verification failed.");
      }

      setState({
        kind: "success",
        message: `${body.displayName} verified. Reloading stored status…`,
      });
      window.location.reload();
    },
    [],
  );

  const createFolder = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setState({ kind: "loading" });

      try {
        const response = await fetch("/api/drive/destination/create", {
          body: JSON.stringify({ name: folderName }),
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const body = await readJson<
          | { displayName: string; status: string; verifiedAt: string }
          | ErrorEnvelope
        >(response);

        if (!response.ok || !("displayName" in body)) {
          const errorBody = body as ErrorEnvelope;
          throw new Error(errorBody.error?.message ?? "Folder creation failed.");
        }

        setState({
          kind: "success",
          message: `${body.displayName} created and selected. Reloading…`,
        });
        window.location.reload();
      } catch (error) {
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "Folder creation failed.",
        });
      }
    },
    [folderName],
  );

  const openPicker = useCallback(async () => {
    if (!scriptReady || !window.gapi) {
      setState({ kind: "error", message: "Google Picker is not ready. Try again." });
      return;
    }

    setState({ kind: "loading" });

    try {
      const configResponse = await fetch("/api/drive/picker-config", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const configBody = await readJson<PickerConfig | ErrorEnvelope>(configResponse);

      if (!configResponse.ok || !("accessToken" in configBody)) {
        const errorBody = configBody as ErrorEnvelope;
        throw new Error(errorBody.error?.message ?? "Google Drive is not connected.");
      }

      await new Promise<void>((resolve, reject) => {
        window.gapi.load("picker", {
          callback: resolve,
          onerror: () => reject(new Error("Google Picker failed to load.")),
          timeout: 10_000,
          ontimeout: () => reject(new Error("Google Picker timed out.")),
        });
      });

      const picker = window.google?.picker;

      if (!picker) {
        throw new Error("Google Picker API is unavailable.");
      }
      const view = new picker.DocsView(picker.ViewId.FOLDERS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true);

      new picker.PickerBuilder()
        .setDeveloperKey(configBody.apiKey)
        .setAppId(configBody.appId)
        .setOAuthToken(configBody.accessToken)
        .setOrigin(window.location.origin)
        .addView(view)
        .setCallback((data) => {
          if (data.action !== picker.Action.PICKED) {
            if (data.action === picker.Action.CANCEL) {
              setState({ kind: "idle" });
            }
            return;
          }

          const documents = data[picker.Response.DOCUMENTS] as
            | Array<Record<string, unknown>>
            | undefined;
          const folderId = documents?.[0]?.[picker.Document.ID];

          if (typeof folderId !== "string" || !folderId) {
            setState({ kind: "error", message: "Picker did not return a folder ID." });
            return;
          }

          void saveFolder(folderId).catch((error: unknown) => {
            setState({
              kind: "error",
              message: error instanceof Error ? error.message : "Folder verification failed.",
            });
          });
        })
        .build()
        .setVisible(true);

      setState({ kind: "idle" });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Google Picker failed.",
      });
    }
  }, [saveFolder, scriptReady]);

  return (
    <section className="mt-8 space-y-6">
      <Script
        id="google-api"
        onError={() =>
          setState({ kind: "error", message: "Google API script could not be loaded." })
        }
        onReady={() => setScriptReady(true)}
        src="https://apis.google.com/js/api.js"
        strategy="afterInteractive"
      />
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Choose an existing folder</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Pick any Google Drive folder where the connected account can add files. Syrax stores its
          immutable folder ID after verification.
        </p>
        <button
          className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full bg-emerald-700 px-6 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
          disabled={!scriptReady || state.kind === "loading"}
          onClick={() => void openPicker()}
          type="button"
        >
          {state.kind === "loading" ? "Working…" : "Select Drive folder"}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Create a new folder</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Create a folder in My Drive and immediately use it as the destination.
        </p>
        <form className="mt-5 space-y-4" onSubmit={createFolder}>
          <div>
            <label className="block text-sm font-semibold text-slate-800" htmlFor="new-folder-name">
              Folder name
            </label>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3"
              disabled={state.kind === "loading"}
              id="new-folder-name"
              maxLength={255}
              onChange={(event) => setFolderName(event.target.value)}
              required
              value={folderName}
            />
          </div>
          <button
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-slate-950 px-6 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={state.kind === "loading" || !folderName.trim()}
            type="submit"
          >
            {state.kind === "loading" ? "Working…" : "Create and select folder"}
          </button>
        </form>
      </div>

      <div aria-live="polite" className="min-h-6 text-sm" role="status">
        {state.kind === "error" ? <p className="text-red-700">{state.message}</p> : null}
        {state.kind === "success" ? <p className="text-emerald-700">{state.message}</p> : null}
      </div>
    </section>
  );
}
