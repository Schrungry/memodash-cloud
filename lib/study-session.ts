import type { Word } from "./types";

export type PreparedCard = {word:null; due?:number; reason?:string; nextDue?:string | null} | {
  word:Word; version:number; isNew:boolean; outcomes:{due:string}[]; due:number; next?:PreparedCard;
};
export type VisibleCard = PreparedCard & {cardKey:string; initialRevealed?:boolean; unavailable?:boolean};
type State = {card:VisibleCard | null; loading:boolean; saving:boolean};
type Request = (path:string, body?:unknown)=>Promise<any>;

// A session owns request IDs and timing, so speculative display never submits
// the previous card's version or records prefetch time as study time.
export class StudySession {
  private state:State = {card:null,loading:false,saving:false};
  private listeners=new Set<()=>void>();
  private generation=0;
  private started=0;
  private pendingReview:Promise<boolean> | null=null;
  private request:Request;
  private now:()=>number;
  private uuid:()=>string;
  constructor(request:Request, now=()=>Date.now(), uuid:()=>string=()=>crypto.randomUUID()) {
    this.request=request;this.now=now;this.uuid=uuid;
  }
  getSnapshot=()=>this.state;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private update(patch:Partial<State>){this.state={...this.state,...patch};for(const listener of this.listeners)listener();}
  private show(card:PreparedCard){
    this.started=this.now();
    this.update({card:{...card,cardKey:this.uuid()},loading:false});
  }
  invalidate=()=>{this.generation++;this.update({card:null,loading:false});};
  load=async()=>{
    const generation=++this.generation;
    this.update({card:null,loading:true});
    try{
      // Returning to study while a save is pending must read after that save.
      await this.pendingReview?.catch(()=>{});
      if(generation!==this.generation)return;
      const card=await this.request("study");
      if(generation===this.generation)this.show(card);
    }catch(error){if(generation===this.generation)throw error;}
    finally{if(generation===this.generation)this.update({loading:false});}
  };
  rate=(rating:number):Promise<boolean>=>{
    const current=this.state.card;
    if(this.pendingReview||this.state.saving||this.state.loading||!current?.word||current.unavailable)return Promise.resolve(false);
    const generation=this.generation, started=this.started;
    const prepared=current.next?.word?current.next:undefined;
    const body={wordId:current.word.id,version:current.version,rating,requestId:current.cardKey,duration:this.now()-started,includeNext:true,
      ...(prepared?{preparedNext:{wordId:prepared.word.id,version:prepared.version}}:{})};
    this.update({saving:true});
    // Only a real prepared word is shown optimistically; completion is announced
    // after saving. Scoring stays locked until the server confirms the queue.
    if(prepared)this.show(prepared);
    const task=(async()=>{
      let saved=false;
      try{
        const response=await Promise.resolve().then(()=>this.request("review",body));
        saved=true;
        if(generation!==this.generation)return true;
        let next:PreparedCard;
        if(response.next)next=response.next;
        else{
          if(!prepared)this.update({card:null,loading:true});
          next=await this.request("study");
        }
        if(generation===this.generation){
          const displayed=this.state.card;
          if(prepared&&displayed?.word){
            if(!next.word||displayed.word.id!==next.word.id||displayed.version!==next.version)
              throw new Error("当前卡片已更新或今日额度已变化，请刷新学习队列后继续。");
            // Confirmation can prepare the following card, never replace the
            // visible word, its answer state, request ID, or study timer.
            this.update({card:{...displayed,next:next.next}});
          }else this.show(next);
        }
        return true;
      }catch(error){
        if(generation===this.generation){
          if(!saved){this.started=started;this.update({card:{...current,initialRevealed:true},loading:false});}
          else this.update({card:prepared&&this.state.card?{...this.state.card,unavailable:true}:null,loading:false});
        }
        throw error;
      }finally{
        this.pendingReview=null;
        this.update({saving:false});
      }
    })();
    this.pendingReview=task;
    return task;
  };
}
