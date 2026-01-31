import { createWorker, PSM, type Worker } from "tesseract.js";

const LANG = "fin+swe";
let workerPromise: Promise<Worker> | null = null;
let workerInstance: Worker | null = null;

export async function getWorker(): Promise<Worker> {
  if (workerInstance) return workerInstance;
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker();
      await worker.loadLanguage(LANG);
      await worker.initialize(LANG);
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK, // PSM 6
      });
      workerInstance = worker;
      return worker;
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
