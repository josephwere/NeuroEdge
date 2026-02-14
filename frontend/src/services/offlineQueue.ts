// frontend/src/services/offlineQueue.ts

export interface OfflineCommand {
  id: string;
  type: string;
  payload: any;
  timestamp: number;
}

const STORAGE_KEY = "neuroedge_offline_queue";

/**
 * Retrieve queued commands from localStorage
 */
export const getQueue = (): OfflineCommand[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

/**
 * Add a command to the queue
 */
export const enqueueCommand = (cmd: OfflineCommand) => {
  const queue = getQueue();
  queue.push(cmd);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
};

/**
 * Clear queue
 */
export const clearQueue = () => {
  localStorage.removeItem(STORAGE_KEY);
};
