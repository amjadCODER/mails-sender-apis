"use client";

import { FormEvent, useState } from "react";
import { KeyRound, Loader2, Mail } from "lucide-react";

export default function AccessPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "الكود غير صحيح");
      window.location.replace("/");
    } catch (err) {
      setError((err as Error).message);
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="access-shell" dir="rtl">
      <div className="access-orb access-orb-one" />
      <div className="access-orb access-orb-two" />
      <section className="access-card">
        <div className="access-brand">
          <span className="access-logo"><Mail size={25} /></span>
          <div>
            <p className="access-kicker">منظور تقني</p>
            <h1>Email Sender</h1>
          </div>
        </div>
        <div className="access-copy">
          <span className="access-dots"><i /><i /><i /></span>
          <h2>الدخول لنظام الحملات</h2>
          <p>ادخل كود الشركة للمتابعة إلى لوحة الإرسال</p>
        </div>
        <form onSubmit={submit} className="access-form">
          <label htmlFor="company-code">كود الشركة</label>
          <div className="access-input-wrap">
            <KeyRound size={19} />
            <input
              id="company-code"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="ادخل الكود"
              required
              autoFocus
            />
          </div>
          {error && <p className="access-error" role="alert">{error}</p>}
          <button type="submit" disabled={loading || !code.trim()}>
            {loading ? <><Loader2 className="access-spin" size={18} /> جاري التحقق</> : "دخول النظام"}
          </button>
        </form>
        <p className="access-note">الوصول مخصص لمستخدمي الشركة المصرح لهم</p>
      </section>
    </main>
  );
}
