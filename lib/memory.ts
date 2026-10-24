import { type Card, type Grade } from "ts-fsrs";
import { reviveCard, scheduler } from "./study.ts";
import type { MemoryPoint, MemoryReview, Settings } from "./types";

export type ReviewRecord = {id: string; rating: number; reviewed_at: string; duration: number; is_new: number; card_data?: string | null};

export function readMemoryCard(data: unknown): Card | null {
  try {
    const value = typeof data === "string" ? JSON.parse(data) : data;
    if (!value || typeof value !== "object") return null;
    const c = value as Card;
    if (![1,2,3].includes(c.state) || ![c.stability,c.difficulty,c.reps,c.lapses,c.elapsed_days,c.scheduled_days,c.learning_steps].every(n=>typeof n === "number" && Number.isFinite(n) && n >= 0) || c.stability <= 0 || c.stability > 100000 || c.difficulty > 10 || !c.last_review || !Number.isFinite(+new Date(c.last_review)) || !Number.isFinite(+new Date(c.due))) return null;
    return {state:c.state, stability:c.stability, difficulty:c.difficulty, reps:c.reps, lapses:c.lapses, elapsed_days:c.elapsed_days, scheduled_days:c.scheduled_days, learning_steps:c.learning_steps, last_review:new Date(c.last_review), due:new Date(c.due)};
  } catch { return null; }
}

export function memoryTimeline(records: ReviewRecord[], settings: Settings, currentData: string | null, now = new Date()) {
  const fsrs = scheduler(settings);
  const currentCard = readMemoryCard(currentData);
  const sorted = [...records].sort((a,b)=>a.reviewed_at.localeCompare(b.reviewed_at) || a.id.localeCompare(b.id));
  const points: MemoryPoint[] = [], reviews: MemoryReview[] = [];
  const samples = Math.max(1,Math.min(24,Math.floor(800/Math.max(1,sorted.length))));
  let previous: Card | null = null, estimatedCount = 0;
  let incomplete = !!sorted.length && sorted[0].is_new !== 1 && !readMemoryCard(sorted[0].card_data);
  const probability = (card: Card, time: number) => Math.min(100,Math.max(0,fsrs.forgetting_curve(Math.max(0,(time-Number(card.last_review))/86400000),card.stability)*100));
  const decay = (card: Card, to: number) => {
    const from = Number(card.last_review);
    if (to <= from) return;
    for (let i=1;i<=samples;i++) { const time=from+(to-from)*i/samples; points.push({time,value:probability(card,time),phase:i===samples?"before":"decay"}); }
  };
  for (let i=0;i<sorted.length;i++) {
    const record = sorted[i], at = +new Date(record.reviewed_at);
    if (!Number.isFinite(at) || ![1,2,3,4].includes(record.rating)) {incomplete=true;continue;}
    const before = previous ? probability(previous,at) : null;
    if (previous) decay(previous,at);
    let card = readMemoryCard(record.card_data);
    let estimated = !card;
    if (!card && i===sorted.length-1 && currentCard && Number(currentCard.last_review)===at) {card=currentCard;estimated=false;}
    if (!card) card=fsrs.next(previous || reviveCard(null,new Date(at)),new Date(at),record.rating as Grade).card;
    if (estimated) estimatedCount++;
    points.push({time:at,value:100,phase:"after"});
    reviews.push({id:record.id,rating:record.rating,reviewed_at:record.reviewed_at,duration:record.duration,is_new:record.is_new,before,after:100,estimated});
    previous=card;
  }
  if (!previous && currentCard) {previous=currentCard;points.push({time:Number(currentCard.last_review),value:100,phase:"after"});incomplete=true;}
  if (previous) decay(previous,Math.max(+now,Number(previous.last_review)));
  if (currentCard && previous && Number(currentCard.last_review) !== Number(previous.last_review)) incomplete=true;
  return {points,reviews:reviews.reverse(),estimatedCount,incomplete,current:currentCard?probability(currentCard,+now):previous?probability(previous,+now):null,generatedAt:now.toISOString()};
}
