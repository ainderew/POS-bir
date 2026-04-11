/**
 * Camera Audit Service
 * Captures optimized grayscale images for shift audit logging
 * Target: <4KB per image for PostgreSQL BYTEA storage (avoids TOAST overhead)
 */

export interface AuditCaptureResult {
  image: string | null  // Base64-encoded WebP/JPEG or null if failed
  status: 'SUCCESS' | 'NO_DEVICE' | 'PERMISSION_DENIED' | 'ERROR'
  metadata: {
    timestamp: string
    resolution?: string
    originalSize?: number
    compressedSize?: number
    compressionRatio?: number
    error?: string
  }
}

const TARGET_SIZE = 200  // 200x200 pixels
const QUALITY = 0.6      // WebP quality (60%)

/**
 * Capture optimized audit photo from webcam
 *
 * Flow:
 * 1. Request camera access via getUserMedia
 * 2. Capture frame to video element
 * 3. Draw to canvas (200x200)
 * 4. Convert to grayscale
 * 5. Export as WebP at 60% quality
 * 6. Return base64 string
 *
 * @returns Promise<AuditCaptureResult> - Contains image data or null with error details
 */
export async function captureOptimizedAuditPhoto(): Promise<AuditCaptureResult> {
  const timestamp = new Date().toISOString()

  try {
    // Check if mediaDevices API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return {
        image: null,
        status: 'NO_DEVICE',
        metadata: {
          timestamp,
          error: 'Camera API not available in this browser'
        }
      }
    }

    // Request camera access (with timeout — getUserMedia can hang in Electron)
    let stream: MediaStream
    try {
      const streamPromise = navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: TARGET_SIZE },
          height: { ideal: TARGET_SIZE },
          facingMode: 'user'
        },
        audio: false
      })
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Camera timeout')), 5000)
      )
      stream = await Promise.race([streamPromise, timeoutPromise])
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        return {
          image: null,
          status: 'PERMISSION_DENIED',
          metadata: { timestamp, error: 'Camera permission denied by user' }
        }
      }
      return {
        image: null,
        status: 'NO_DEVICE',
        metadata: { timestamp, error: err.message || 'Camera not accessible' }
      }
    }

    // Create video element and capture frame
    const video = document.createElement('video')
    video.srcObject = stream
    video.setAttribute('playsinline', 'true')  // iOS compatibility
    await video.play()

    // Wait for video to be ready (handle race condition + timeout)
    await new Promise<void>((resolve, reject) => {
      // Check if we have enough data (HAVE_CURRENT_DATA = 2)
      if (video.readyState >= 2) {
        resolve()
        return
      }

      const timeout = setTimeout(() => reject(new Error('Video metadata timeout')), 3000)
      
      // Wait for data to be available
      video.onloadeddata = () => {
        clearTimeout(timeout)
        resolve()
      }
    })
    
    // Small delay to allow camera auto-exposure/white balance to settle
    // and avoid capturing the initial black frame
    await new Promise(r => setTimeout(r, 300))

    // Create canvas for processing
    const canvas = document.createElement('canvas')
    canvas.width = TARGET_SIZE
    canvas.height = TARGET_SIZE
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      stream.getTracks().forEach(track => track.stop())
      return {
        image: null,
        status: 'ERROR',
        metadata: { timestamp, error: 'Canvas context not available' }
      }
    }

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, TARGET_SIZE, TARGET_SIZE)

    // Convert to grayscale (reduces file size by ~60%)
    const imageData = ctx.getImageData(0, 0, TARGET_SIZE, TARGET_SIZE)
    const data = imageData.data
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      data[i] = data[i + 1] = data[i + 2] = gray
    }
    ctx.putImageData(imageData, 0, 0)

    // Stop camera stream immediately after capture
    stream.getTracks().forEach(track => track.stop())

    // Export as WebP (best compression)
    const webpDataUrl = canvas.toDataURL('image/webp', QUALITY)

    // Fallback to JPEG if WebP not supported
    const finalDataUrl = webpDataUrl.startsWith('data:image/webp')
      ? webpDataUrl
      : canvas.toDataURL('image/jpeg', QUALITY)

    // Calculate sizes
    const base64Length = finalDataUrl.split(',')[1].length
    const compressedSize = (base64Length * 3) / 4  // Base64 to bytes
    const originalSize = TARGET_SIZE * TARGET_SIZE * 4  // RGBA

    return {
      image: finalDataUrl,
      status: 'SUCCESS',
      metadata: {
        timestamp,
        resolution: `${TARGET_SIZE}x${TARGET_SIZE}`,
        originalSize,
        compressedSize: Math.round(compressedSize),
        compressionRatio: Math.round((1 - compressedSize / originalSize) * 100)
      }
    }

  } catch (err: any) {
    console.error('[audit-service] Capture error:', err)
    return {
      image: null,
      status: 'ERROR',
      metadata: { timestamp, error: err.message || 'Unknown error' }
    }
  }
}

/**
 * Convert base64 data URL to raw base64 string (for BYTEA storage)
 *
 * @param dataUrl - Full data URL (e.g., "data:image/webp;base64,ABC123...")
 * @returns Raw base64 string (e.g., "ABC123...")
 */
export function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.split(',')[1]
}

/**
 * Estimate final storage size in bytes
 *
 * @param base64 - Raw base64 string
 * @returns Size in bytes
 */
export function estimateStorageSize(base64: string): number {
  return (base64.length * 3) / 4
}
