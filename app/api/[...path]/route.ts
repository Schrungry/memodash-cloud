import { getChatGPTUser } from "../../chatgpt-auth";
import { HttpError, overview, nextCard, submitReview, saveSettings, validateSettings, customFor, addWord, updateWord, deleteWord, history, wordHistory, exportBackup, importBackup } from "../../../lib/server";
import { catalog, loadBook, lookupBookWords } from "../../../lib/books";
export const dynamic="force-dynamic";
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"private, no-store","Vary":"Cookie"}});
async function handle(request:Request, context:{params:Promise<{path:string[]}>}) {
  try {
    const user=await getChatGPTUser();if(!user)throw new HttpError(401,"请先登录");
    const {path}=await context.params; const route=path.join("/"); const url=new URL(request.url);
    if(request.method==="GET") {
      if(route==="overview")return json(await overview(user.userId));
      if(route==="study")return json(await nextCard(user.userId,url.origin));
      if(route==="words")return json({words:await customFor(user.userId)});
      if(route==="words/lookup"){
        const query=url.searchParams.get("q")||"";
        if(!query.trim()||query.length>120)throw new HttpError(400,"请输入不超过 120 字符的单词");
        return json(await lookupBookWords(query,url.origin));
      }
      if(route==="words/source"){
        const bookId=url.searchParams.get("bookId"),wordId=url.searchParams.get("wordId");
        if(!bookId||!catalog.some(book=>book.id===bookId)||!wordId||wordId.length>200||!wordId.startsWith(`${bookId}:`))throw new HttpError(400,"词书来源无效");
        const word=(await loadBook(bookId,url.origin)).find(word=>word.id===wordId);
        if(!word)throw new HttpError(404,"词条不存在");
        return json({word});
      }
      if(route==="backup")return json(await exportBackup(user.userId));
      if(route==="history") {const p=Number(url.searchParams.get("page")||0),q=url.searchParams.get("q")||"";if(!Number.isInteger(p)||p<0||p>10000||q.length>120)throw new HttpError(400,"页码或搜索内容无效");return json(await history(user.userId,url.origin,p,q));}
      if(route==="history/word") {const id=url.searchParams.get("wordId");if(!id||id.length>200)throw new HttpError(400,"单词编号无效");return json(await wordHistory(user.userId,url.origin,id));}
    }
    if(request.method==="POST") {
      const reader=request.body?.getReader();let size=0;const parts:Uint8Array[]=[];
      if(reader)while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>250_000){await reader.cancel();throw new HttpError(413,"请求内容过大");}parts.push(chunk.value);}
      if(request.headers.get("origin")!==url.origin)throw new HttpError(403,"请求来源无效");
      if(!request.headers.get("content-type")?.startsWith("application/json"))throw new HttpError(415,"请使用 JSON 格式");
      const buffer=new Uint8Array(size);let offset=0;for(const part of parts){buffer.set(part,offset);offset+=part.byteLength;}const raw=new TextDecoder().decode(buffer);
      let body;try{body=JSON.parse(raw);}catch{throw new HttpError(400,"JSON 格式无效");}
      if(route==="review")return json(await submitReview(user.userId,body,url.origin));
      if(route==="settings"){const s=validateSettings(body);await saveSettings(user.userId,s);return json({settings:s});}
      if(route==="words")return json(await addWord(user.userId,body));
      if(route==="words/update")return json(await updateWord(user.userId,body));
      if(route==="words/delete")return json(await deleteWord(user.userId,body));
      if(route==="import")return json(await importBackup(user.userId,body));
    }
    throw new HttpError(404,"接口不存在");
  }catch(error){if(error instanceof HttpError)return json({error:error.message},error.status);console.error("MemoDash request failed",error instanceof Error?error.message:"unknown");return json({error:"服务暂时无法完成请求，请稍后重试"},503);}
}
export const GET=handle;export const POST=handle;
