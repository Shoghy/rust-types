import { catch_unwind, panic } from "./panic";
import { type Result } from "./result";

export class Mutex<T> {
  private readonly get: () => T;
  private readonly set: (val: T) => void;

  private unlockers: {
    [key: symbol]: () => void
  } = {};
  private lockers_count = 0;
  private current_locker!: Promise<unknown>;

  constructor(value: T) {
    this.get = () => value;
    this.set = (val: T) => {
      value = val;
    };
  }

  get_lockers_count(): number {
    return this.lockers_count;
  }

  is_locked(): boolean {
    return this.lockers_count > 0;
  }

  /**
   * Unlocks the Mutex, without needing the lockers.
   * ## This function can be error prone its used is not recommended
   */
  forced_unlock() {
    const keys = Object.getOwnPropertySymbols(this.unlockers);
    for (const key of keys) {
      this.unlockers[key]();
    }
  }

  async lock(): Promise<MutexGuard<T>> {
    this.lockers_count += 1;

    const prev_locker = this.current_locker;

    let resolve_promise: () => void = () => { };

    this.current_locker = new Promise((resolve) => {
      const unlocker_key = Symbol();
      this.unlockers[unlocker_key] = () => mutex_guard.unlock();

      resolve_promise = () => {
        this.lockers_count -= 1;
        delete this.unlockers[unlocker_key];
        resolve(undefined);
      };
    });

    const mutex_guard = new MutexGuard(this.get, this.set, resolve_promise);

    await prev_locker;

    return mutex_guard;
  }
}

export class MutexGuard<T> {
  get: () => T;
  set: (val: T) => void;
  unlock: () => void;
  is_locked: () => boolean;

  constructor(get: () => T, set: (val: T) => void, resolver: () => void) {
    this.get = () => get();
    this.set = (val: T) => set(val);

    let is_locked = true;

    this.is_locked = () => is_locked;

    this.unlock = () => {
      if (!is_locked) {
        panic("Calling `unlock` when `MutexGuard` has been unlocked");
      }
      is_locked = false;

      get = () => panic("Calling `get` when `MutexGuard` has been unlocked");
      set = () => panic("Calling `set` when `MutexGuard` has been unlocked");
      resolver();
    };
  }

  try_get(): Result<T, Error> {
    return catch_unwind(this.get);
  }

  try_set(value: T): Result<void, Error> {
    return catch_unwind(() => this.set(value));
  }

  try_unlock(): Result<void, Error> {
    return catch_unwind(this.unlock);
  }
}
