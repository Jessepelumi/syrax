export interface AggregateUploadProgressItem {
  confirmedBytes: number;
  sizeBytes: number;
  status: string;
}

export interface AggregateUploadProgress {
  completedFiles: number;
  confirmedBytes: number;
  totalBytes: number;
  totalFiles: number;
}

export function getAggregateUploadProgress(
  items: readonly AggregateUploadProgressItem[],
): AggregateUploadProgress {
  return items.reduce<AggregateUploadProgress>(
    (progress, item) => {
      const sizeBytes = Number.isFinite(item.sizeBytes)
        ? Math.max(0, item.sizeBytes)
        : 0;
      const confirmedBytes = Number.isFinite(item.confirmedBytes)
        ? Math.min(sizeBytes, Math.max(0, item.confirmedBytes))
        : 0;

      return {
        completedFiles:
          progress.completedFiles + (item.status === "COMPLETED" ? 1 : 0),
        confirmedBytes: progress.confirmedBytes + confirmedBytes,
        totalBytes: progress.totalBytes + sizeBytes,
        totalFiles: progress.totalFiles + 1,
      };
    },
    {
      completedFiles: 0,
      confirmedBytes: 0,
      totalBytes: 0,
      totalFiles: 0,
    },
  );
}
