import { createEmptyCard, fsrs, Rating, type Card, type Grade } from "ts-fsrs";
import type { Settings } from "./types";
export function scheduler(settings: Settings) {
  return fsrs({ request_retention: settings.retention, enable_fuzz: false, learning_steps: ["1m", "10m"], relearning_steps: ["10m"], w: [.212,1.2931,2.3065,8.2956,6.4133,.8334,3.0194,.001,1.8722,.1666,.796,1.4835,.0614,.2629,1.6483,.6014,1.8729,.5425,.0912,.0658,.1542] });
}
export function reviveCard(data: string | null, now = new Date()): Card {
  if (!data) return createEmptyCard(now);
  const c = JSON.parse(data); return {...c, due: new Date(c.due), last_review: c.last_review ? new Date(c.last_review) : undefined};
}
export function outcomes(data: string | null, settings: Settings, now = new Date()) {
  const result = scheduler(settings).repeat(reviveCard(data, now), now);
  return [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].map(r => ({rating: r, due: result[r as Grade].card.due.toISOString()}));
}
export function review(data: string | null, rating: number, settings: Settings, now = new Date()) {
  return scheduler(settings).next(reviveCard(data, now), now, rating as Grade).card;
}
export function localDay(timezone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {timeZone: timezone, year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
}
