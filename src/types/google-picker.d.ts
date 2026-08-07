export {};

interface GooglePickerCallbackData {
  action: string;
  [key: string]: unknown;
}

interface GooglePickerApi {
  Action: { CANCEL: string; PICKED: string };
  Document: { ID: string };
  DocsView: new (viewId: string) => {
    setIncludeFolders(value: boolean): GooglePickerDocsView;
    setSelectFolderEnabled(value: boolean): GooglePickerDocsView;
  };
  PickerBuilder: new () => {
    addView(view: GooglePickerDocsView): GooglePickerBuilder;
    build(): { setVisible(visible: boolean): void };
    setAppId(appId: string): GooglePickerBuilder;
    setCallback(callback: (data: GooglePickerCallbackData) => void): GooglePickerBuilder;
    setDeveloperKey(apiKey: string): GooglePickerBuilder;
    setOAuthToken(accessToken: string): GooglePickerBuilder;
    setOrigin(origin: string): GooglePickerBuilder;
  };
  Response: { DOCUMENTS: string };
  ViewId: { FOLDERS: string };
}

interface GooglePickerDocsView {
  setIncludeFolders(value: boolean): GooglePickerDocsView;
  setSelectFolderEnabled(value: boolean): GooglePickerDocsView;
}

interface GooglePickerBuilder {
  addView(view: GooglePickerDocsView): GooglePickerBuilder;
  build(): { setVisible(visible: boolean): void };
  setAppId(appId: string): GooglePickerBuilder;
  setCallback(callback: (data: GooglePickerCallbackData) => void): GooglePickerBuilder;
  setDeveloperKey(apiKey: string): GooglePickerBuilder;
  setOAuthToken(accessToken: string): GooglePickerBuilder;
  setOrigin(origin: string): GooglePickerBuilder;
}

declare global {
  interface Window {
    gapi: {
      load(
        api: string,
        options: {
          callback: () => void;
          onerror: () => void;
          ontimeout: () => void;
          timeout: number;
        },
      ): void;
    };
    google?: {
      picker: GooglePickerApi;
    };
  }
}
