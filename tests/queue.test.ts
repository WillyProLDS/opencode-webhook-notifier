import { describe, expect, it, vi } from "vitest";
import { createBoundedQueue } from "../src/util/queue.js";

describe("createBoundedQueue", () => {
  it("enqueue/dequeue FIFO order", () => {
    const q = createBoundedQueue<number>({ maxSize: 5 });
    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);
    expect(q.dequeue()).toBe(1);
    expect(q.dequeue()).toBe(2);
    expect(q.dequeue()).toBe(3);
    expect(q.dequeue()).toBeUndefined();
  });

  it("drops oldest when maxSize is exceeded", () => {
    const onDrop = vi.fn();
    const q = createBoundedQueue<number>({ maxSize: 3, onDrop });

    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);
    q.enqueue(4);

    expect(q.size()).toBe(3);
    expect(onDrop).toHaveBeenCalledWith(1);
    expect(q.dequeue()).toBe(2);
  });

  it("clear empties queue without invoking onDrop", () => {
    const onDrop = vi.fn();
    const q = createBoundedQueue<number>({ maxSize: 5, onDrop });
    q.enqueue(1);
    q.enqueue(2);
    q.clear();
    expect(q.size()).toBe(0);
    expect(onDrop).not.toHaveBeenCalled();
  });
});
