import { useEffect, useRef, useState } from 'react';
import { Detection, detectionApi } from '../api/detection';

/** Ignore obsolete responses after Retry, a new photo, or unmounting. */
export function useDetection() {
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedItems, setDetectedItems] = useState<Detection[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [noDetectionMsg, setNoDetectionMsg] = useState(false);
  const requestVersion = useRef(0);
  useEffect(() => () => { requestVersion.current++; }, []);

  const runDetection = async (imageB64: string): Promise<Detection[] | null> => {
    const version = ++requestVersion.current;
    setIsDetecting(true);
    setDetectedItems([]);
    setApiError(null);
    setNoDetectionMsg(false);
    try {
      const data = await detectionApi.detect(imageB64);
      if (version !== requestVersion.current) return null;
      const items = data.detections ?? [];
      setDetectedItems(items);
      setNoDetectionMsg(items.length === 0);
      return items;
    } catch (err: unknown) {
      if (version === requestVersion.current) setApiError(err instanceof Error ? err.message : 'Failed to connect to detection server');
      return null;
    } finally {
      if (version === requestVersion.current) setIsDetecting(false);
    }
  };
  const resetDetection = () => {
    requestVersion.current++;
    setIsDetecting(false);
    setDetectedItems([]);
    setApiError(null);
    setNoDetectionMsg(false);
  };
  return { isDetecting, detectedItems, apiError, noDetectionMsg, runDetection, resetDetection };
}
