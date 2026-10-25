import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Mail, MessageSquareText } from "lucide-react";
import { cloud } from "./cloud";
import "./login.css";

type Method = "phone" | "email";
type Challenge = { target: string; verificationId: string; isExistingUser: boolean };

export default function Login({ initialError = "" }: { initialError?: string }) {
  const [method, setMethod] = useState<Method>("phone");
  const [target, setTarget] = useState("");
  const [code, setCode] = useState("");
  const [targetError, setTargetError] = useState("");
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const challenge = useRef<Challenge | null>(null);

  useEffect(() => {
    if (!countdown) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const switchMethod = (next: Method) => {
    setMethod(next); setTarget(""); setCode(""); setTargetError(""); setError(""); setNotice("");
    challenge.current = null;
  };

  const sendCode = async () => {
    const value = target.trim();
    if (method === "phone" && !/^1\d{10}$/.test(value)) { setTargetError("请输入正确的 11 位手机号"); return; }
    if (method === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { setTargetError("请输入有效的邮箱地址"); return; }
    setTargetError(""); setError(""); setSending(true);
    const sent = await cloud.auth.sendOtp(method === "phone" ? { phone: value } : { email: value });
    setSending(false);
    if (sent.error) { setError(sent.error.message); return; }
    challenge.current = { target: value, verificationId: sent.data.verificationId, isExistingUser: sent.data.isExistingUser };
    setCountdown(60);
    setNotice(method === "phone" ? "验证码已发送，请查看短信" : "验证码已发送，请查收邮件");
  };

  const submit = async () => {
    const value = target.trim();
    const pending = challenge.current;
    if (!pending || pending.target !== value) { setError("请先获取当前账号的验证码"); return; }
    if (!code.trim()) { setError("请输入收到的验证码"); return; }
    setError(""); setSubmitting(true);
    const completed = await cloud.auth.verifyOtp({
      ...(method === "phone" ? { phone: pending.target } : { email: pending.target }),
      verificationId: pending.verificationId,
      isExistingUser: pending.isExistingUser,
      token: code.trim(),
    });
    setSubmitting(false);
    if (completed.error) { setError(completed.error.message); return; }
    challenge.current = null;
    // 登录成功，onAuthStateChange 会切换到主界面；这里兜底刷新一次。
    window.location.replace(`${location.pathname}${location.hash}`);
  };

  const oauth = async (provider: "wechat" | "workbuddy") => {
    setError(""); setSubmitting(true);
    const back = new URL(location.href);
    back.pathname = "/";
    for (const key of ["code", "state", "provider"]) back.searchParams.delete(key);
    const { data, error: err } = await cloud.auth.signInWithOAuth({ provider, redirectTo: provider === "workbuddy" ? back.toString() : location.origin });
    if (err) { setSubmitting(false); setError(err.message); return; }
    location.assign(data.url); // 同标签页跳转，保留登录凭据
  };

  return <div className="login">
    <div className="brand">Memo<span>·</span>Dash</div>
    <div className="eyebrow">A LITTLE EVERY DAY</div>
    <h1>让每个单词，<br />在恰好的时候重逢。</h1>
    <p>用科学的间隔重复，把今天的新词，<br />变成明天熟悉的一部分。</p>

    <div className="login-panel">
      <div className="login-tabs" role="tablist" aria-label="登录方式">
        <button role="tab" aria-selected={method === "phone"} className={method === "phone" ? "active" : ""} onClick={() => switchMethod("phone")}>手机号</button>
        <button role="tab" aria-selected={method === "email"} className={method === "email" ? "active" : ""} onClick={() => switchMethod("email")}>邮箱</button>
      </div>
      <form onSubmit={e => { e.preventDefault(); submit(); }}>
        <label className="login-field">
          {method === "phone" ? <MessageSquareText size={16} /> : <Mail size={16} />}
          <input
            value={target}
            onChange={e => { setTarget(e.target.value); setTargetError(""); }}
            placeholder={method === "phone" ? "输入 11 位手机号" : "输入邮箱地址"}
            inputMode={method === "phone" ? "numeric" : "email"}
            autoComplete={method === "phone" ? "tel" : "email"}
            maxLength={method === "phone" ? 11 : 120}
            aria-label={method === "phone" ? "手机号" : "邮箱"}
          />
        </label>
        {targetError && <p className="login-field-error" role="alert">{targetError}</p>}
        <div className="login-code-row">
          <label className="login-field">
            <input
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="验证码"
              inputMode="numeric"
              maxLength={8}
              aria-label="验证码"
            />
          </label>
          <button type="button" className="button" disabled={sending || countdown > 0} onClick={sendCode}>
            {sending ? "发送中…" : countdown > 0 ? `${countdown}s 后重发` : "获取验证码"}
          </button>
        </div>
        <button type="submit" className="button primary login-submit" disabled={submitting}>
          {submitting ? "正在登录…" : "登录 / 注册"}<ArrowUpRight size={16} />
        </button>
      </form>
      <div className="login-divider"><span>或使用其他方式</span></div>
      <div className="login-oauth">
        <button className="button" disabled={submitting} onClick={() => oauth("wechat")}>微信扫码登录</button>
        <button className="button" disabled={submitting} onClick={() => oauth("workbuddy")}>使用 WorkBuddy 登录</button>
      </div>
      {error && <p className="login-error" role="alert">{error}</p>}
      {notice && !error && <p className="login-notice" role="status">{notice}</p>}
    </div>
    <small>学习记录随账号保存 · 在不同设备间继续学习</small>
  </div>;
}
