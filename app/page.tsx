import { getChatGPTUser, chatGPTSignInPath } from "./chatgpt-auth";
import MemoDash from "./memodash";
export const dynamic="force-dynamic";
export default async function Home(){
  const user=await getChatGPTUser();
  if(!user)return <div className="login"><div className="brand">Memo<span>·</span>Dash</div><div className="eyebrow">A LITTLE EVERY DAY</div><h1>让每个单词，<br/>在恰好的时候重逢。</h1><p>用科学的间隔重复，把今天的新词，<br/>变成明天熟悉的一部分。</p><a className="button primary" href={chatGPTSignInPath("/")} target="_top">使用 ChatGPT 登录 <span>↗</span></a><small>学习记录随账号保存 · 在不同设备间继续学习</small></div>;
  return <MemoDash user={{name:user.fullName || user.email.split("@")[0],email:user.email}}/>;
}
