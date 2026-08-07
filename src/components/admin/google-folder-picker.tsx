"use client";

import Script from "next/script";
import { useCallback, useState } from "react";

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

export function GoogleFolderPicker({ expectedName }: { expectedName: string }) {
  const [scriptReady, setScriptReady] = useState(false);
  const [state, setState] = useState<PickerState>({ kind: "idle" });

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
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <Script
        id="google-api"
        onError={() =>
          setState({ kind: "error", message: "Google API script could not be loaded." })
        }
        onReady={() => setScriptReady(true)}
        src="https://apis.google.com/js/api.js"
        strategy="afterInteractive"
      />
      <h2 className="text-lg font-semibold text-slate-950">Google Picker</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Required folder: <strong>{expectedName}</strong>. Folder ID stays server-side after
        verification.
      </p>
      <button
        className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full bg-emerald-700 px-6 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
        disabled={!scriptReady || state.kind === "loading"}
        onClick={() => void openPicker()}
        type="button"
      >
        {state.kind === "loading" ? "Checking…" : "Select Drive folder"}
      </button>
      <div aria-live="polite" className="mt-4 min-h-6 text-sm" role="status">
        {state.kind === "error" ? <p className="text-red-700">{state.message}</p> : null}
        {state.kind === "success" ? <p className="text-emerald-700">{state.message}</p> : null}
      </div>
    </section>
  );
}
