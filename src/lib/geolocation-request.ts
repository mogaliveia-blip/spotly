type PositionRequest = (() => Promise<GeolocationPosition>) & {
  watchPosition: (position: GeolocationPosition) => void;
  watchError: (error: GeolocationPositionError) => void;
  setWatching: (active: boolean) => void;
};

/** One pending fix can be satisfied by the quick request or the existing position watch. */
export function createSharedGeolocationRequest(
  geolocation: Pick<Geolocation, 'getCurrentPosition'>,
  onPosition: (position: GeolocationPosition) => void,
  onError: (error: GeolocationPositionError) => void,
  timeoutMs = 11_000,
): PositionRequest {
  type Pending = {
    promise: Promise<GeolocationPosition>;
    resolve: (position: GeolocationPosition) => void;
    reject: (error: GeolocationPositionError) => void;
    timer: ReturnType<typeof setTimeout>;
    quickError: GeolocationPositionError | null;
    watchError: GeolocationPositionError | null;
  };
  let pending: Pending | null = null;
  let lastPosition: GeolocationPosition | null = null;
  let lastWatchError: GeolocationPositionError | null = null;
  let watching = true;

  const finish = (attempt: Pending, position?: GeolocationPosition, error?: GeolocationPositionError) => {
    if (pending !== attempt) return;
    clearTimeout(attempt.timer);
    pending = null;
    if (position) attempt.resolve(position);
    else if (error) {
      onError(error);
      attempt.reject(error);
    }
  };

  const acceptPosition = (position: GeolocationPosition) => {
    lastPosition = position;
    lastWatchError = null;
    onPosition(position);
    if (pending) finish(pending, position);
  };

  const rejectIfExhausted = () => {
    if (!pending?.quickError || (watching && !pending.watchError)) return;
    const error = pending.quickError.code === 1 ? pending.quickError :
      pending.watchError?.code === 1 ? pending.watchError : pending.quickError;
    finish(pending, undefined, error);
  };

  const request = (() => {
    if (lastPosition) return Promise.resolve(lastPosition);
    if (pending) return pending.promise;

    let resolve!: Pending['resolve'];
    let reject!: Pending['reject'];
    const promise = new Promise<GeolocationPosition>((done, fail) => { resolve = done; reject = fail; });
    const attempt: Pending = {
      promise, resolve, reject,
      timer: setTimeout(() => {
        const timeout = { code: 3, message: 'Geolocation timed out' } as GeolocationPositionError;
        finish(attempt, undefined, timeout);
      }, timeoutMs),
      quickError: null,
      watchError: lastWatchError,
    };
    pending = attempt;
    try {
      geolocation.getCurrentPosition(
        acceptPosition,
        (error) => {
          if (pending !== attempt) return;
          attempt.quickError = error;
          rejectIfExhausted();
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 30000 },
      );
    } catch (error) {
      attempt.quickError = { code: 2, message: String(error) } as GeolocationPositionError;
      rejectIfExhausted();
    }
    return promise;
  }) as PositionRequest;

  request.watchPosition = acceptPosition;
  request.watchError = (error) => {
    lastWatchError = error;
    if (pending) {
      pending.watchError = error;
      rejectIfExhausted();
    } else if (!lastPosition) {
      onError(error);
    }
  };
  request.setWatching = (active) => {
    watching = active;
    rejectIfExhausted();
  };
  return request;
}
