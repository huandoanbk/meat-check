import { createWorker, PSM, type Worker } from "tesseract.js";

const LANG = "fin+swe";
let workerPromise: Promise<Worker> | null = null;
let workerInstance: Worker | null = null;

export async function getWorker(): Promise<Worker> {
  if (workerInstance) return workerInstance;
  if (!workerPromise) {
    workerPromise = (async () => {
      try {
        type FullWorker = Worker & {
          loadLanguage: (lang: string) => Promise<void>;
          initialize: (lang: string) => Promise<void>;
          setParameters: (params: Record<string, unknown>) => Promise<void>;
        };
        const worker = (await createWorker()) as FullWorker;
        await worker.loadLanguage(LANG);
        await worker.initialize(LANG);
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK, // PSM 6
        });
        workerInstance = worker;
        return worker;
      } catch (err) {
        workerPromise = null; // allow retry on failure
        throw err;
      }
    })();
  }
  workerInstance = await workerPromise;
  return workerInstance;
}

export async function terminateWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.terminate();
    workerInstance = null;
    workerPromise = null;
  }
}
