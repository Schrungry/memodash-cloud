"use client";

import { useEffect, useRef, useState } from "react";
import { History, RefreshCw, Search, X } from "lucide-react";
import type { HistoryRow, MemoryPoint, WordHistory } from "../lib/types";

const labels=["忘记","困难","记得","轻松"];
const stamp=(value:string|number, timezone:string)=>new Date(value).toLocaleString("zh-CN",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
const percent=(value:number|null)=>value===null?"—":`${value.toFixed(1)}%`;

function MemoryCurve({points,timezone}:{points:MemoryPoint[];timezone:string}) {
  const [active,setActive]=useState<number|null>(null);
  if(!points.length)return <p className="history-muted">目前没有足够的记忆状态绘制曲线。</p>;
  const width=880,height=270,left=48,right=20,top=16,bottom=42;
  const start=points[0].time,end=Math.max(points[points.length-1].time,start+60000);
  const x=(time:number)=>left+(time-start)/(end-start)*(width-left-right);
  const y=(value:number)=>top+(100-value)/100*(height-top-bottom);
  const selected=points[active??points.length-1];
  const path=points.map((point,i)=>`${i?"L":"M"}${x(point.time).toFixed(2)},${y(point.value).toFixed(2)}`).join(" ");
  return <div className="memory-curve">
    <div className="curve-readout"><span>{stamp(selected.time,timezone)}</span><strong>{percent(selected.value)}</strong><small>{selected.phase==="after"?"复习后":selected.phase==="before"?"区间末端":"随时间变化"}</small></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="记忆可提取率变化曲线。每次复习后回升，随后随时间下降。" onPointerLeave={()=>setActive(null)} onPointerMove={event=>{
      const rect=event.currentTarget.getBoundingClientRect(),position=(event.clientX-rect.left)/rect.width*width;
      let best=0;for(let i=1;i<points.length;i++)if(Math.abs(x(points[i].time)-position)<Math.abs(x(points[best].time)-position))best=i;
      setActive(best);
    }}>
      {[0,25,50,75,100].map(value=><g key={value}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)} className="curve-grid"/><text x={left-9} y={y(value)+4} textAnchor="end">{value}%</text></g>)}
      {[0,.25,.5,.75,1].map((fraction,i)=>{const time=start+(end-start)*fraction;return <text key={i} x={x(time)} y={height-13} textAnchor={i===0?"start":i===4?"end":"middle"}>{new Date(time).toLocaleString("zh-CN",{timeZone:timezone,month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false})}</text>;})}
      <path d={path} className="curve-line"/>
      <line x1={x(selected.time)} x2={x(selected.time)} y1={top} y2={height-bottom} className="curve-cursor"/>
      <circle cx={x(selected.time)} cy={y(selected.value)} r="4" className="curve-dot"/>
    </svg>
    <label className="curve-slider">查看时间点<input type="range" min={0} max={points.length-1} value={active??points.length-1} onChange={event=>setActive(Number(event.target.value))} aria-valuetext={`${stamp(selected.time,timezone)}，可提取率 ${percent(selected.value)}`}/></label>
    <p className="history-muted">移动到曲线或拖动滑块查看数值。竖直回升表示一次复习；曲线按实际经过的时间连续估计。</p>
  </div>;
}

