export interface BoundedQueueOptions<T> {
  maxSize: number;
  onDrop?: (dropped: T) => void;
}

export interface BoundedQueue<T> {
  enqueue(item: T): boolean;
  dequeue(): T | undefined;
  size(): number;
  clear(): void;
}

export function createBoundedQueue<T>(options: BoundedQueueOptions<T>): BoundedQueue<T> {
  const buffer: T[] = [];

  return {
    enqueue(item) {
      if (buffer.length >= options.maxSize) {
        const dropped = buffer.shift();
        if (dropped !== undefined) options.onDrop?.(dropped);
      }
      buffer.push(item);
      return true;
    },
    dequeue() {
      return buffer.shift();
    },
    size() {
      return buffer.length;
    },
    clear() {
      buffer.length = 0;
    },
  };
}
