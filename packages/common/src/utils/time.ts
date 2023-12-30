export function getTimestampInSeconds(date = new Date()): number {
  return Math.floor(date.getTime() / 1000);
}
