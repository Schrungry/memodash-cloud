import { createRoot } from "react-dom/client";
import { cloud } from "./cloud";
import Login from "./login";
import MemoDash from "../app/memodash";
import "../app/globals.css";
import "../app/question.css";
import "../app/history.css";

const root = createRoot(document.getElementById("root")!);

function displayUser(user: any) {
  const name = (user?.name && String(user.name)) || (user?.email ? String(user.email).split("@")[0] : "") || "学习者";
  return { name, email: user?.email ? String(user.email) : undefined };
}

function render(session: any, loginError = "") {
  if (session?.user) {
    root.render(<MemoDash user={displayUser(session.user)} />);
  } else {
    root.render(<Login initialError={loginError} />);
  }
}

async function bootstrap() {
  const url = new URL(location.href);
  // OAuth 回调（微信 / WorkBuddy）先于路由守卫处理
  if (url.searchParams.has("code") || url.searchParams.has("error")) {
    const provider = url.searchParams.get("provider");
    if (provider !== "workbuddy" && provider !== "wechat") {
      render(null, "授权回调缺少有效的登录方式，请重新登录。");
      return;
    }
    const handleCallback = provider === "workbuddy" ? cloud.auth.handleWorkBuddyCallback : cloud.auth.handleWechatWebCallback;
    if (typeof handleCallback !== "function") {
      render(null, "暂时无法使用此方式登录，请联系应用管理员。");
      return;
    }
    const { data: session, error } = await handleCallback.call(cloud.auth);
    if (error) { render(null, error.message); return; }
    if (session) {
      for (const key of ["code", "state", "provider"]) url.searchParams.delete(key);
      history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      render(session);
      return;
    }
  }
  const { data: session } = await cloud.auth.getSession();
  render(session || null);
}

cloud.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") render(null);
  else if (event === "SIGNED_IN" && session) render(session);
});

bootstrap();
