import { request } from './client';
import { ClothingItem } from '../types';

/**
 * One item the YOLO detector found in an uploaded photo.
 * Bbox fields are pixel coords in the original image; absent for manual entries.
 */
export interface Detection extends ClothingItem {
  confidence?: number;
  bbox_x?: number;
  bbox_y?: number;
  bbox_w?: number;
  bbox_h?: number;
}

export const detectionApi = {
  /** Send a base64-encoded photo to the backend for clothing detection. */
  detect: (imageB64: string) =>
    request<{ detections: Detection[] }>('/detect', {
      method: 'POST',
      body: JSON.stringify({ image: imageB64 }),
    }),
};
