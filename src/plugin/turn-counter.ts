export interface TurnCounter {
  next(): number;
}

export function createTurnCounter(start = 0): TurnCounter {
  let current = start;
  return {
    next(): number {
      current += 1;
      return current;
    },
  };
}