export default function LearningHistory({timezone,request}:{timezone:string;request:(path:string)=>Promise<any>}) {
  const [input,setInput]=useState(""),[query,setQuery]=useState(""),[page,setPage]=useState(0);
  const [rows,setRows]=useState<HistoryRow[]>([]),[total,setTotal]=useState(0),[hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [selected,setSelected]=useState<HistoryRow|null>(null),[detail,setDetail]=useState<WordHistory|null>(null),[detailError,setDetailError]=useState(""),[detailPage,setDetailPage]=useState(0),[retry,setRetry]=useState(0);
  const modal=useRef<HTMLElement>(null);
  useEffect(()=>{const timer=setTimeout(()=>{setPage(0);setQuery(input.trim());},250);return()=>clearTimeout(timer);},[input]);
  useEffect(()=>{
    let cancelled=false;setLoading(true);setError("");
    request(`history?page=${page}&q=${encodeURIComponent(query)}`).then(data=>{if(!cancelled){setRows(data.reviews);setTotal(data.total);setHasMore(data.hasMore);}}).catch(e=>{if(!cancelled)setError(e.message);}).finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[page,query,request,retry]);
  useEffect(()=>{
    if(!selected)return;
    let cancelled=false;setDetail(null);setDetailError("");setDetailPage(0);
    request(`history/word?wordId=${encodeURIComponent(selected.word_id)}`).then(data=>{if(!cancelled)setDetail(data);}).catch(e=>{if(!cancelled)setDetailError(e.message);});
    return()=>{cancelled=true;};
  },[selected,request,retry]);
  useEffect(()=>{
    if(!selected)return;
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    modal.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const handler=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();setSelected(null);}
      if(event.key==="Tab"){
        const elements=modal.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]');
        if(!elements?.length)return;
        const first=elements[0],last=elements[elements.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    document.addEventListener("keydown",handler);
    return()=>{document.body.style.overflow=overflow;document.removeEventListener("keydown",handler);previous?.focus();};
  },[selected]);
  const waiting=loading||input.trim()!==query;
  return <>
    <section className="panel history-panel learning-history">
      <div className="history-toolbar"><label className="search"><Search size={17}/><input value={input} onChange={event=>setInput(event.target.value)} maxLength={120} aria-label="搜索单词或中文释义" placeholder="搜索单词或中文释义…"/></label><span className="history-muted">{waiting?"正在读取…":`共 ${total} 个${query?"匹配单词":"已学单词"} · 显示最近一次学习`}</span></div>
      {error?<div className="error" role="alert"><span>{error}</span><button onClick={()=>setRetry(retry+1)}>重试</button></div>:waiting?<div className="loading"><RefreshCw size={24}/><p>正在读取学习记录…</p></div>:rows.length?<div className="table-scroll"><table><thead><tr><th>单词与释义</th><th>来源词书</th><th>回忆情况</th><th>学习时间</th><th>用时</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><button className="history-word-link" onClick={()=>{setDetail(null);setDetailError("");setSelected(row);}} aria-label={`查看 ${row.word} 的记忆曲线和复习记录`}>{row.word}</button><p className="history-meaning">{row.definition||"暂无释义"}</p></td><td className="history-book">{row.bookTitle}</td><td><span className={`rating-tag tag-${row.rating}`}>{labels[row.rating-1]}</span></td><td>{stamp(row.reviewed_at,timezone)}</td><td>{Math.round(row.duration/1000)} 秒</td></tr>)}</tbody></table></div>:<div className="empty-state"><History size={32}/><h2>{query?"没有匹配的学习记录":"第一笔记录，从今天开始"}</h2><p>{query?"试试其他单词片段或中文释义。":"完成学习评分后，记录会自动出现在这里。"}</p></div>}
      <div className="pagination"><button className="button" disabled={!page||waiting} onClick={()=>setPage(page-1)}>上一页</button><span>第 {page+1} / {Math.max(1,Math.ceil(total/50))} 页</span><button className="button" disabled={!hasMore||waiting} onClick={()=>setPage(page+1)}>下一页</button></div>
    </section>
    {selected&&<div className="modal-backdrop" onClick={event=>{if(event.target===event.currentTarget)setSelected(null);}}><section className="modal word-history-modal" role="dialog" aria-modal="true" aria-labelledby="word-history-title" ref={modal}>
      <div className="section-heading"><div><div className="eyebrow">YOUR MEMORY OVER TIME</div><h2 id="word-history-title">{selected.word}</h2><p className="history-muted">{selected.bookTitle}</p></div><button className="icon-button" aria-label="关闭单词学习记录" onClick={()=>setSelected(null)}><X size={22}/></button></div>
      <p className="history-detail-meaning">{selected.definition||"暂无释义"}</p>
      {detailError?<div className="error" role="alert"><span>{detailError}</span><button onClick={()=>setRetry(retry+1)}>重试</button></div>:!detail?<div className="loading"><RefreshCw size={24}/><p>正在计算记忆曲线…</p></div>:<>
        <div className="memory-summary"><div><span>当前可提取率</span><strong>{percent(detail.current)}</strong></div><div><span>当前难度 · 1–10</span><strong>{detail.difficulty===null?"—":detail.difficulty.toFixed(2)}</strong></div><div><span>累计学习</span><strong>{detail.reviews.length}<small> 次</small></strong></div><div><span>下次复习</span><b>{detail.due?stamp(detail.due,timezone):"暂无安排"}</b></div></div>
        <p className="history-muted">难度越高，表示 FSRS 估计这个词越难记住。</p>
        <div className="history-detail-heading"><h3>记忆可提取率 <small>Retrievability</small></h3></div>
        <MemoryCurve points={detail.points} timezone={timezone}/>
        <p className="memory-model-note">这是 FSRS 对“此刻能想起答案的概率”的估计。{detail.estimatedCount>0?`其中 ${detail.estimatedCount} 条早期记录缺少状态快照，按本站模型、当前目标保留率及历次评分回放估算。`:"曲线使用已保存的卡片状态。"}{detail.incomplete?"部分历史记录不完整，曲线仅供参考。":""}</p>
        <div className="history-detail-heading"><h3>历史复习记录</h3><span className="history-muted">{timezone} · 新到旧</span></div>
        <div className="table-scroll"><table><thead><tr><th>学习时间</th><th>回忆情况</th><th>复习前可提取率</th><th>用时</th></tr></thead><tbody>{detail.reviews.slice(detailPage*20,(detailPage+1)*20).map(row=><tr key={row.id}><td>{stamp(row.reviewed_at,timezone)}{row.is_new===1&&<small className="first-learning">首次学习</small>}</td><td><span className={`rating-tag tag-${row.rating}`}>{labels[row.rating-1]}</span></td><td>{percent(row.before)}{row.estimated&&<small className="estimate-tag">估算</small>}</td><td>{Math.round(row.duration/1000)} 秒</td></tr>)}</tbody></table>{!detail.reviews.length&&<p className="history-muted">尚无可展示的复习日志。</p>}</div>
        {detail.reviews.length>20&&<div className="pagination"><button className="button" disabled={!detailPage} onClick={()=>setDetailPage(detailPage-1)}>上一页</button><span>第 {detailPage+1} / {Math.ceil(detail.reviews.length/20)} 页</span><button className="button" disabled={(detailPage+1)*20>=detail.reviews.length} onClick={()=>setDetailPage(detailPage+1)}>下一页</button></div>}
      </>}
    </section></div>}
  </>;
}
