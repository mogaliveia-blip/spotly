import type { DiscoveryCamera } from '@/lib/discovery-geography';

function sameCamera(a: DiscoveryCamera, b: DiscoveryCamera): boolean {
  return Math.abs(a.center.lat - b.center.lat) < 1e-7 &&
    Math.abs(a.center.lng - b.center.lng) < 1e-7 && a.zoom === b.zoom;
}

/** Google Maps zoom/idle events have no source flag; recent input and the requested camera disambiguate them. */
export class DiscoveryMapMovement {
  private userInput = false;
  private manual = false;
  private manualSettled = false;
  private dragging = false;
  private manualZoom: number | null = null;
  private lastManualCamera: DiscoveryCamera | null = null;
  private interruptedTarget: DiscoveryCamera | null = null;
  private target: DiscoveryCamera | null = null;
  private expectedZoom: number | null = null;

  noteUserInput() {
    this.userInput = true;
  }

  beginProgrammatic(target: DiscoveryCamera, currentZoom: number | undefined) {
    this.finishManual();
    this.target = target;
    this.expectedZoom = currentZoom === target.zoom ? null : target.zoom;
  }

  finishManual() {
    this.userInput = false;
    this.manual = false;
    this.manualSettled = false;
    this.dragging = false;
    this.manualZoom = null;
    this.lastManualCamera = null;
    this.interruptedTarget = null;
  }

  private beginManual(): boolean {
    const started = !this.manual || this.manualSettled;
    this.manual = true;
    this.manualSettled = false;
    if (started) {
      this.interruptedTarget = this.target;
      this.manualZoom = null;
      this.lastManualCamera = null;
    }
    this.target = null;
    this.expectedZoom = null;
    return started;
  }

  onDragstart(): boolean {
    this.dragging = true;
    return this.beginManual();
  }

  onDragend() {
    this.dragging = false;
  }

  onZoomChanged(zoom: number | undefined): boolean {
    if (this.target && !this.userInput) {
      if (zoom === this.expectedZoom) {
        this.expectedZoom = null;
        return false;
      }
    }
    if (!this.userInput) return false;
    const started = this.beginManual();
    this.manualZoom = zoom ?? null;
    return started;
  }

  onIdle(camera: DiscoveryCamera, hasBounds: boolean): boolean {
    if (this.manual) {
      if (!hasBounds || this.dragging ||
          (this.manualZoom !== null && camera.zoom !== this.manualZoom) ||
          (this.manualZoom === null && this.interruptedTarget && sameCamera(camera, this.interruptedTarget)) ||
          (this.lastManualCamera && sameCamera(camera, this.lastManualCamera))) return false;
      // A queued idle may precede the final idle of the same gesture.
      this.lastManualCamera = camera;
      this.manualSettled = true;
      this.userInput = false;
      return true;
    }
    if (this.target && sameCamera(camera, this.target)) {
      this.target = null;
      this.expectedZoom = null;
    }
    return false;
  }
}
